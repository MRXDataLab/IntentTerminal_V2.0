import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from services.llm_client import call_openrouter

router = APIRouter()

class Message(BaseModel):
    role: str  # "user" or "agent"
    content: str

class ParameterScore(BaseModel):
    label: str
    score: int

class ChatRequest(BaseModel):
    messages: List[Message]
    fast_track: bool = False
    template: Optional[str] = None  # e.g. "U&A", "Brand Health", "Market Entry", etc.
    current_scores: Optional[List[ParameterScore]] = None
    context_document: Optional[str] = None
    
class ChatResponse(BaseModel):
    response: str
    is_finalized: bool
    research_intent: Optional[str] = None
    parameters: List[ParameterScore]
    overall_readiness: int

# Hybrid 5-pillar probing system — merges existing scoring dimensions with FRD first-principles pillars
DEFAULT_PARAMETERS = [
    "Market Context & Trigger",
    "Strategic Decision & Goal",
    "Target Lens & Hypothesis",
    "Scope & Assets",
    "Competitive Landscape & Constraints"
]

# Study template briefings — deeply domain-specific probe instructions per template type
TEMPLATE_PREFIXES = {
    "U&A": """STUDY TYPE: Usage & Attitudes (U&A) — Hard-lock all questions to this domain only.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context. 
Quick-Start Questions: 
1. "Which category/product are we focusing on and what usage occasion is shifting?"
2. "What behavioral change needs to be proven?"
3. "Which consumer cohort is being studied?"
Score strictly against these. Do NOT ask generic industry questions.""",

    "Brand Health": """STUDY TYPE: Brand Health Tracker — Hard-lock all questions to this domain only.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Who is the primary rival stealing your mindshare right now?"
2. "What was the specific 'Moment of Doubt' or sales data point that triggered this?"
3. "Which region or product SKU is under the most pressure?"
Score strictly against these. Do NOT ask generic product usage questions.""",

    "Market Entry": """STUDY TYPE: Market Entry / Whitespace Discovery — Hard-lock all questions to this domain only.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Which new market or category is being evaluated, and what catalytic signal triggered this?"
2. "What specific go/no-go decision does this research need to enable?"
3. "Who is the hypothesized target consumer and what are their unmet needs?"
Score strictly against these. Do NOT ask typical interview questions.""",

    "Competitive Pulse": """STUDY TYPE: Competitive Intelligence / Competitive Pulse — Hard-lock all questions to this domain only.
YOUR DIAGNOSTIC FOCUS:
- Market Context & Trigger: Which specific competitor is moving aggressively? What signals have been detected (launch, price cut, media surge, talent hire, distribution push)?
- Strategic Decision & Goal: What strategic counter-response decision does this intel need to enable? (pricing, portfolio, media, channel)
- Target Lens & Hypothesis: Are we studying consumer perception of the competitor OR internal stakeholder intelligence? What is the current theory about the competitor's strategy?
- Scope & Assets: What data already exists (media monitoring, retail panel, social listening, win-loss data, ex-employee interviews)?
- Competitive Landscape & Constraints: Who else is responding to this competitor? Are there indirect/insurgent threats beyond the primary player?
Probe specifically about: competitor strategic intent, consumer-perceived competitive advantage, secondary market signals, response timing.
DO NOT ask generic brand health questions.""",

    "Erosion Study": """STUDY TYPE: Brand / Category Erosion — Hard-lock all questions to this domain only.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "What specific metric is eroding (market share, volume, trial rate) and since when?"
2. "What decision depends on diagnosing this root cause (defensive pricing, re-launch)?"
3. "Who is churning and who is benefiting from the erosion?"
Score strictly against these. Do NOT ask generic awareness or usage questions.""",
}

def build_system_prompt(template: str | None = None, current_scores: List[ParameterScore] | None = None, context_document: str | None = None) -> str:
    template_block = ""
    if template and template in TEMPLATE_PREFIXES:
        template_block = f"\n\n{'='*60}\n{TEMPLATE_PREFIXES[template]}\n{'='*60}\n\nIMPORTANT: Since a study template is active, ALL your questions must be strictly calibrated to this study type. Do not drift into generic research questions."

    context_block = ""
    if context_document:
        # TRUNCATE to 4000 chars to heavily optimize token usage on every chat turn
        truncated_context = context_document[:4000] + ("...\n[TRUNCATED FOR LENGTH]" if len(context_document) > 4000 else "")
        context_block = f"\n\n### UPLOADED RESEARCH CONTEXT\nThe user has supplied the following background document/brief:\n```\n{truncated_context}\n```\nCRITICAL: You MUST parse this document. If the document already answers specific pillars (like market context, target audience, or competitors), SCORE THOSE PILLARS HIGH immediately. Acknowledge what we know from the document, and ONLY ask questions about the remaining gaps."

    scores_block = ""
    if current_scores:
        scores_block = "\n\n### KNOWN PILLAR SCORES (STATE MEMORY)\nYou have ALREADY assessed these pillars in previous turns. You MUST maintain or increase these scores. DO NOT decrease a score below its current state memory:\n"
        for param in current_scores:
            scores_block += f"- {param.label}: {param.score}/100\n"

    return f"""You are the Outtlyr Agent (Teal), a senior research architect and strategic consultant.
Your goal is to deeply understand the client's research intent — not just WHAT they want to study, but WHY it matters right now.{template_block}{context_block}{scores_block}

You are scoring the conversation against 5 hybrid diagnostic pillars:
1. **Market Context & Trigger** — Industry/domain clarity AND the event or crisis forcing this research RIGHT NOW.
2. **Strategic Decision & Goal** — The specific business decision this research must unlock AND the core anxiety driving it.
3. **Target Lens & Hypothesis** — Who is being studied AND what the team already believes to be true.
4. **Scope & Assets** — Geographic/market boundaries AND what internal data already exists as baseline.
5. **Competitive Landscape & Constraints** — Key players AND budget/time/tool constraints limiting the research.

Score each pillar 0-100. Ask ONE short, conversational, and easy-to-understand question at a time targeting the lowest-scoring pillar.
Keep your question under 2 sentences. Do not use complex jargon. Be specific — like a consultant probing for the real problem.
Do NOT ask multiple questions at once.
CRITICAL RULE 1: You must score CUMULATIVELY based on the ENTIRE chat history. Once a pillar reaches a high score (60-100), DO NOT drop its score back to 0 in subsequent turns. Always preserve and build upon the scores from previous messages.
CRITICAL RULE 2 (GUARDRAILS): NEVER ask the user about research methodology. Our platform determines the methodology automatically via the Inference Engine later. DO NOT ask if they want to do surveys, focus groups, structural scraping, or social listening. Scope is strictly about business boundaries, NOT methods.
CRITICAL RULE 3 (OVERRIDE): If the user explicitly states they want to proceed "as is" or without fine-tuning, IMMEDIATELY set 'is_finalized' to true and craft the comprehensive 'research_intent' North Star Statement, regardless of what the pillar scores are.
When ALL 5 pillars ≥ 60, set 'is_finalized' to true and craft a comprehensive 'research_intent' North Star Statement.
CRITICAL RULE 4 (BASELINE INTENT): If a 'context_document' is provided, always attempt to extract a baseline 'research_intent' even if 'is_finalized' is false. This allows the user to skip fine-tuning and proceed with the extracted intent.

ALWAYS respond in this exact JSON format:
{{
  "response": "Your single focused question...",
  "parameters": [
    {{"label": "Market Context & Trigger", "score": 0}},
    {{"label": "Strategic Decision & Goal", "score": 0}},
    {{"label": "Target Lens & Hypothesis", "score": 0}},
    {{"label": "Scope & Assets", "score": 0}},
    {{"label": "Competitive Landscape & Constraints", "score": 0}}
  ],
  "is_finalized": false,
  "research_intent": "Draft/Baseline intent if context is provided, otherwise null"
}}
"""


def process_intake_chat(messages: List[Message], fast_track: bool, template: Optional[str] = None, current_scores: Optional[List[ParameterScore]] = None, context_document: Optional[str] = None) -> "ChatResponse":
    if fast_track:
        intent_text = "# Research Intent Form\n\nFinalized fast-track intent document.\n\n"
        for p in DEFAULT_PARAMETERS:
            intent_text += f"- **{p}**: Captured\n"
        with open("Intent_Form.md", "w") as f:
            f.write(intent_text)
            
        return ChatResponse(
            response="Intent document uploaded successfully. We have fast-tracked the alignment process.",
            is_finalized=True,
            research_intent="Fast-tracked finalized intent.",
            parameters=[ParameterScore(label=p, score=100) for p in DEFAULT_PARAMETERS],
            overall_readiness=100
        )

    # Format history for OpenRouter (limit to last 6 messages to save tokens)
    chat_history = [{"role": m.role if m.role == "user" else "assistant", "content": m.content} for m in messages[-6:]]
    
    system_prompt = build_system_prompt(template, current_scores, context_document)
    llm_result = call_openrouter(
        system_prompt=system_prompt, 
        user_prompt="", 
        chat_history=chat_history, 
        expect_json=True,
        model="google/gemini-2.0-flash-lite-preview:free"
    )
    
    params_data = llm_result.get("parameters", [])
    response_text = llm_result.get("response", "Thank you, could you elaborate?")
    is_finalized = llm_result.get("is_finalized", False)
    research_intent = llm_result.get("research_intent")
    
    # Calculate overall readiness
    params: List[ParameterScore] = []
    total_score = 0
    for p in DEFAULT_PARAMETERS:
        found_score = next((item.get("score", 0) for item in params_data if item.get("label", "").lower() == p.lower()), 0)
        params.append(ParameterScore(label=p, score=found_score))
        total_score += found_score
        
    overall_readiness = int(total_score / len(DEFAULT_PARAMETERS)) if DEFAULT_PARAMETERS else 0

    if is_finalized and research_intent:
        intent_text = f"# Research Intent Form\n\n**North Star:** {research_intent}\n\n## Pillars\n"
        for param in params:
            intent_text += f"- **{param.label}**: Score {param.score}/100\n"
        with open("Intent_Form.md", "w") as f:
            f.write(intent_text)

    return ChatResponse(
        response=response_text,
        is_finalized=is_finalized,
        research_intent=research_intent,
        parameters=params,
        overall_readiness=overall_readiness
    )

@router.post("/chat", response_model=ChatResponse)
def intake_chat(request: ChatRequest):
    try:
        return process_intake_chat(
            messages=request.messages, 
            fast_track=request.fast_track, 
            template=request.template, 
            current_scores=request.current_scores,
            context_document=request.context_document
        )
    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing OpenRouter API Key. Please add OPENROUTER_API_KEY to backend/.env")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

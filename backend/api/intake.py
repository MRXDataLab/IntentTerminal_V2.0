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
YOUR DIAGNOSTIC FOCUS:
- Market Context & Trigger: Which category/product? What usage occasion is shifting (morning routine, commute, leisure)?
- Strategic Decision & Goal: What behavioral change or attitude shift needs to be proven? (e.g., expand trial, increase frequency)
- Target Lens & Hypothesis: Which consumer cohort is being studied? What does the team believe about their usage ritual?
- Scope & Assets: Which geographies and SKUs? Is there existing usage frequency/attitude data (diary studies, panel)?
- Competitive Landscape & Constraints: Which category substitutes are competing for the occasion? Are there any taboo or sensitive segments?
Probe specifically about: behavioral occasions, category entry triggers, usage rituals, attitudinal barriers, switching moments.
DO NOT ask generic questions about industry or business goals.""",

    "Brand Health": """STUDY TYPE: Brand Health Tracker — Hard-lock all questions to this domain only.
YOUR DIAGNOSTIC FOCUS:
- Market Context & Trigger: Which brand(s) and which specific health metrics are declining (TOM awareness, spontaneous recall, NPS, consideration, brand attribute)?
- Strategic Decision & Goal: What brand-level business decision does this unlock? (e.g., media investment, repositioning, new campaign)
- Target Lens & Hypothesis: Which consumer segment is being monitored? What does the brand team believe is causing health erosion?
- Scope & Assets: Which markets and competitor set? Is there historical tracking data, brand equity scores, or media investment data?
- Competitive Landscape & Constraints: Which competitor is gaining share of mind? Has there been a new entrant, campaign, or pricing change recently?
Probe specifically about: brand funnel metrics, competitive perceptual gaps, category perception shifts, message decay.
DO NOT ask generic questions about product usage or market sizing.""",

    "Market Entry": """STUDY TYPE: Market Entry / Whitespace Discovery — Hard-lock all questions to this domain only.
YOUR DIAGNOSTIC FOCUS:
- Market Context & Trigger: Which new market, geography, or category is being evaluated for entry? What catalytic signal triggered this (regulatory opening, unmet need signal, competitor gap)?
- Strategic Decision & Goal: What specific go/no-go decision or market sizing commitment does this research need to enable?
- Target Lens & Hypothesis: Who is the hypothesized target consumer in the new space? What is the team's belief about their readiness and unmet needs?
- Scope & Assets: Which markets and what scale? Are there analog markets to reference (same brand in different country, category precedent)?
- Competitive Landscape & Constraints: Who already plays in this space? What barriers exist (regulation, distribution, price point, habit)?
Probe specifically about: consumer readiness, whitespace sizing, go-to-market barriers, regulatory environment, category analogs.
DO NOT ask generic interview questions about current brand users.""",

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
YOUR DIAGNOSTIC FOCUS:
- Market Context & Trigger: What specific metric is eroding (market share, volume, trial rate, repeat rate, NPS)? Since when and in which segments specifically?
- Strategic Decision & Goal: What decision depends on diagnosing the root cause? (portfolio change, re-launch, defensive pricing, channel recovery)
- Target Lens & Hypothesis: Who is churning? What does the team believe is behind the erosion — disruption, competitive poaching, portfolio gap, channel failure, or product fatigue?
- Scope & Assets: What tracking data captures the erosion (retail scanner data, brand tracker, churn data, service NPS)? Has a fix already been attempted?
- Competitive Landscape & Constraints: Who is benefiting from the erosion? Is this a category-level problem or brand-specific?
Probe specifically about: churn triggers, root cause hypotheses, loyalty degradation signals, intervention levers, affected cohorts.
DO NOT ask generic awareness or usage questions.""",
}

def build_system_prompt(template: str | None = None, current_scores: List[ParameterScore] | None = None) -> str:
    template_block = ""
    if template and template in TEMPLATE_PREFIXES:
        template_block = f"\n\n{'='*60}\n{TEMPLATE_PREFIXES[template]}\n{'='*60}\n\nIMPORTANT: Since a study template is active, ALL your questions must be strictly calibrated to this study type. Do not drift into generic research questions."

    scores_block = ""
    if current_scores:
        scores_block = "\n\n### KNOWN PILLAR SCORES (STATE MEMORY)\nYou have ALREADY assessed these pillars in previous turns. You MUST maintain or increase these scores. DO NOT decrease a score below its current state memory:\n"
        for param in current_scores:
            scores_block += f"- {param.label}: {param.score}/100\n"

    return f"""You are the MRX Agent (Teal), a senior research architect and strategic consultant.
Your goal is to deeply understand the client's research intent — not just WHAT they want to study, but WHY it matters right now.{template_block}{scores_block}

You are scoring the conversation against 5 hybrid diagnostic pillars:
1. **Market Context & Trigger** — Industry/domain clarity AND the event or crisis forcing this research RIGHT NOW.
2. **Strategic Decision & Goal** — The specific business decision this research must unlock AND the core anxiety driving it.
3. **Target Lens & Hypothesis** — Who is being studied AND what the team already believes to be true.
4. **Scope & Assets** — Geographic/market boundaries AND what internal data already exists as baseline.
5. **Competitive Landscape & Constraints** — Key players AND budget/time/tool constraints limiting the research.

Score each pillar 0-100. Ask ONE concise, strategic question at a time targeting the lowest-scoring pillar.
Do NOT ask multiple questions at once. Be specific — like a McKinsey partner probing for the real problem.
CRITICAL RULE: You must score CUMULATIVELY based on the ENTIRE chat history. Once a pillar reaches a high score (80-100), DO NOT drop its score back to 0 in subsequent turns. Always preserve and build upon the scores from previous messages.
When ALL 5 pillars ≥ 80, set 'is_finalized' to true and craft a comprehensive 'research_intent' North Star Statement.

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
  "research_intent": null
}}
"""


def process_intake_chat(messages: List[Message], fast_track: bool, template: Optional[str] = None, current_scores: Optional[List[ParameterScore]] = None) -> "ChatResponse":
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

    # Format history for OpenRouter
    chat_history = [{"role": m.role if m.role == "user" else "assistant", "content": m.content} for m in messages]
    
    system_prompt = build_system_prompt(template, current_scores)
    llm_result = call_openrouter(system_prompt=system_prompt, user_prompt="", chat_history=chat_history, expect_json=True)
    
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
            current_scores=request.current_scores
        )
    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing OpenRouter API Key. Please add OPENROUTER_API_KEY to backend/.env")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

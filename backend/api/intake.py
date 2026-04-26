import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

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
    template: Optional[str] = None
    current_scores: Optional[List[ParameterScore]] = None
    current_extractions: Optional[Dict[str, Any]] = None
    context_document: Optional[str] = None
    
class ChatResponse(BaseModel):
    response: str
    is_finalized: bool
    research_intent: Optional[str] = None
    parameters: List[ParameterScore]
    overall_readiness: int
    pillar_extractions: Optional[Dict[str, Any]] = None

DEFAULT_PARAMETERS = [
    "Market Context & Trigger",
    "Strategic Decision & Goal",
    "Target Lens & Hypothesis",
    "Scope & Assets",
    "Competitive Landscape & Constraints"
]

# ──────────────────────────────────────────────────────────────────────────────
# RESEARCH ARCHETYPES — Full definitions from the spec
# Each archetype pre-loads a configuration of "Priors" that tells the agent
# which coordinates to ask for, and tells downstream which signals to hunt.
# ──────────────────────────────────────────────────────────────────────────────

TEMPLATE_PREFIXES = {
    "U&A": """STUDY TYPE: Usage & Attitudes (U&A) / Behavioral Mapping
PRIMARY FORCES MEASURED: Reinforcement Stability & Demand Gravity
THE GOAL: To understand how the product fits into the consumer's daily life and routines.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Which category/product are we focusing on and what usage occasion is shifting?"
2. "What behavioral change needs to be proven?"
3. "Which consumer cohort is being studied?"

CORE SIGNALS TO MAP (downstream activation):
- Brand Discovery: Signals of a user encountering the brand for the first time or finding a new use case.
- Ritual Language & Habitual Usage: Recurrent usage patterns and lifestyle integration mentioned in un-moderated forums.
- JTBD (Jobs-To-Be-Done) Narratives: How users describe the actual "job" they hired the product for (often differing from marketing claims).
- Substitute Workarounds: Users explaining how they "hack" or modify the product to fit their needs.
Score strictly against these. Do NOT ask generic industry questions.""",

    "Brand Health": """STUDY TYPE: Brand Health & Equity Audit
PRIMARY FORCES MEASURED: Demand Gravity & Reinforcement Stability
THE GOAL: To measure the organic pull (Mental Availability) and community defense of the brand.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Who is the primary rival stealing your mindshare right now?"
2. "What was the specific 'Moment of Doubt' or sales data point that triggered this?"
3. "Which region or product SKU is under the most pressure?"

CORE SIGNALS TO MAP (downstream activation):
- Brand Salience & Recall Language: Frequency and ease of unprompted brand recall (e.g., "Which one was the one with the blue logo? Oh right, [Brand].").
- Category Salience: The strength of the brand-category association (e.g., "If you want an EV, you naturally think of this brand first.").
- Brand Mention Share: The proportion of organic conversations featuring the brand vs. others.
- Community Defense / Advocacy: Instances of users actively defending the brand against critics or recommending it unprompted.
Score strictly against these. Do NOT ask generic product usage questions.""",

    "Market Entry": """STUDY TYPE: Market Entry / Whitespace Scan
PRIMARY FORCES MEASURED: Choice Architecture, Competitive Energy, & Demand Gravity
THE GOAL: To find the "Structural Vacuum" where incumbents are failing and demand is unmet.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Which new market or category is being evaluated, and what catalytic signal triggered this?"
2. "What specific go/no-go decision does this research need to enable?"
3. "Who is the hypothesized target consumer and what are their unmet needs?"

CORE SIGNALS TO MAP (downstream activation):
- Information Gaps: High-volume search clusters where users are asking questions but only finding poor-quality forum answers.
- Incumbent OOS (Out-of-Stock) Rates: Supply chain or availability failures of current market leaders.
- Ghost Brand Velocity: High review and sales velocity for white-label or "no-name" sellers filling the gap on e-commerce platforms.
- Interest & Curiosity Signals: Signals of active market desire for a solution that doesn't fully exist yet.
Score strictly against these. Do NOT ask typical interview questions.""",

    "Competitive Pulse": """STUDY TYPE: Competitive Pulse (Displacement Study)
PRIMARY FORCES MEASURED: Competitive Energy & Choice Architecture
THE GOAL: To track migration paths and identify the exact feature/narrative causing consumers to switch brands.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Which specific competitor has caught your attention, and what signals have been detected — a new launch, price move, or talent shift?"
2. "What strategic counter-response decision does this intel need to enable?"
3. "Are we studying consumer perception of the competitor or internal stakeholder intelligence?"

CORE SIGNALS TO MAP (downstream activation):
- Switching Narratives & Migration Velocity: Explicit statements of users abandoning one brand for another.
- Competitor Complaints & Reliability Issues: Users venting about a rival's failure or doubting their long-term performance.
- Category Leadership vs. Underdog Narratives: Market position signals — whether a brand is seen as the "stagnant giant" or the "disruptive challenger."
- Brand Positioning Language: How the brand 'feels' relative to others (e.g., "This feels like the budget-friendly alternative to the premium brands.").
Score strictly against these. Do NOT ask generic brand health questions.""",

    "Erosion Study": """STUDY TYPE: Erosion Diagnosis (Churn & Trust Collapse)
PRIMARY FORCES MEASURED: Reinforcement Stability, Value Elasticity, & Competitive Energy
THE GOAL: To diagnose the "Digital Graveyard" and find out if users are leaving due to product failure, poor service, or better competitor pricing.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "What specific metric is eroding (market share, volume, trial rate) and since when?"
2. "What decision depends on diagnosing this root cause (defensive pricing, re-launch)?"
3. "Who is churning and who is benefiting from the erosion?"

CORE SIGNALS TO MAP (downstream activation):
- Regret Clusters: Groupings of post-purchase dissonance, "buyer's remorse," or update-related regret.
- Resale Velocity & Retainment: The volume and price-drop percentage of the product on secondary markets (e.g., OLX, Cashify).
- Narrative of Departure: The specific reasons cited by users when they declare they are leaving the ecosystem.
- Competitor Reliability Issues: Tracking if users are churning to a competitor only to experience failures there as well.
Score strictly against these. Do NOT ask generic awareness or usage questions.""",

    "Pricing & Value": """STUDY TYPE: Pricing & Value Justification
PRIMARY FORCES MEASURED: Value Elasticity Field & Choice Architecture
THE GOAL: To determine if the brand has the narrative equity to justify its premium or if it is reliant on discounts.
DIAGNOSTIC MODE: SHORT-CIRCUIT. Bypass generic context.
Quick-Start Questions:
1. "Is the brand relying on discounts to maintain volume, or does it have genuine narrative equity?"
2. "Which competitor is perceived as overpriced or underpriced relative to yours?"
3. "What specific feature or benefit do customers debate most when justifying the price?"

CORE SIGNALS TO MAP (downstream activation):
- Competitor Value Criticism: Asserting the rival is overpriced (e.g., "The competitor is charging double for basically the same features.").
- Price Sensitivity Sentiment: The outrage velocity related to price hikes or hidden fees.
- Perceived Indispensability (The Disappearance Test): Measuring how much pain it would cause the consumer if the brand vanished.
- Feature-to-Cost Debates: Granular arguments in forums about whether a specific feature justifies the overall price tag.
Score strictly against these. Do NOT ask generic brand health questions.""",
}

# ──────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — Sub-dimension aware, saturation-driven, extraction-focused
# ──────────────────────────────────────────────────────────────────────────────

def build_system_prompt(template: str | None = None, current_scores: List[ParameterScore] | None = None, current_extractions: Dict[str, Any] | None = None, context_document: str | None = None) -> str:
    template_block = ""
    if template and template in TEMPLATE_PREFIXES:
        template_block = f"\n\n{'='*60}\n{TEMPLATE_PREFIXES[template]}\n{'='*60}\n\nIMPORTANT: Since a study template is active, ALL your questions must be strictly calibrated to this study type. Do not drift into generic research questions."

    context_block = ""
    if context_document:
        truncated_context = context_document[:4000] + ("...\n[TRUNCATED FOR LENGTH]" if len(context_document) > 4000 else "")
        context_block = f"""\n\n### UPLOADED RESEARCH CONTEXT
The user has supplied the following background document/brief:
```
{truncated_context}
```
CRITICAL: You MUST parse this document immediately. Extract all relevant sub-dimension data into pillar_extractions.
Respond in this style: "I've ingested your brief. It's X% complete. I need to clarify [specific sub-dimensions like 'the exact geographic scope' or 'the visible rivals'] before we build the graph. Shall we proceed with these specific questions?"
Score pillars HIGH immediately if the document answers them. ONLY ask about remaining gaps."""

    scores_block = ""
    if current_scores:
        scores_block = "\n\n### KNOWN PILLAR SCORES (STATE MEMORY)\nYou have ALREADY assessed these pillars in previous turns. You MUST maintain or increase these scores. DO NOT decrease a score below its current state memory:\n"
        for param in current_scores:
            scores_block += f"- {param.label}: {param.score}/100\n"

    extractions_block = ""
    if current_extractions:
        extractions_block = f"""\n\n### KNOWN PILLAR EXTRACTIONS (DATA MEMORY)
You have ALREADY extracted the following data from previous turns. You MUST preserve all existing values and only ADD new information. NEVER erase or overwrite previously extracted data:
```json
{json.dumps(current_extractions, indent=2)}
```"""

    return f"""You are the Outtlyr Agent (Teal), a senior research architect and strategic consultant.
Your goal is to deeply understand the client's research intent — not just WHAT they want to study, but WHY it matters right now.{template_block}{context_block}{scores_block}{extractions_block}

You are scoring AND extracting data from the conversation against 5 diagnostic pillars, each with specific sub-dimensions:

1. **Market Context & Trigger**
   Sub-dimensions to extract:
   - *Business Baseline:* Current state of the brand in the market.
   - *The Catalyst:* The specific event (competitor launch, viral trend, sales drop) vs. Routine audit.
   - *Urgency:* Why this needs to be mapped now.
   SCORING: 0-20 if only vague industry mentioned. 40-60 if catalyst identified but baseline unclear. 70+ if all three sub-dimensions have concrete data.

2. **Strategic Decision & Goal**
   Sub-dimensions to extract:
   - *The Objective:* The ultimate goal (e.g., Market Entry, Repositioning, Pricing alignment).
   - *Strategic Significance:* The weight of the decision resting on this data.
   - *Decomposition Nodes:* Breaking the big goal into smaller research questions.
   SCORING: 0-20 if only "want to understand market." 40-60 if objective named but no decomposition. 70+ if objective, significance, and decomposition are all concrete.

3. **Target Lens & Hypothesis**
   Sub-dimensions to extract:
   - *Audience Demographics/Psychographics:* Identifying the exact cohort.
   - *The Internal Hypothesis:* The client's "gut feeling" about what is happening.
   - *The Problem Statement:* The specific friction point the client suspects.
   SCORING: 0-20 if only "our customers." 40-60 if cohort identified but no hypothesis. 70+ if audience, hypothesis, and problem statement are all specific.

4. **Scope & Assets**
   Sub-dimensions to extract:
   - *The SOW:* Geographic limits, temporal boundaries (last 6 months vs. last 2 years), specific product lines.
   - *Client Data Assets:* CRM data, past surveys, sales figures — anything internal the system can use as ground truth.
   SCORING: 0-20 if no boundaries set. 40-60 if geography known but timeframe vague. 70+ if SOW and available data assets are both concrete.

5. **Competitive Landscape & Constraints**
   Sub-dimensions to extract:
   - *Visible Rivals:* The named competitors the client fights daily.
   - *Invisible/Ghost Rivals:* White-label sellers or indirect substitutes stealing share.
   - *Threats & Constraints:* Specific areas the client is worried about, or areas explicitly out of bounds.
   SCORING: 0-20 if "lots of competition." 40-60 if rivals named but no constraints. 70+ if visible rivals, ghost rival awareness, and constraints are all specified.

SATURATION RULE: When a pillar reaches score 70, it is "Saturated." STOP asking questions about it. Focus ONLY on unsaturated pillars.
When ALL 5 pillars ≥ 70, set 'is_finalized' to true and craft a comprehensive 'research_intent' North Star Statement.

Ask ONE short, conversational, and easy-to-understand question at a time targeting the lowest-scoring UNSATURATED pillar.
Keep your question under 2 sentences. Do not use complex jargon.
Do NOT ask multiple questions at once.

CRITICAL RULE 1: You must score CUMULATIVELY based on the ENTIRE chat history. Once a pillar reaches a high score, DO NOT drop it.
CRITICAL RULE 2 (GUARDRAILS): NEVER ask about research methodology (surveys, focus groups, scraping). Scope is about business boundaries, NOT methods.
CRITICAL RULE 3 (OVERRIDE): If the user says to proceed "as is" or without fine-tuning, IMMEDIATELY set 'is_finalized' to true and craft the North Star Statement.
CRITICAL RULE 4 (BASELINE INTENT): If a 'context_document' is provided, always attempt to extract a baseline 'research_intent' even if 'is_finalized' is false.

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
  "pillar_extractions": {{
    "market_context": {{
      "business_baseline": "extracted value or null",
      "catalyst": "extracted value or null",
      "urgency": "extracted value or null"
    }},
    "strategic_decision": {{
      "objective": "extracted value or null",
      "significance": "extracted value or null",
      "decomposition_nodes": []
    }},
    "target_lens": {{
      "audience": "extracted value or null",
      "hypothesis": "extracted value or null",
      "problem_statement": "extracted value or null"
    }},
    "scope_assets": {{
      "sow": "extracted value or null",
      "client_data": "extracted value or null"
    }},
    "competitive_landscape": {{
      "visible_rivals": [],
      "ghost_rivals": "extracted value or null",
      "constraints": "extracted value or null"
    }}
  }},
  "is_finalized": false,
  "research_intent": "Draft/Baseline intent if context is provided, otherwise null"
}}
"""


def process_intake_chat(messages: List[Message], fast_track: bool, template: Optional[str] = None, current_scores: Optional[List[ParameterScore]] = None, current_extractions: Optional[Dict[str, Any]] = None, context_document: Optional[str] = None) -> "ChatResponse":
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
            overall_readiness=100,
            pillar_extractions=None
        )

    # Format history for OpenRouter (limit to last 6 messages to save tokens)
    chat_history = [{"role": m.role if m.role == "user" else "assistant", "content": m.content} for m in messages[-6:]]
    
    system_prompt = build_system_prompt(template, current_scores, current_extractions, context_document)
    llm_result = call_openrouter(
        system_prompt=system_prompt, 
        user_prompt="", 
        chat_history=chat_history, 
        expect_json=True,
        model="google/gemini-2.0-flash-lite-preview:free"
    )
    
    print(f"LLM RESULT: {json.dumps(llm_result)}")
    
    params_data = llm_result.get("parameters", [])
    response_text = llm_result.get("response", "Thank you, could you elaborate?")
    is_finalized = llm_result.get("is_finalized", False)
    research_intent = llm_result.get("research_intent")
    pillar_extractions = llm_result.get("pillar_extractions")
    
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
        if pillar_extractions:
            intent_text += f"\n## Extracted Data\n```json\n{json.dumps(pillar_extractions, indent=2)}\n```\n"
        with open("Intent_Form.md", "w") as f:
            f.write(intent_text)

    return ChatResponse(
        response=response_text,
        is_finalized=is_finalized,
        research_intent=research_intent,
        parameters=params,
        overall_readiness=overall_readiness,
        pillar_extractions=pillar_extractions
    )

@router.post("/chat", response_model=ChatResponse)
def intake_chat(request: ChatRequest):
    try:
        return process_intake_chat(
            messages=request.messages, 
            fast_track=request.fast_track, 
            template=request.template, 
            current_scores=request.current_scores,
            current_extractions=request.current_extractions,
            context_document=request.context_document
        )
    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing OpenRouter API Key. Please add OPENROUTER_API_KEY to backend/.env")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

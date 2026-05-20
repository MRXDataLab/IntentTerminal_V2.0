import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter
from kb.kb_loader import load_kb

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
    "Target Lens & Decision Goal",
    "Scope & Assets",
    "Competitive Landscape & Constraints"
]

# ──────────────────────────────────────────────────────────────────────────────
# RESEARCH ARCHETYPES — Loaded from KB files
# Each archetype pre-loads a configuration of "Priors" that tells the agent
# which coordinates to ask for, and tells downstream which signals to hunt.
# ──────────────────────────────────────────────────────────────────────────────

# Map template names to their KB file paths
_TEMPLATE_KB_PATHS = {
    "U&A": "agents/intake_archetypes/ua.md",
    "Brand Health": "agents/intake_archetypes/brand_health.md",
    "Market Entry": "agents/intake_archetypes/market_entry.md",
    "Competitive Pulse": "agents/intake_archetypes/competitive_pulse.md",
    "Erosion Study": "agents/intake_archetypes/erosion_study.md",
    "Pricing & Value": "agents/intake_archetypes/pricing_value.md",
}

def _load_template_prefix(template_name: str) -> str | None:
    """Load a template prefix from KB. Returns None if not found."""
    kb_path = _TEMPLATE_KB_PATHS.get(template_name)
    if not kb_path:
        return None
    try:
        return load_kb(kb_path)
    except FileNotFoundError:
        print(f"Warning: KB file not found for template '{template_name}': {kb_path}")
        return None

# ──────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — Loaded from KB, with dynamic block assembly
# ──────────────────────────────────────────────────────────────────────────────

def build_system_prompt(template: str | None = None, current_scores: List[ParameterScore] | None = None, current_extractions: Dict[str, Any] | None = None, context_document: str | None = None) -> str:
    template_block = ""
    if template:
        template_content = _load_template_prefix(template)
        if template_content:
            template_block = f"\n\n{'='*60}\n{template_content}\n{'='*60}\n\nIMPORTANT: Since a study template is active, ALL your questions must be strictly calibrated to this study type. Do not drift into generic research questions."

    context_block = ""
    if context_document:
        truncated_context = context_document[:4000] + ("...\n[TRUNCATED FOR LENGTH]" if len(context_document) > 4000 else "")
        if not current_extractions:
            instructions = (
                "CRITICAL: You MUST parse this document immediately. Extract all relevant sub-dimension data into pillar_extractions.\n"
                "Respond in this style: \"I've ingested your brief. It's X% complete. I need to clarify [specific sub-dimensions like 'the exact geographic scope' or 'the visible rivals'] before we build the graph. Shall we proceed with these specific questions?\"\n"
                "Score pillars HIGH immediately if the document answers them. ONLY ask about remaining gaps."
            )
        else:
            instructions = (
                "CRITICAL: Reference this document context to answer user questions or fill remaining pillar gaps. You have already extracted initial data from it."
            )

        context_block = f"""\n\n### UPLOADED RESEARCH CONTEXT\nThe user has supplied the following background document/brief:\n```\n{truncated_context}\n```\n{instructions}"""

    scores_block = ""
    if current_scores:
        scores_block = "\n\n### KNOWN PILLAR SCORES (STATE MEMORY)\nYou have ALREADY assessed these pillars in previous turns. You MUST maintain or increase these scores. DO NOT decrease a score below its current state memory:\n"
        for param in current_scores:
            scores_block += f"- {param.label}: {param.score}/100\n"

    extractions_block = ""
    if current_extractions:
        extractions_block = f"""\n\n### KNOWN PILLAR EXTRACTIONS (DATA MEMORY)
You have already extracted the following data. Do NOT repeat these values in your response unless you are updating them. Your `pillar_extractions` output should ONLY contain new or changed fields (a delta). We will merge them automatically:
```json
{json.dumps(current_extractions, indent=2)}
```"""

    # Load the base agent prompt from KB
    base_prompt = load_kb("agents/intake_agent.md")

    return f"""{base_prompt}{template_block}{context_block}{scores_block}{extractions_block}"""


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
    INTAKE_SCHEMA = {
        "type": "OBJECT",
        "properties": {
            "response": {"type": "STRING"},
            "parameters": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "label": {"type": "STRING"},
                        "score": {"type": "INTEGER"}
                    },
                    "required": ["label", "score"]
                }
            },
            "pillar_extractions": {
                "type": "OBJECT",
                "properties": {
                    "market_context": {"type": "OBJECT"},
                    "strategic_decision": {"type": "OBJECT"},
                    "target_lens": {"type": "OBJECT"},
                    "scope_assets": {"type": "OBJECT"},
                    "competitive_landscape": {"type": "OBJECT"}
                }
            },
            "is_finalized": {"type": "BOOLEAN"},
            "research_intent": {"type": "STRING", "nullable": True}
        },
        "required": ["response", "parameters", "pillar_extractions", "is_finalized"]
    }
    
    llm_result = call_openrouter(
        system_prompt=system_prompt, 
        user_prompt="", 
        chat_history=chat_history, 
        expect_json=True,
        response_schema=INTAKE_SCHEMA
    )
    
    print(f"LLM RESULT: {json.dumps(llm_result)}")
    
    params_data = llm_result.get("parameters", [])
    response_text = llm_result.get("response", "Thank you, could you elaborate?")
    is_finalized = llm_result.get("is_finalized", False)
    research_intent = llm_result.get("research_intent")
    
    # Merge delta extractions with current
    new_extractions = llm_result.get("pillar_extractions") or {}
    merged_extractions = current_extractions or {}
    
    def _deep_merge(target, source):
        for k, v in source.items():
            if isinstance(v, dict) and k in target and isinstance(target[k], dict):
                _deep_merge(target[k], v)
            elif v is not None:
                target[k] = v
                
    _deep_merge(merged_extractions, new_extractions)
    pillar_extractions = merged_extractions if merged_extractions else None
    
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

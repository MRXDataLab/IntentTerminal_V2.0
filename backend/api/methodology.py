"""
methodology.py — Generates the Execution Methodology Blueprint.

Takes the study context (intent, brief, extractions, template) and produces
a structured JSON describing the 5-phase pipeline with estimated source counts,
signal volumes, timelines, and hypothesis mappings.
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter

router = APIRouter()

SYSTEM_PROMPT_METHODOLOGY = """You are the Outllyr Methodology Architect. Given a research intent, strategic brief, and study template, generate a detailed Execution Methodology Blueprint.

This blueprint tells the client EXACTLY what will happen when they confirm the study. It must include realistic, study-specific estimates.

Output MUST be strict JSON matching this schema:
{
  "study_type": "The study archetype name (e.g., Brand Health, Market Entry, Erosion Diagnosis)",
  "primary_forces": ["The 2-3 Strategic Forces most relevant to this study"],
  "estimated_sources": <integer: total URLs/sources the scouts will discover, typically 80-250>,
  "estimated_signals": <integer: total extractable signal data points, typically 1500-5000>,
  "estimated_timeline_minutes": <integer: total estimated pipeline runtime, typically 20-45>,
  "confidence_target": 85,
  "phases": [
    {
      "id": "discovery",
      "name": "Autonomous Source Discovery",
      "duration_minutes": <integer: 3-8>,
      "description": "A 1-2 sentence description of what happens in this phase, specific to this study.",
      "platforms": [
        {
          "name": "Reddit",
          "estimated_sources": <integer: 15-60>,
          "targets": ["Specific subreddits or search strategies relevant to this study, e.g., r/smarthome, r/IndiaEVs"],
          "scout_type": "subjective"
        },
        {
          "name": "YouTube",
          "estimated_sources": <integer: 10-40>,
          "targets": ["Specific video categories or channels, e.g., Tech review comparisons, Owner vlogs"],
          "scout_type": "subjective"
        },
        {
          "name": "E-commerce Reviews",
          "estimated_sources": <integer: 15-50>,
          "targets": ["Specific product review clusters, e.g., Amazon 1-star clusters, Flipkart verified reviews"],
          "scout_type": "subjective"
        },
        {
          "name": "Google Trends & PAA",
          "estimated_sources": <integer: 10-30>,
          "targets": ["Interest-over-time keywords, People Also Ask trees"],
          "scout_type": "structural"
        },
        {
          "name": "News & Industry",
          "estimated_sources": <integer: 5-20>,
          "targets": ["Specific news domains or industry portals relevant to this study"],
          "scout_type": "structural"
        }
      ],
      "sieve": {
        "noise_discard_pct": 95,
        "filters": ["Semantic Proximity", "Signal Density", "Social Velocity"],
        "output_hunt_list_size": <integer: same as estimated_sources above>
      }
    },
    {
      "id": "extraction",
      "name": "Deep Extraction & Cleansing",
      "duration_minutes": <integer: 5-12>,
      "description": "Bot annihilation, paid narrative exclusion, contextual metadata preservation.",
      "cleaning_steps": ["Bot & Spam Annihilation", "Paid Narrative Exclusion", "Contextual Metadata Preservation"],
      "output_signals": <integer: same as estimated_signals above>
    },
    {
      "id": "inference",
      "name": "Causal Inference Pipeline",
      "duration_minutes": <integer: 8-15>,
      "description": "Demographic inference, ontological signal tagging, and causal AI modeling.",
      "engines": [
        {"name": "Demographic Inference", "description": "Infer user cohorts from dialect, posting habits, and cultural references"},
        {"name": "Ontological Signal Tagging", "description": "Map every comment to the Market Physics Ontology"},
        {"name": "Causal AI Modeling", "description": "Isolate which variables actually drove consumer behavior"}
      ],
      "signal_taxonomy": ["List 6-10 specific signal tags relevant to this study, e.g., regret_clusters, switching_narratives, value_criticism, ghost_brand_velocity, brand_salience, price_sensitivity"]
    },
    {
      "id": "verification",
      "name": "Hypothesis Verification",
      "duration_minutes": <integer: 3-8>,
      "description": "Stress-test client hypotheses against tagged digital signals.",
      "hypotheses": [
        {"label": "Specific hypothesis text from the brief", "force": "The Strategic Force it measures"}
      ],
      "ghost_brand_detection": true,
      "msu_threshold": 0.02
    },
    {
      "id": "rendering",
      "name": "Force Mapping & Truth Map",
      "duration_minutes": <integer: 1-3>,
      "description": "Roll up atomic signals into the 5 Strategic Forces and render the Living Truth Map.",
      "forces": ["Demand Gravity", "Choice Architecture", "Value Elasticity", "Reinforcement Stability", "Competitive Energy"]
    }
  ]
}

RULES:
- All numbers must be realistic and proportional to the study scope.
- Platform targets must be SPECIFIC to the research intent (real subreddit names, real product categories).
- Hypotheses must be extracted from the brief if provided, or inferred from the intent.
- Signal taxonomy tags must be relevant to the study archetype.
- Output ONLY the JSON. No markdown, no explanation.
"""


class MethodologyRequest(BaseModel):
    research_intent: str
    brief_text: Optional[str] = None
    pillar_extractions: Optional[Dict[str, Any]] = None
    template: Optional[str] = None


class MethodologyResponse(BaseModel):
    methodology: Dict[str, Any]


@router.post("/generate-methodology", response_model=MethodologyResponse)
def generate_methodology(request: MethodologyRequest):
    """
    Generates the Execution Methodology Blueprint — a structured JSON
    describing the 5-phase pipeline with study-specific estimates.
    """
    try:
        extractions_block = ""
        if request.pillar_extractions:
            extractions_block = f"\n\n### Pillar Extractions\n```json\n{json.dumps(request.pillar_extractions, indent=2)}\n```"

        brief_block = ""
        if request.brief_text:
            brief_block = f"\n\n### Strategic Research Brief\n{request.brief_text[:5000]}"

        user_prompt = f"""## Study Context

**Research Intent:** {request.research_intent}
**Study Archetype:** {request.template or 'General'}
{brief_block}
{extractions_block}

Generate the Execution Methodology Blueprint JSON for this specific study.
Use the brief's hypotheses, target audience, geographic scope, and competitive context to produce realistic, study-specific estimates.
"""

        methodology = call_openrouter(
            system_prompt=SYSTEM_PROMPT_METHODOLOGY,
            user_prompt=user_prompt,
            expect_json=True,
        )

        return MethodologyResponse(methodology=methodology)

    except Exception as e:
        # Return a sensible fallback so the frontend still renders
        fallback = {
            "study_type": request.template or "General Research",
            "primary_forces": ["Demand Gravity", "Competitive Energy"],
            "estimated_sources": 120,
            "estimated_signals": 2000,
            "estimated_timeline_minutes": 30,
            "confidence_target": 85,
            "phases": [
                {
                    "id": "discovery",
                    "name": "Autonomous Source Discovery",
                    "duration_minutes": 5,
                    "description": "Deploy scouts across Reddit, YouTube, Amazon, and Google Trends.",
                    "platforms": [
                        {"name": "Reddit", "estimated_sources": 35, "targets": ["Relevant subreddits"], "scout_type": "subjective"},
                        {"name": "YouTube", "estimated_sources": 20, "targets": ["Review & comparison videos"], "scout_type": "subjective"},
                        {"name": "E-commerce Reviews", "estimated_sources": 30, "targets": ["Product review clusters"], "scout_type": "subjective"},
                        {"name": "Google Trends & PAA", "estimated_sources": 20, "targets": ["Interest-over-time", "PAA trees"], "scout_type": "structural"},
                        {"name": "News & Industry", "estimated_sources": 15, "targets": ["Industry news portals"], "scout_type": "structural"},
                    ],
                    "sieve": {"noise_discard_pct": 95, "filters": ["Semantic Proximity", "Signal Density", "Social Velocity"], "output_hunt_list_size": 120}
                },
                {
                    "id": "extraction",
                    "name": "Deep Extraction & Cleansing",
                    "duration_minutes": 8,
                    "description": "Bot annihilation, paid narrative exclusion, metadata preservation.",
                    "cleaning_steps": ["Bot & Spam Annihilation", "Paid Narrative Exclusion", "Contextual Metadata Preservation"],
                    "output_signals": 2000
                },
                {
                    "id": "inference",
                    "name": "Causal Inference Pipeline",
                    "duration_minutes": 10,
                    "description": "Demographic inference, ontological signal tagging, causal AI modeling.",
                    "engines": [
                        {"name": "Demographic Inference", "description": "Infer user cohorts from dialect and posting habits"},
                        {"name": "Ontological Signal Tagging", "description": "Map comments to Market Physics Ontology"},
                        {"name": "Causal AI Modeling", "description": "Isolate causal variables from correlated events"}
                    ],
                    "signal_taxonomy": ["regret_clusters", "switching_narratives", "value_criticism", "brand_salience", "ghost_brand_velocity", "price_sensitivity"]
                },
                {
                    "id": "verification",
                    "name": "Hypothesis Verification",
                    "duration_minutes": 5,
                    "description": "Stress-test hypotheses against tagged digital signals.",
                    "hypotheses": [{"label": "Primary hypothesis from research intent", "force": "Demand Gravity"}],
                    "ghost_brand_detection": True,
                    "msu_threshold": 0.02
                },
                {
                    "id": "rendering",
                    "name": "Force Mapping & Truth Map",
                    "duration_minutes": 2,
                    "description": "Render the Living Truth Map from the 5 Strategic Forces.",
                    "forces": ["Demand Gravity", "Choice Architecture", "Value Elasticity", "Reinforcement Stability", "Competitive Energy"]
                }
            ]
        }
        return MethodologyResponse(methodology=fallback)

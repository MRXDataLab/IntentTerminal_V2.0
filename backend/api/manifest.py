import os
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# MANIFEST SYSTEM PROMPT — Generates Artifact 3 (Link Farming Manifest)
# Converts the narrative brief + structured extractions into machine-readable JSON
# ──────────────────────────────────────────────────────────────────────────────

MANIFEST_SYSTEM_PROMPT = """You are the Outllyr Manifest Architect. Your job is to convert a Strategic Research Brief and structured pillar extractions into a machine-readable JSON payload (the "Link Farming Manifest") that will be consumed by API scrapers and data ingestion workers.

You MUST output strict JSON matching this exact schema:

{
  "study_id": "auto-generated UUID",
  "study_type": "the archetype template name or 'general'",
  "global_parameters": {
    "time_window": "ISO date range extracted from Scope & Assets SOW (e.g., '2025-10-01 to 2026-04-01')",
    "geo_fencing": ["list of country/region codes from SOW, e.g., 'IN', 'US'"],
    "product_scope": ["list of specific product lines or categories from SOW"]
  },
  "entity_anchors": {
    "primary_brand": "The client's brand name",
    "tracked_competitors": ["Named visible rivals from Competitive Landscape"],
    "ghost_brand_discovery": {
      "enabled": true,
      "platforms": ["amazon.in", "flipkart.com", "blinkit.com"]
    }
  },
  "boolean_nets": [
    {
      "query": "A boolean search string targeting a specific hypothesis or signal",
      "target_signals": ["signal_tag_1", "signal_tag_2"],
      "priority": "high/medium/low"
    }
  ],
  "platform_targets": {
    "youtube": {"category_ids": [28], "min_views": 1000, "search_queries": []},
    "reddit": {"subreddits": ["relevant subreddits"], "search_queries": []},
    "ecommerce": {"platforms": ["amazon.in"], "keywords": [], "asins": []},
    "search_news": {"queries": [], "domains": []}
  },
  "signal_taxonomy": ["list of all signal tags the study is watching for, e.g., 'regret_clusters', 'switching_narratives', 'ghost_brand_velocity'"],
  "stop_rules": {
    "msu_threshold": 0.02,
    "confidence_threshold": 0.85,
    "max_links": 10000
  }
}

RULES:
- Extract ALL entity names, geographic data, timelines, and competitors from the provided extractions. Do NOT invent data.
- Generate 4-8 boolean_nets that map to the study's hypotheses and signal taxonomy.
- The signal_taxonomy should include signals relevant to the study archetype.
- Platform targets should include specific subreddits, search queries, and e-commerce keywords relevant to the case.
- Output ONLY the JSON object. No markdown, no explanation.
"""


class ManifestRequest(BaseModel):
    research_intent: str
    brief_text: str
    pillar_extractions: Optional[Dict[str, Any]] = None
    template: Optional[str] = None


class ManifestResponse(BaseModel):
    manifest: Dict[str, Any]


@router.post("/generate-manifest", response_model=ManifestResponse)
def generate_link_farming_manifest(request: ManifestRequest):
    """
    Generates Artifact 3: The Link Farming Manifest.
    A machine-readable JSON payload that feeds the data ingestion engine.
    Saved to disk as Link_Farming_Manifest.json.
    """
    try:
        extractions_block = ""
        if request.pillar_extractions:
            extractions_block = f"\n\n### Structured Pillar Extractions\n```json\n{json.dumps(request.pillar_extractions, indent=2)}\n```"

        user_prompt = f"""## Study Context

**Research Intent:** {request.research_intent}
**Study Archetype:** {request.template or 'General'}

### Strategic Research Brief (Artifact 1)
{request.brief_text[:5000]}
{extractions_block}

---

Now generate the Link Farming Manifest JSON payload based on the above context.
Extract all specific entity names, geographic data, timelines, competitors, and hypotheses from the data provided.
"""

        manifest_data = call_openrouter(
            system_prompt=MANIFEST_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            expect_json=True,
            model="mistralai/mistral-7b-instruct:free"
        )

        # Inject a proper study_id
        manifest_data["study_id"] = str(uuid.uuid4())

        # Save Artifact 3 to disk as .json
        with open("Link_Farming_Manifest.json", "w") as f:
            json.dump(manifest_data, f, indent=2)

        return ManifestResponse(manifest=manifest_data)

    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing API Key.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

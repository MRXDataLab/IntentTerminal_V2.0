import os
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter
from kb.kb_loader import load_kb

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# MANIFEST SYSTEM PROMPT — Loaded from KB
# Generates Artifact 3 (Link Farming Manifest)
# ──────────────────────────────────────────────────────────────────────────────

def _get_manifest_system_prompt() -> str:
    """Load the manifest generation prompt from KB."""
    return load_kb("agents/manifest_agent.md")


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
            system_prompt=_get_manifest_system_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
            model="mistralai/mistral-7b-instruct:free"
        )

        # Inject a proper study_id
        manifest_data["study_id"] = str(uuid.uuid4())

        # Save Artifact 3 to disk as .json
        with open("Link_Farming_Manifest.json", "w") as f:
            json.dump(manifest_data, f, indent=2)

        # ── DEV BYPASS CAPTURE: Save snapshot of this run ──
        import pathlib
        capture_dir = pathlib.Path("latest_run_data")
        capture_dir.mkdir(exist_ok=True)
        (capture_dir / "latest_manifest.json").write_text(
            json.dumps(manifest_data, indent=2), encoding="utf-8"
        )

        return ManifestResponse(manifest=manifest_data)

    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing API Key.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

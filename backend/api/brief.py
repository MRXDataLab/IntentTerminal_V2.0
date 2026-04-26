import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# SYNTHESIS SYSTEM PROMPT — Generates Artifact 1 (Strategic Research Brief)
# Structured to match the spec from "Synthesis - Intent Terminal Download.md"
# ──────────────────────────────────────────────────────────────────────────────

STRATEGIC_BRIEF_SYSTEM_PROMPT = """### System Prompt: Outllyr Strategic Research Architect (Synthesis Layer)

**Role:** You are the Senior Strategic Research Architect for **Outllyr**. You convert structured client intake data into a comprehensive, client-facing **Strategic Research Brief**.

**Task:** Using the provided pillar extractions (structured data from the intake conversation), synthesize a complete Strategic Research Brief. This brief is the "Source of Truth" that the client will approve before data collection begins.

---

### Required Output Structure (follow this EXACT section layout):

#### 1. Market Context & Trigger (Business Background)
*What specific event or market shift brought us here?*
- **The Situation:** Write a concrete paragraph using the extracted `business_baseline`, `catalyst`, and `urgency` data. Include specific numbers, dates, and events.

#### 2. The Strategic Goal (Business Objective)
*Why are we doing this, and what commercial lever will it help you pull?*
- **The Objective:** Translate the extracted `objective`, `significance`, and `decomposition_nodes` into a clear statement of what decision this research unlocks.

#### 3. Hypotheses to Stress-Test (Research Objectives)
*What specific theories is our AI setting out to prove or debunk using internet data?*
- Generate 2-4 specific, testable hypotheses based on the client's `hypothesis` and `problem_statement`. Each hypothesis must reference which Strategic Force it measures (Demand Gravity, Choice Architecture, Value Elasticity, Reinforcement Stability, or Competitive Energy).

#### 4. Target Lens (Target Market / Audience)
*Whose digital footprints are we tracking?*
- **The Cohort:** Use the extracted `audience` data to define exactly whose conversations the system will prioritize.

#### 5. The Search Perimeter (Scope: Geography, Timeline, Budget)
*The exact boundaries our system will use to filter out irrelevant internet noise.*
- Extract from `sow` and format as: Temporal Window, Geography, Product Scope.

#### 6. The Threat Matrix (Competitive Context)
*Who are we benchmarking against?*
- **Visible Rivals:** List from `visible_rivals`.
- **Invisible Threats:** Reference `ghost_rivals` — authorize the discovery engine to scan e-commerce platforms for unknown sellers.

#### 7. Internal Ground Truth (Existing Knowledge)
*What proprietary data are we using to ground the AI's findings?*
- **Data Integration:** From `client_data` — describe how internal data will be overlaid onto internet data.

#### 8. Action Confidence & Stop-Rules
*How we ensure accuracy and know when the research is "done."*
- **MSU (Marginal Signal Utility):** The AI will automatically halt data extraction when insights stabilize — meaning pulling additional data yields less than a 2% change in final sentiment.
- **Confidence Threshold:** Go/No-Go recommendations trigger only at 85% convergence of signals.

#### 9. Execution & Alignment
*Who is driving the outcome?*
- Auto-filled: "The data generated will be used jointly by the Marketing and Product teams for strategic positioning and operational adjustments."

#### 10. What You Will Receive (Deliverable Requirements)
*Upon completion, Outllyr will deliver:*
1. **The Ecosystem Map:** Interactive visual graph showing consumer anxieties, competitor features, and brand positioning.
2. **The Strategic Force Scorecard:** Quantified health check measuring brand pull against market friction.
3. **The Decision Matrix:** Direct, data-backed recommendation on the Strategic Goal.

### Constraints
- **Tone:** Clinical, strategic, and highly technical. Written for a CMO or VP audience.
- **No filler.** Every sentence must reference specific data from the intake.
- **Logic:** Every signal suggested must tie back to the Strategic Decision.
"""


class PillarScore(BaseModel):
    label: str
    score: int

class BriefRequest(BaseModel):
    research_intent: str
    parameters: List[PillarScore]
    pillar_extractions: Optional[Dict[str, Any]] = None
    context_document: Optional[str] = None
    template: Optional[str] = None

class BriefResponse(BaseModel):
    brief: str


@router.post("/generate-brief", response_model=BriefResponse)
def generate_strategic_brief(request: BriefRequest):
    """
    Synthesis Layer: converts structured pillar extractions into
    Artifact 1 (Strategic Research Brief .md) using the spec-compliant prompt.
    """
    try:
        # Build rich user prompt using pillar extractions
        pillar_block = "\n".join(
            f"- **{p.label}** (Score: {p.score}/100)" for p in request.parameters
        )

        extractions_block = ""
        if request.pillar_extractions:
            extractions_block = f"\n\n### Structured Pillar Extractions (PRIMARY DATA SOURCE)\n```json\n{json.dumps(request.pillar_extractions, indent=2)}\n```\nCRITICAL: Use the SPECIFIC data in these extractions (competitor names, timelines, hypotheses, geographic scope) to populate every section of the brief. Do NOT use generic placeholders."

        context_block = ""
        if request.context_document:
            context_block = f"\n\n### Uploaded Research Context\n```\n{request.context_document[:2000]}\n```"

        template_block = ""
        if request.template and request.template != "none":
            template_block = f"\n\n**Study Type / Archetype:** {request.template}"

        user_prompt = f"""## Client Intake Summary

**North Star Research Intent:**
{request.research_intent}
{template_block}

**Diagnostic Pillar Scores:**
{pillar_block}
{extractions_block}
{context_block}

---

Please synthesize the above intake into a full Strategic Research Brief following the required output structure.
Use the exact data from pillar_extractions to populate each section. Do NOT invent data that was not provided.
"""

        brief_text = call_openrouter(
            system_prompt=STRATEGIC_BRIEF_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            expect_json=False,
            model="google/gemini-pro-1.5-exp:free"
        )

        # Save Artifact 1 to disk
        with open("Strategic_Brief.md", "w") as f:
            f.write(f"# Outtlyr Strategic Research Brief\n\n")
            f.write(f"**Research Intent:** {request.research_intent}\n\n")
            f.write("---\n\n")
            f.write(brief_text)

        # ── DEV BYPASS CAPTURE: Save snapshot of this run ──
        import pathlib
        capture_dir = pathlib.Path("latest_run_data")
        capture_dir.mkdir(exist_ok=True)
        (capture_dir / "latest_intent.txt").write_text(request.research_intent, encoding="utf-8")
        (capture_dir / "latest_brief.md").write_text(brief_text, encoding="utf-8")

        return BriefResponse(brief=brief_text)

    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            raise HTTPException(status_code=500, detail="Missing API Key.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

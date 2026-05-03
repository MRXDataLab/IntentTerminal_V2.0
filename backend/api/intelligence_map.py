"""
intelligence_map.py — Outtlyr Intelligence Map API

Endpoints:
  POST /api/intelligence/generate       — Generate the map topology
  POST /api/intelligence/insight         — Get insight for a hypothesis
  POST /api/intelligence/doubledown      — Spend Intel Units to go deeper
  GET  /api/intelligence/convergence     — Get current convergence stage
  POST /api/intelligence/convergence/set — Set convergence stage (demo)
  GET  /api/intelligence/intel-balance   — Current Intel Unit balance
  GET  /api/intelligence/export          — Export timeline CSV
"""

import json
import csv
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter
from services.force_taxonomy import FORCES, FORCE_COLORS, FORCE_NAMES
from core.intel_manager import get_intel_manager, reset_intel_manager
from kb.kb_loader import load_kb

router = APIRouter()

# Session state
_map_state: Dict[str, Any] = {}
_convergence_stage: int = 0  # 0=not started, 1=25%, 2=50%, 3=75%, 4=100%
_insights_log: List[Dict[str, Any]] = []

def _get_intelligence_map_prompt() -> str:
    """Load the Intelligence Map topology generation prompt from KB."""
    return load_kb("agents/intelligence_map_agent.md")

def _get_intelligence_insight_prompt() -> str:
    """Load the Intelligence insight synthesis prompt from KB."""
    return load_kb("agents/intelligence_insight_agent.md")


class IntelligenceMapRequest(BaseModel):
    intent: str
    brief: Optional[str] = None
    manifest: Optional[Dict[str, Any]] = None
    graph_nodes: Optional[List[str]] = None


class InsightRequest(BaseModel):
    hypothesis_id: str
    hypothesis_label: Optional[str] = None
    hypothesis_description: Optional[str] = None
    study_context: Optional[str] = None


class DoubleDownRequest(BaseModel):
    hypothesis_id: str
    intel_cost: int = 100


class ConvergenceSetRequest(BaseModel):
    stage: int  # 1=25%, 2=50%, 3=75%, 4=100%


@router.post("/intelligence/generate")
def generate_intelligence_map(request: IntelligenceMapRequest):
    global _map_state, _convergence_stage, _insights_log
    try:
        # Build forces reference for the prompt
        forces_ref = "\n".join([f"- {name}: {data['description']}" for name, data in FORCES.items()])

        brief_section = f"\n\n=== STRATEGIC BRIEF ===\n{request.brief[:7000]}\n=== END ===" if request.brief else ""
        manifest_section = f"\n\n=== MANIFEST ===\n{json.dumps(request.manifest, indent=1)[:5000]}\n=== END ===" if request.manifest else ""

        user_prompt = (
            f"Research Intent: {request.intent}"
            f"{brief_section}{manifest_section}"
            f"\n\nThe 5 Strategic Forces:\n{forces_ref}"
            f"\n\nGenerate the Intelligence Map topology. Include 3-5 explicit hypotheses from the brief "
            f"and exactly 5 suggested hypotheses the AI discovers. Each hypothesis needs insight branches and signal clusters."
        )

        topology = call_openrouter(
            system_prompt=_get_intelligence_map_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
        )

        if "map_id" not in topology:
            topology["map_id"] = str(uuid.uuid4())[:8]

        # Normalize nodes
        for node in topology.get("nodes", []):
            node.setdefault("description", "")
            node.setdefault("force", None)
            node.setdefault("confirmation_status", None)
            node.setdefault("intel_cost", None)
            node.setdefault("signal_tags", [])
            node.setdefault("signal_count", 0)
            node.setdefault("platform", None)
            node.setdefault("sample_quote", None)
            node.setdefault("suggested_action", None)
            node.setdefault("label", node.get("id", "Unknown"))

        # Build links for force-graph compatibility
        topology["links"] = topology.get("edges", [])

        # Reset session state
        _map_state = topology
        _convergence_stage = 0
        _insights_log = []
        reset_intel_manager(5000)

        return {"status": "success", "topology": topology, "intel_balance": get_intel_manager().get_balance()}

    except Exception as e:
        fallback = {
            "map_id": str(uuid.uuid4())[:8],
            "nodes": [{"id": "error", "label": "Generation Failed", "type": "root", "description": str(e)[:200], "force": None}],
            "edges": [], "links": [],
        }
        return {"status": "error", "topology": fallback, "error": str(e)}





@router.post("/intelligence/insight")
def get_hypothesis_insight(request: InsightRequest):
    global _insights_log
    try:
        user_prompt = (
            f"Hypothesis: {request.hypothesis_label or request.hypothesis_id}\n"
            f"Description: {request.hypothesis_description or 'No description'}\n"
            f"Study Context: {request.study_context or 'Market research study'}\n\n"
            f"Generate the detailed insight with signal evidence and suggested action."
        )

        insight = call_openrouter(
            system_prompt=_get_intelligence_insight_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
        )

        # Log for export
        _insights_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hypothesis_id": request.hypothesis_id,
            "hypothesis_label": request.hypothesis_label,
            **insight,
        })

        return {"status": "success", "hypothesis_id": request.hypothesis_id, "insight": insight}

    except Exception as e:
        return {
            "status": "error",
            "hypothesis_id": request.hypothesis_id,
            "insight": {
                "headline": "Insight generation failed",
                "insight_text": str(e)[:200],
                "force": "Unknown", "force_impact_pct": 0,
                "confirmation_status": "inconclusive", "signal_count": 0,
                "intensity": "LOW", "top_signals": [], "suggested_action": "Retry analysis.",
            },
        }


@router.post("/intelligence/doubledown")
def double_down(request: DoubleDownRequest):
    """Spend Intel Units to go deeper into a suggested hypothesis."""
    mgr = get_intel_manager()
    result = mgr.spend(request.hypothesis_id, request.intel_cost, reason="Double Down investigation")

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Generate deeper analysis
    try:
        node = None
        for n in _map_state.get("nodes", []):
            if n["id"] == request.hypothesis_id:
                node = n
                break

        deeper = call_openrouter(
            system_prompt=_get_intelligence_insight_prompt(),
            user_prompt=(
                f"DEEP INVESTIGATION MODE. The client has allocated {request.intel_cost} Intel Units for deeper analysis.\n"
                f"Hypothesis: {node['label'] if node else request.hypothesis_id}\n"
                f"Description: {node['description'] if node else 'Unknown'}\n\n"
                f"Provide a MORE DETAILED insight with 5+ signal evidence cards and a specific, actionable recommendation."
            ),
            expect_json=True,
        )

        _insights_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hypothesis_id": request.hypothesis_id,
            "type": "double_down",
            "intel_spent": request.intel_cost,
            **deeper,
        })

        return {
            "status": "success",
            "hypothesis_id": request.hypothesis_id,
            "intel_result": result,
            "deeper_insight": deeper,
        }

    except Exception as e:
        return {"status": "error", "intel_result": result, "error": str(e)}


CONVERGENCE_STAGES = {
    0: {"pct": 0, "label": "Not Started", "description": "Awaiting signal ingestion."},
    1: {"pct": 25, "label": "Signal Scan", "description": "Initial signal scan complete. Hypotheses seeded."},
    2: {"pct": 50, "label": "Force Vectors", "description": "Signal density stabilizing. Force vectors emerging."},
    3: {"pct": 75, "label": "Hypothesis Resolution", "description": "Confirming/debunking hypotheses. Suggested hypotheses surfacing."},
    4: {"pct": 100, "label": "Final Report", "description": "All hypotheses resolved. Intelligence Map complete. Export ready."},
}


@router.get("/intelligence/convergence")
def get_convergence():
    stage_data = CONVERGENCE_STAGES.get(_convergence_stage, CONVERGENCE_STAGES[0])
    return {"status": "success", "stage": _convergence_stage, **stage_data}


@router.post("/intelligence/convergence/set")
def set_convergence(request: ConvergenceSetRequest):
    """Demo button: manually set convergence stage."""
    global _convergence_stage
    if request.stage not in CONVERGENCE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Use 0-4.")
    _convergence_stage = request.stage
    stage_data = CONVERGENCE_STAGES[_convergence_stage]
    return {"status": "success", "stage": _convergence_stage, **stage_data}


@router.get("/intelligence/intel-balance")
def get_intel_balance():
    return {"status": "success", **get_intel_manager().get_balance()}


@router.get("/intelligence/export")
def export_timeline():
    """Export all insights and signals as a timestamped CSV."""
    output = io.StringIO()
    fieldnames = [
        "timestamp", "hypothesis_id", "hypothesis_label", "type",
        "headline", "confirmation_status", "force", "intensity",
        "signal_count", "suggested_action", "intel_spent",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for entry in _insights_log:
        writer.writerow({
            "timestamp": entry.get("timestamp", ""),
            "hypothesis_id": entry.get("hypothesis_id", ""),
            "hypothesis_label": entry.get("hypothesis_label", ""),
            "type": entry.get("type", "insight"),
            "headline": entry.get("headline", ""),
            "confirmation_status": entry.get("confirmation_status", ""),
            "force": entry.get("force", ""),
            "intensity": entry.get("intensity", ""),
            "signal_count": entry.get("signal_count", 0),
            "suggested_action": entry.get("suggested_action", ""),
            "intel_spent": entry.get("intel_spent", 0),
        })

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=outtlyr_intelligence_timeline.csv"},
    )

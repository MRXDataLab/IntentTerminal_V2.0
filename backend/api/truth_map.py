"""
Truth Map API — Generates and serves the Living Truth Map topology.

Endpoints:
  POST /api/truth-map/generate       — Generate topology from brief + manifest
  POST /api/truth-map/node/insight    — Tap 1: Synthesized insight for a node
  POST /api/truth-map/node/signals    — Tap 2: Synthetic signal evidence cards
  POST /api/truth-map/node/unlock     — Double Down: IU-gated emergent unlock
  GET  /api/truth-map/convergence     — Convergence % + node states
  GET  /api/truth-map/iu-balance      — Current IU balance
  POST /api/truth-map/iu-add          — Add IUs to balance
"""

import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.llm_client import call_openrouter
from kb.kb_loader import load_kb
from core.iu_manager import get_iu_manager
from core.ingestion_sim import get_ingestion_simulator, reset_ingestion_simulator

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPTS — Loaded from KB
# ──────────────────────────────────────────────────────────────────────────────

def _get_truth_map_prompt() -> str:
    """Load the truth map topology generation prompt from KB."""
    return load_kb("agents/truth_map_agent.md")

def _get_insight_prompt() -> str:
    """Load the node insight synthesis prompt from KB."""
    return load_kb("agents/insight_agent.md")

def _get_signals_prompt() -> str:
    """Load the signal evidence card generation prompt from KB."""
    return load_kb("agents/signal_agent.md")


# ──────────────────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ──────────────────────────────────────────────────────────────────────────────

class TruthMapGenerateRequest(BaseModel):
    intent: str
    brief: Optional[str] = None
    manifest: Optional[Dict[str, Any]] = None
    graph_nodes: Optional[List[str]] = None

class NodeActionRequest(BaseModel):
    node_id: str
    node_label: Optional[str] = None
    node_description: Optional[str] = None
    study_context: Optional[str] = None

class IUAddRequest(BaseModel):
    amount: int


# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/truth-map/generate")
def generate_truth_map(request: TruthMapGenerateRequest):
    """Generate the Living Truth Map topology from brief + manifest."""
    try:
        brief_section = ""
        if request.brief:
            brief_section = f"\n\n=== STRATEGIC RESEARCH BRIEF ===\n{request.brief[:7000]}\n=== END BRIEF ==="

        manifest_section = ""
        if request.manifest:
            manifest_section = f"\n\n=== LINK FARMING MANIFEST ===\n{json.dumps(request.manifest, indent=2)[:5000]}\n=== END MANIFEST ==="

        graph_nodes_section = ""
        if request.graph_nodes:
            graph_nodes_section = f"\n\n=== APPROVED CATEGORY GRAPH NODES ===\n{json.dumps(request.graph_nodes[:50])}\n=== END GRAPH NODES ==="

        user_prompt = (
            f"Research Intent: {request.intent}"
            f"{brief_section}"
            f"{manifest_section}"
            f"{graph_nodes_section}"
            f"\n\nGenerate the Living Truth Map topology JSON. Use the approved category graph nodes as the foundation. "
            f"Include both explicit hypotheses from the brief AND 2-3 AI-suggested emergent hypotheses with unlock costs."
        )

        topology = call_openrouter(
            system_prompt=_get_truth_map_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
        )

        # Ensure topology_id
        if "topology_id" not in topology or not topology["topology_id"]:
            study_id = request.manifest.get("study_id", str(uuid.uuid4())) if request.manifest else str(uuid.uuid4())
            topology["topology_id"] = study_id

        # Normalize for force-graph compatibility
        # Ensure nodes have required fields
        for node in topology.get("nodes", []):
            node.setdefault("ui_state", "primary")
            node.setdefault("force_impact", None)
            node.setdefault("live_status", None)
            node.setdefault("unlock_cost_iu", None)
            node.setdefault("description", "")
            node.setdefault("label", node.get("id", "Unknown"))

        # Build links array for react-force-graph compatibility
        topology["links"] = topology.get("edges", [])

        # Initialize the ingestion simulator with the topology nodes
        simulator = reset_ingestion_simulator()
        simulator.initialize(topology.get("nodes", []))

        # Reset IU manager for new study
        from core.iu_manager import reset_iu_manager
        reset_iu_manager(starting_balance=5000)

        return {
            "status": "success",
            "topology": topology,
            "iu_balance": get_iu_manager().get_balance(),
        }

    except Exception as e:
        # Fallback topology
        fallback = {
            "topology_id": str(uuid.uuid4()),
            "nodes": [
                {"id": "error_root", "label": "Generation Failed", "type": "root", "ui_state": "core", "description": str(e)[:100], "force_impact": None, "live_status": None, "unlock_cost_iu": None},
            ],
            "edges": [],
            "links": [],
        }
        return {"status": "error", "topology": fallback, "error": str(e)}


@router.post("/truth-map/node/insight")
def get_node_insight(request: NodeActionRequest):
    """Tap 1: Get the synthesized macro insight for a node."""
    try:
        user_prompt = (
            f"Node: {request.node_label or request.node_id}\n"
            f"Description: {request.node_description or 'No description available'}\n"
            f"Study Context: {request.study_context or 'General market research study'}\n\n"
            f"Generate the synthesized insight card for this node."
        )

        insight = call_openrouter(
            system_prompt=_get_insight_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
        )

        return {"status": "success", "node_id": request.node_id, "insight": insight}

    except Exception as e:
        return {
            "status": "error",
            "node_id": request.node_id,
            "insight": {
                "headline": "Insight generation failed",
                "insight_text": f"Unable to generate insight: {str(e)[:100]}",
                "force_impact_label": "Unknown",
                "force_impact_pct": 0,
                "severity": "low",
                "correlated_nodes": [],
            },
        }


@router.post("/truth-map/node/signals")
def get_node_signals(request: NodeActionRequest):
    """Tap 2: Get synthetic signal evidence cards for a node."""
    try:
        user_prompt = (
            f"Node: {request.node_label or request.node_id}\n"
            f"Description: {request.node_description or 'No description available'}\n"
            f"Study Context: {request.study_context or 'General market research study'}\n\n"
            f"Generate 3-5 realistic synthetic signal evidence cards that a scraper would find "
            f"when investigating this hypothesis. Make them feel authentic and platform-specific."
        )

        signals_data = call_openrouter(
            system_prompt=_get_signals_prompt(),
            user_prompt=user_prompt,
            expect_json=True,
        )

        return {"status": "success", "node_id": request.node_id, "evidence": signals_data}

    except Exception as e:
        return {
            "status": "error",
            "node_id": request.node_id,
            "evidence": {"signals": []},
        }


@router.post("/truth-map/node/unlock")
def unlock_node(request: NodeActionRequest):
    """Double Down: Deduct IUs and unlock an emergent node for investigation."""
    # Default cost; frontend should pass the actual cost from the node data
    cost = 50  # Will be overridden by node's unlock_cost_iu if available

    iu_mgr = get_iu_manager()
    result = iu_mgr.allocate(node_id=request.node_id, cost=cost)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Transition node in the ingestion simulator
    simulator = get_ingestion_simulator()
    simulator.unlock_node(request.node_id)

    return {
        "status": "success",
        "node_id": request.node_id,
        "iu_result": result,
        "node_state": simulator.get_node_state(request.node_id),
    }


@router.get("/truth-map/convergence")
def get_convergence():
    """Get the current convergence state (polled by frontend every 3s)."""
    simulator = get_ingestion_simulator()
    # Advance the simulation by one tick
    convergence = simulator.tick()
    return {
        "status": "success",
        **convergence,
    }


@router.get("/truth-map/iu-balance")
def get_iu_balance():
    """Get the current IU balance."""
    return {
        "status": "success",
        **get_iu_manager().get_balance(),
    }


@router.post("/truth-map/iu-add")
def add_iu_units(request: IUAddRequest):
    """Add more IUs to the session balance."""
    result = get_iu_manager().add_units(request.amount)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"status": "success", **result}

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
from core.iu_manager import get_iu_manager
from core.ingestion_sim import get_ingestion_simulator, reset_ingestion_simulator

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPTS
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TRUTH_MAP = """You are the Outllyr Antigravity Topology Architect.
You will receive a Strategic Research Brief and a Link Farming Manifest. Your job is to generate a Living Truth Map topology — a WebGL-compatible graph payload that represents the "Physics of the Market" for this study.

CRITICAL RULES:
1. Extract ALL node names from the Brief and Manifest — use real entity names, not generic categories.
2. Generate BOTH explicit hypotheses (from the brief) AND 2-3 suggested/emergent hypotheses the AI discovers.
3. Map every hypothesis to specific source terrain nodes (platforms, subreddits, review clusters).
4. Assign force_impact to every hypothesis node from: "Demand Gravity", "Choice Architecture", "Value Elasticity", "Reinforcement Stability", "Competitive Energy".

Output MUST be strict JSON matching this schema:
{
  "topology_id": "auto-generated",
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "label": "Human Readable Label",
      "type": "root | explicit_hypothesis | suggested_hypothesis | source_terrain",
      "description": "1-2 sentence description of what this node represents",
      "ui_state": "core | primary | emergent | source_terrain",
      "force_impact": "One of the 5 forces OR null for root/source_terrain",
      "live_status": "pending | ingesting | converged (for source_terrain only, null otherwise)",
      "unlock_cost_iu": null (or integer like 50 for suggested_hypothesis nodes)
    }
  ],
  "edges": [
    {
      "source": "source_node_id",
      "target": "target_node_id",
      "relationship": "investigates | suggests_investigation | scraped_from",
      "weight": 1-5,
      "dashed": false (true for suggests_investigation edges)
    }
  ]
}

TOPOLOGY STRUCTURE:
- 1 root node (the core business problem)
- 3-5 explicit_hypothesis nodes (directly from the brief's hypotheses/tiers)
- 2-3 suggested_hypothesis nodes (AI-discovered, with unlock_cost_iu of 50-100)
- 4-8 source_terrain nodes (specific platforms: r/subreddit, YouTube channels, Amazon review clusters, news outlets)
- Edges connect root → hypotheses (investigates), root → suggested (suggests_investigation, dashed=true), hypotheses → source_terrain (scraped_from)
"""

SYSTEM_PROMPT_INSIGHT = """You are an Outllyr Strategic Analyst. Given a node from the Living Truth Map and the study context, generate a synthesized macro insight.

Your output MUST be strict JSON:
{
  "headline": "One-line insight headline (max 15 words)",
  "insight_text": "2-3 sentence strategic insight explaining WHY this node matters and what the data shows. Be specific with percentages and behavioral patterns.",
  "force_impact_label": "The Strategic Force this impacts",
  "force_impact_pct": -15 to +15 (percentage impact, negative = erosion, positive = reinforcement),
  "severity": "critical | high | moderate | low",
  "correlated_nodes": ["list of 1-3 related node labels that this insight correlates with"]
}
"""

SYSTEM_PROMPT_SIGNALS = """You are an Outllyr Digital Exhaust Analyst. Given a node and study context, generate 3-5 realistic synthetic signal evidence cards that represent the kind of raw data a scraper would find.

Each signal card should feel like a REAL comment/review/post from the internet. Include platform-specific language patterns.

Your output MUST be strict JSON:
{
  "signals": [
    {
      "source_platform": "Reddit r/subreddit | YouTube | Amazon Reviews | Twitter | News Article",
      "source_url": "realistic URL for this platform",
      "timestamp": "ISO timestamp (recent, within last 30 days)",
      "author": "realistic username",
      "content": "The actual verbatim comment text (2-4 sentences, realistic tone)",
      "signal_tags": ["tag_1", "tag_2"],
      "sentiment": -1.0 to 1.0,
      "engagement": {"upvotes": 0, "replies": 0}
    }
  ]
}

RULES:
- Make comments feel AUTHENTIC — use casual language, typos, emotional tone
- Tags should come from the study's signal_taxonomy
- Vary platforms across the cards
- Content must be directly relevant to the node's hypothesis
"""


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
            system_prompt=SYSTEM_PROMPT_TRUTH_MAP,
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
            system_prompt=SYSTEM_PROMPT_INSIGHT,
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
            system_prompt=SYSTEM_PROMPT_SIGNALS,
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

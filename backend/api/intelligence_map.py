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

Note on node types:
  ``explicit_hypothesis`` nodes — when a Hypothesis Manifest is supplied via
  the ``hypothesis_manifest`` request field — are sourced 1:1 from the manifest
  and preserve hypothesis IDs verbatim (Property 17 cross-stage ID propagation).
  ``suggested_hypothesis`` nodes are reserved for emergent hypotheses surfaced
  mid-study from signal anomalies; the full implementation is deferred per
  Section 18 of UPDATE_HYPOTHESIS_GENERATION.md.
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
from services.force_taxonomy import FORCES, FORCE_COLORS, FORCE_NAMES, SLUG_TO_FORCE
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
    manifest: Optional[Dict[str, Any]] = None  # Link Farming manifest (existing semantics)
    hypothesis_manifest: Optional[Dict[str, Any]] = None  # Hypothesis Manifest from the Hypothesis Engine
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


def _build_explicit_hypothesis_nodes(hypothesis_manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Pre-compute explicit_hypothesis nodes from the Hypothesis Manifest.

    Builds one Intelligence Map node per hypothesis in the manifest while
    preserving the manifest hypothesis ID verbatim — this preservation enables
    the cross-stage ID propagation invariant (Property 17). Force assignment
    is converted from snake_case slug to the Title Case label used in the rest
    of the Intelligence Map UI via ``SLUG_TO_FORCE``.

    Note: ``suggested_hypothesis`` nodes are intentionally NOT generated here.
    They are reserved for emergent hypotheses surfaced from signal anomalies
    mid-study; the full implementation is deferred per Section 18 of
    ``UPDATE_HYPOTHESIS_GENERATION.md``.
    """
    explicit_nodes: List[Dict[str, Any]] = []
    core_problems = hypothesis_manifest.get("core_problems") or []
    for cp in core_problems:
        for h in cp.get("hypotheses", []) or []:
            statement = h.get("statement", "") or ""
            expected_signals = list(h.get("expected_signals") or [])
            slug = h.get("force_assignment")
            force_label = SLUG_TO_FORCE.get(slug, slug) if slug else None

            explicit_nodes.append({
                "id": h["id"],                       # preserved verbatim — Property 17
                "label": statement[:80],
                "type": "explicit_hypothesis",
                "description": h.get("rationale", "") or "",
                "force": force_label,
                "dimension": h.get("dimension"),
                "contrarian_pair_id": h.get("contrarian_pair_id"),
                "signal_tags": expected_signals,
                "signal_count": len(expected_signals),
                "source_hypothesis_id": h["id"],     # explicit traceability field
            })
    return explicit_nodes


def _force_explicit_hypotheses(
    topology: Dict[str, Any],
    explicit_nodes: List[Dict[str, Any]],
    explicit_ids: Optional[set] = None,
) -> Dict[str, Any]:
    """Enforce a 1:1 mapping between manifest hypotheses and topology nodes.

    Pure function — returns a new topology dict without mutating the input.

    Behavior:
      * Drop any LLM-emitted ``explicit_hypothesis`` node whose ``id`` is NOT
        present in the manifest's pre-built explicit set (the LLM hallucinated
        a hypothesis instead of preserving the supplied one).
      * For any manifest hypothesis ID missing from the LLM topology, force-add
        the pre-built node from ``explicit_nodes``.
      * Preserve every other node and every edge intact — including edges that
        attach to preserved manifest hypotheses.

    ``explicit_ids`` may be passed in for clarity (it is the set of manifest
    hypothesis IDs); when omitted, it is derived from ``explicit_nodes``.
    """
    if explicit_ids is None:
        explicit_ids = {n["id"] for n in explicit_nodes}
    incoming_nodes: List[Dict[str, Any]] = list(topology.get("nodes", []) or [])

    # Filter: keep all non-explicit nodes; for explicit_hypothesis, keep only
    # those whose id matches the manifest set.
    filtered_nodes: List[Dict[str, Any]] = []
    seen_explicit_ids: set = set()
    dropped_ids: List[str] = []
    for node in incoming_nodes:
        if node.get("type") == "explicit_hypothesis":
            node_id = node.get("id")
            if node_id in explicit_ids:
                filtered_nodes.append(node)
                seen_explicit_ids.add(node_id)
            else:
                dropped_ids.append(node_id or "<no-id>")
        else:
            filtered_nodes.append(node)

    # Force-add any manifest hypothesis the LLM dropped or never emitted.
    forced_ids: List[str] = []
    for pre_built in explicit_nodes:
        if pre_built["id"] not in seen_explicit_ids:
            filtered_nodes.append(pre_built)
            forced_ids.append(pre_built["id"])

    if dropped_ids:
        print(f"[intelligence_map] LLM emitted explicit_hypothesis nodes outside the manifest; dropped: {dropped_ids}")
    if forced_ids:
        print(f"[intelligence_map] LLM omitted manifest hypotheses; force-added: {forced_ids}")

    new_topology = dict(topology)
    new_topology["nodes"] = filtered_nodes
    return new_topology


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

        # ----------------------------------------------------------------
        # Hypothesis Manifest consumption (Requirements 16.1 – 16.6)
        # ----------------------------------------------------------------
        # When a Hypothesis Manifest is supplied, pre-compute the
        # explicit_hypothesis nodes from it and inject them into the LLM
        # prompt with an explicit "DO NOT REGENERATE" sentinel so the LLM
        # preserves them verbatim. After the LLM returns we post-process
        # the topology to enforce a strict 1:1 mapping between manifest
        # hypotheses and explicit_hypothesis nodes.
        explicit_hypothesis_nodes: List[Dict[str, Any]] = []
        explicit_hypothesis_ids: set = set()
        if request.hypothesis_manifest and (request.hypothesis_manifest.get("core_problems")):
            explicit_hypothesis_nodes = _build_explicit_hypothesis_nodes(request.hypothesis_manifest)
            explicit_hypothesis_ids = {n["id"] for n in explicit_hypothesis_nodes}

            user_prompt += (
                "\n\n=== PRE-LOADED EXPLICIT HYPOTHESES (DO NOT REGENERATE) ===\n"
                "CRITICAL: The hypotheses listed below come from a pre-generated Hypothesis Manifest.\n"
                "You MUST preserve them in the topology with their exact IDs (h_001, h_002, ...).\n"
                "Do NOT generate alternative explicit_hypothesis nodes. You MAY generate suggested_hypothesis nodes\n"
                "for emergent patterns, but every explicit_hypothesis MUST come from this list verbatim.\n"
                "\n```json\n"
                + json.dumps(explicit_hypothesis_nodes, indent=1)[:5000]
                + "\n```\n=== END PRE-LOADED HYPOTHESES ==="
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

        # When a Hypothesis Manifest was supplied, enforce 1:1 mapping
        # between manifest hypotheses and explicit_hypothesis nodes.
        if explicit_hypothesis_nodes:
            topology = _force_explicit_hypotheses(topology, explicit_hypothesis_nodes)
            # Re-normalize any newly force-added nodes (defaults for fields
            # the manifest builder doesn't populate).
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
        _convergence_stage = 1  # Start at 25% — don't show full map
        _insights_log = []
        reset_intel_manager(5000)

        return {"status": "success", "topology": topology, "intel_balance": get_intel_manager().get_balance(), "convergence": CONVERGENCE_STAGES[1], "node_states": DEMO_NODE_STATES[1]}

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
    1: {"pct": 25, "label": "25% Timeline", "description": "Early signal scan. Some hypotheses may already be confirmed while others are still collecting data."},
    2: {"pct": 50, "label": "50% Timeline", "description": "Midpoint. Multiple hypotheses resolved. Suggested hypotheses beginning to emerge from the data."},
    3: {"pct": 75, "label": "75% Timeline", "description": "Most hypotheses resolved. All suggested hypotheses visible. Signal density stabilized for majority of nodes."},
    4: {"pct": 100, "label": "Complete", "description": "Study complete. All hypotheses resolved. Final report ready for export."},
}

# Per-node state at each convergence point (for demo)
# A hypothesis is ONLY "confirmed/filled" when ALL its child insight branches + signal clusters are visible.
# Suggested hypotheses pop up WITH all their children at once — they don't appear partially.
DEMO_NODE_STATES = {
    0: {
        "explicit_hypothesis": {"visible": True, "states": {0: "pending", 1: "pending", 2: "pending", 3: "pending", 4: "pending"}},
        "suggested_hypothesis": {"visible": False, "max_visible": 0},
        "insight_branch": {"visible_pct": 0.0},
        "signal_cluster": {"visible_pct": 0.0},
    },
    1: {
        # 25%: H1 fully confirmed (all its children visible), H2 verifying (some children), H3 pending (no children)
        "explicit_hypothesis": {"visible": True, "states": {0: "confirmed", 1: "verifying", 2: "pending", 3: "pending", 4: "pending"}},
        "suggested_hypothesis": {"visible": False, "max_visible": 0},
        "insight_branch": {"visible_pct": 0.3},
        "signal_cluster": {"visible_pct": 0.2},
        # H1's children are all in the first 30% of insight branches
    },
    2: {
        # 50%: H1+H2 confirmed (all their children visible), H3 verifying. S1 pops up WITH all its children.
        "explicit_hypothesis": {"visible": True, "states": {0: "confirmed", 1: "confirmed", 2: "verifying", 3: "pending", 4: "pending"}},
        "suggested_hypothesis": {"visible": True, "max_visible": 2, "pop_with_children": True},
        "insight_branch": {"visible_pct": 0.6},
        "signal_cluster": {"visible_pct": 0.5},
    },
    3: {
        # 75%: All explicit resolved (H3 debunked). 4 suggested visible with all children.
        "explicit_hypothesis": {"visible": True, "states": {0: "confirmed", 1: "confirmed", 2: "debunked", 3: "confirmed", 4: "inconclusive"}},
        "suggested_hypothesis": {"visible": True, "max_visible": 4, "pop_with_children": True},
        "insight_branch": {"visible_pct": 0.9},
        "signal_cluster": {"visible_pct": 0.8},
    },
    4: {
        # 100%: Everything visible and resolved.
        "explicit_hypothesis": {"visible": True, "states": {0: "confirmed", 1: "confirmed", 2: "debunked", 3: "confirmed", 4: "confirmed"}},
        "suggested_hypothesis": {"visible": True, "max_visible": 5, "pop_with_children": True},
        "insight_branch": {"visible_pct": 1.0},
        "signal_cluster": {"visible_pct": 1.0},
    },
}

# Notifications triggered at each stage transition
DEMO_NOTIFICATIONS = {
    1: [
        {"type": "hypothesis_confirmed", "message": "✅ H1 hypothesis confirmed — strong signal convergence detected", "timestamp": None},
        {"type": "signals_batch", "message": "📡 127 new signals captured across Reddit and YouTube", "timestamp": None},
    ],
    2: [
        {"type": "hypothesis_confirmed", "message": "✅ H2 hypothesis confirmed — 78% signal alignment", "timestamp": None},
        {"type": "new_hypothesis", "message": "🔮 New hypothesis discovered: emerging pattern in competitor data", "timestamp": None},
        {"type": "signals_batch", "message": "📡 284 total signals captured. Force vectors stabilizing.", "timestamp": None},
    ],
    3: [
        {"type": "hypothesis_debunked", "message": "❌ H3 hypothesis debunked — signals contradict initial theory", "timestamp": None},
        {"type": "new_hypothesis", "message": "🔮 2 more suggested hypotheses emerged from signal analysis", "timestamp": None},
        {"type": "signals_batch", "message": "📡 412 total signals. Insight branches fully populated.", "timestamp": None},
    ],
    4: [
        {"type": "study_complete", "message": "🎯 Study complete. All hypotheses resolved. Final report ready.", "timestamp": None},
        {"type": "signals_batch", "message": "📡 Final count: 523 signals across 5 forces.", "timestamp": None},
    ],
}


@router.get("/intelligence/convergence")
def get_convergence():
    stage_data = CONVERGENCE_STAGES.get(_convergence_stage, CONVERGENCE_STAGES[0])
    node_states = DEMO_NODE_STATES.get(_convergence_stage, {})
    return {"status": "success", "stage": _convergence_stage, **stage_data, "node_states": node_states}


@router.post("/intelligence/convergence/set")
def set_convergence(request: ConvergenceSetRequest):
    """Demo button: manually set convergence timeline position."""
    global _convergence_stage
    if request.stage not in CONVERGENCE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Use 0-4.")
    _convergence_stage = request.stage
    stage_data = CONVERGENCE_STAGES[_convergence_stage]
    node_states = DEMO_NODE_STATES.get(_convergence_stage, {})
    notifications = DEMO_NOTIFICATIONS.get(_convergence_stage, [])
    # Add timestamps to notifications
    now = datetime.now(timezone.utc).isoformat()
    for n in notifications:
        n["timestamp"] = now
    return {"status": "success", "stage": _convergence_stage, **stage_data, "node_states": node_states, "notifications": notifications}


@router.get("/intelligence/intel-balance")
def get_intel_balance():
    return {"status": "success", **get_intel_manager().get_balance()}


@router.get("/intelligence/report")
def generate_final_report():
    """Generate the final intelligence report as a downloadable HTML file."""
    if _convergence_stage < 4:
        raise HTTPException(status_code=400, detail="Study not complete. Set convergence to 100% first.")

    try:
        # Build context from all logged insights
        insights_summary = json.dumps(_insights_log[:20], indent=1) if _insights_log else "No insights logged yet."

        # Build hypothesis summary from topology
        hypotheses = [n for n in _map_state.get("nodes", []) if "hypothesis" in (n.get("type") or "")]
        hyp_summary = json.dumps([{"id": h.get("id"), "label": h.get("label"), "type": h.get("type"), "force": h.get("force"), "description": h.get("description")} for h in hypotheses], indent=1)

        # Build topology context for flowchart
        nodes_summary = json.dumps([{"id": n.get("id"), "label": n.get("label"), "type": n.get("type")} for n in _map_state.get("nodes", [])], indent=1)
        edges_summary = json.dumps([{"source": e.get("source"), "target": e.get("target")} for e in _map_state.get("edges", [])], indent=1)

        report_prompt = f"""Generate a comprehensive, premium Final Intelligence Report as a standalone HTML5 document.

Study Context:
- Hypotheses analyzed: {len(hypotheses)}
- Insights generated: {len(_insights_log)}

Topology Data (for the flowchart):
Nodes: {nodes_summary}
Edges: {edges_summary}

Hypothesis Data:
{hyp_summary}

Insights Log:
{insights_summary}

You MUST follow these strict HTML formatting rules:
1. Provide valid, complete HTML5. DO NOT wrap the output in markdown code blocks like ```html ... ```. Output raw HTML only.
2. Use Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>` inside the `<head>`.
3. Use a sleek, modern dark mode design with glassmorphism effects, gradient text highlights, and premium typography (e.g., `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">`). Use `font-family: 'Inter', sans-serif;` for the body.
4. Include Mermaid.js via CDN at the end of the body to render the flowchart:
   `<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'; mermaid.initialize({{ startOnLoad: true, theme: 'dark' }});</script>`

The report MUST include these sections:
1. **Executive Summary**: A beautifully styled hero section (3-4 sentences).
2. **Hypothesis Topology**: Include a `<div class="mermaid">` element containing a Mermaid flowchart (e.g., `graph TD`) that accurately reflects the topology data provided (nodes and edges). Make it visual and structured. Use valid mermaid syntax, wrapping node labels in quotes if they contain special characters. Use node IDs internally and labels for display.
3. **Hypothesis Verdicts**: A styled table or CSS grid (hypothesis | status | force | key finding).
4. **Strategic Force Scorecard**: Use Tailwind to create progress bars or visual indicators showing which forces are strongest/weakest.
5. **Key Insights**: A beautifully styled grid of cards highlighting the top 5 findings, including their specific signal counts, demography stats, and top sources.
6. **Recommended Actions**: A prioritized list of actionable recommendations in styled boxes.

Write in a clinical, strategic tone for a CMO/VP audience. Use specific numbers from the insights. Return ONLY valid HTML."""

        report_text = call_openrouter(
            system_prompt="You are a senior strategic intelligence analyst and expert frontend web developer. You write beautiful HTML reports.",
            user_prompt=report_prompt,
            expect_json=False,
        )

        # Strip markdown code blocks if the LLM still returns them
        if report_text.startswith("```html"):
            report_text = report_text.replace("```html\n", "").replace("\n```", "")
        if report_text.startswith("```"):
            report_text = report_text.replace("```\n", "").replace("\n```", "")

        return StreamingResponse(
            io.StringIO(report_text),
            media_type="text/html",
            headers={"Content-Disposition": "attachment; filename=Outtlyr_Intelligence_Report.html"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import networkx as nx

from services.llm_client import call_openrouter

router = APIRouter()

class IntentPayload(BaseModel):
    intent: str
    brief: str | None = None

# We no longer use a fixed list of forces; categories are dynamically derived from the intent/brief.


SYSTEM_PROMPT_ECOSYSTEM_GENERIC = """You are a Strategic Ecosystem Graph Architect for Outllyr — a domain taxonomy and strategic intelligence expert.
Given a research intent, generate a clean, readable ecosystem landscape map.

CRITICAL RULES:
1. Derive 4-6 key thematic pillars directly from the research intent. DO NOT use generic categories.
2. Every node label MUST be condensed to 2-3 words maximum. No full sentences. Examples: "Price Sensitivity", "Gen-Z Churn", "Ola S1 Pro".
3. Keep the graph CLEAN: 4-6 categories, 2-4 nodes per category. Do not over-populate.

Your output MUST be a strict JSON object:
{
  "core_topic": "2-3 word core subject",
  "categories": [
    {
      "category_name": "2-3 Word Theme",
      "description": "Brief description of this point",
      "force_metadata": "One of: Demand Gravity, Choice Architecture, Value Elasticity, Reinforcement Stability, Competitive Energy",
      "nodes": ["2-3 Word Entity A", "2-3 Word Entity B", "2-3 Word Entity C"]
    }
  ]
}
"""

SYSTEM_PROMPT_ECOSYSTEM_WITH_BRIEF = """You are a Strategic Ecosystem Graph Architect for Outllyr.
You will receive a Research Intent and a fully synthesized Strategic Research Brief.
Your job is to convert them into a clean, readable Subject-Relationship Web.

CRITICAL RULES:
1. Extract nodes from ACTUAL named entities, brands, platforms, signals, rivals, and keywords found in the brief AND the intake conversation. DO NOT invent generic categories. You CAN use very close references to the topics, keywords, and rivals mentioned.
2. Every node label MUST be condensed to 2-3 words maximum. No full sentences. Examples: "Price Sensitivity", "Gen-Z Churn", "Ola S1 Pro", "r/IndiaEV".
3. The graph must remain CLEAN and READABLE. Limit to 4-6 subjects, 2-4 components per subject, and 1-3 signals per component. Do not over-populate any tier.

MAPPING LOGIC (6-Tier Semantic Market Web):

- "core_topic": The central business problem extracted from the Strategic Goal. Condensed to 2-4 words.

- "subjects" (Tier 1 — Hypotheses): The actual hypotheses to stress-test from the brief. MUST be prefixed with "H1: ", "H2: ", "H3: " etc. followed by a condensed 2-3 word label. Example: "H1: Price Erosion", "H2: Silent Churn", "H3: Brand Fatigue". Each MUST include a "description" field: one sentence explaining the hypothesis. Limit: 3-5 subjects.

- "components" (Tier 2 — Sub-topics): Specific sub-dimensions mapped to each hypothesis. Condensed to 2-3 words. Each MUST include a "description" field: one sentence explaining this research angle. Generate at least 5 components per subject to ensure depth.

- "signals" (Tier 3 — Internet Keywords): The actual search terms, forum topics, platform names, and related keywords the scrapers will hunt for. These should be SPECIFIC and RELEVANT to the parent component — include subreddit names, product names, trending phrases, review keywords, and niche forum terms. Condensed to 2-3 words each. Generate at least 5 signals per component. Be generous — more keywords give the graph depth.
  Each signal MUST include a "description" field: a single plain sentence explaining what this keyword captures and why it matters for the study.

- "context_nodes" (Tier 4 — Competitive & Market Context): Extract from the brief:
  - Visible Rivals (named competitors the client fights daily)
  - Ghost Rivals (white-label or indirect threats stealing share)
  - Market Triggers (the catalyst event that started this study)
  Attach each to the most relevant subject. Limit: 3-6 total across all subjects.

- "scope_nodes" (Tier 5 — Study Boundaries): Extract from the brief:
  - Geographic scope (e.g., "Tier-1 India", "Pan-US")
  - Temporal window (e.g., "Oct 2025 – Apr 2026")
  - Target cohort (e.g., "Gen-Z Gamers", "Urban Commuters")
  Attach to the root node. Limit: 2-4 total.

- "force_metadata": For EVERY node at every tier, assign one of the 5 Strategic Forces:
  Demand Gravity, Choice Architecture, Value Elasticity, Reinforcement Stability, Competitive Energy.

OUTPUT FORMAT — strict JSON, no markdown:
{
  "core_topic": "2-4 word problem statement",
  "subjects": [
    {
      "name": "H1: Price Erosion",
      "force_metadata": "One of the 5 forces",
      "description": "One sentence explaining this hypothesis.",
      "components": [
        {
          "name": "2-3 Word Sub-topic",
          "force_metadata": "One of the 5 forces",
          "description": "One sentence explaining this research angle.",
          "signals": [
            {"name": "2-3 Word Signal", "force_metadata": "One of the 5 forces", "description": "One sentence explaining what this keyword captures."}
          ]
        }
      ],
      "context_nodes": [
        {"name": "Rival or Trigger", "type": "visible_rival", "force_metadata": "Competitive Energy", "description": "One sentence about this rival or trigger."}
      ]
    }
  ],
  "scope_nodes": [
    {"name": "Tier-1 India", "type": "geography", "force_metadata": "Demand Gravity", "description": "Geographic focus of this study."},
    {"name": "Oct 25 – Apr 26", "type": "timeline", "force_metadata": "Demand Gravity", "description": "Temporal window for data collection."},
    {"name": "Gen-Z Gamers", "type": "cohort", "force_metadata": "Demand Gravity", "description": "Primary target audience for signal filtering."}
  ]
}
"""

def generate_dynamic_ecosystem_graph(intent: str, brief: str | None = None) -> Dict[str, Any]:
    try:
        if brief:
            system_prompt = SYSTEM_PROMPT_ECOSYSTEM_WITH_BRIEF
            user_prompt = (
                f"Research Intent: {intent}\n\n"
                f"=== STRATEGIC RESEARCH BRIEF (PRIMARY SOURCE) ===\n"
                f"{brief[:7000]}\n"
                f"=== END BRIEF ===\n\n"
                f"Generate the Category Graph JSON. Extract hypotheses, rivals, signals, geographic scope, "
                f"and timeline from the brief above. Condense every node label to 2-3 words. "
                f"Keep the graph structured: 3-5 hypotheses, at least 5 components each, at least 5 signals each."
            )
        else:
            system_prompt = SYSTEM_PROMPT_ECOSYSTEM_GENERIC
            user_prompt = f"Map the ecosystem for this research intent: {intent}"

        llm_result = call_openrouter(
            system_prompt=system_prompt, 
            user_prompt=user_prompt, 
            expect_json=True,
            model="mistralai/mistral-7b-instruct:free"
        )
        
        G = nx.DiGraph()
        
        core_topic = llm_result.get("core_topic", "Core Subject")
        G.add_node(core_topic, type="root", label=core_topic, force="root", description="The central business problem driving this research study.")
        
        # ── Tier 5: Scope nodes (geography, timeline, cohort) → attach to root ──
        for scope in llm_result.get("scope_nodes", []):
            scope_name = scope.get("name", "Unknown Scope")
            scope_type = scope.get("type", "scope")
            scope_force = scope.get("force_metadata", "Demand Gravity")
            scope_desc = scope.get("description", f"Study boundary: {scope_type}")
            G.add_node(scope_name, type="scope", label=scope_name, force=scope_force, scope_type=scope_type, subject="root", description=scope_desc)
            G.add_edge(core_topic, scope_name)
        
        # ── Tier 1-4: Subjects → Components → Signals → Context Nodes ──
        subjects = llm_result.get("subjects", [])
        if not subjects and "categories" in llm_result:  # fallback for generic prompt
            subjects = llm_result.get("categories", [])
            
        for subject in subjects:
            subj_name = subject.get("name", subject.get("category_name", "Unknown Subject"))
            subj_force = subject.get("force_metadata", "Demand Gravity")
            subj_desc = subject.get("description", "")
            
            G.add_node(subj_name, type="subject", label=subj_name, force=subj_force, subject=subj_name, description=subj_desc)
            G.add_edge(core_topic, subj_name)
            
            # Tier 2: Components
            components = subject.get("components", [])
            if not components and "nodes" in subject:  # fallback handling
                components = [{"name": n, "force_metadata": subj_force, "signals": []} for n in subject.get("nodes", [])]
                
            for comp in components:
                comp_name = comp.get("name", "Unknown Component")
                comp_force = comp.get("force_metadata", "Demand Gravity")
                comp_desc = comp.get("description", "")
                G.add_node(comp_name, type="component", label=comp_name, force=comp_force, subject=subj_name, description=comp_desc)
                G.add_edge(subj_name, comp_name)
                
                # Tier 3: Signals
                for sig in comp.get("signals", []):
                    sig_name = sig.get("name", "Unknown Signal")
                    sig_force = sig.get("force_metadata", "Demand Gravity")
                    sig_desc = sig.get("description", "")
                    G.add_node(sig_name, type="signal", label=sig_name, force=sig_force, subject=subj_name, description=sig_desc)
                    G.add_edge(comp_name, sig_name)
            
            # Tier 4: Context nodes (rivals, triggers) → attach to subject
            for ctx in subject.get("context_nodes", []):
                ctx_name = ctx.get("name", "Unknown Context")
                ctx_type = ctx.get("type", "context")
                ctx_force = ctx.get("force_metadata", "Competitive Energy")
                ctx_desc = ctx.get("description", f"{ctx_type.replace('_', ' ').title()} relevant to this hypothesis.")
                # Avoid duplicate node IDs by prefixing if needed
                node_id = ctx_name if ctx_name not in G else f"{ctx_name} ({subj_name[:10]})"
                G.add_node(node_id, type="context", label=ctx_name, force=ctx_force, context_type=ctx_type, subject=subj_name, description=ctx_desc)
                G.add_edge(subj_name, node_id)
                
        data = nx.node_link_data(G)
        data["links"] = data.get("edges", [])
        if "edges" in data:
            del data["edges"]
        return data
        
    except Exception as e:
        G = nx.DiGraph()
        err_msg = "Missing API Key" if "OPENROUTER_API_KEY" in str(e) else "LLM Generation Failed"
        G.add_node(err_msg, type="root", label=err_msg, force="root")
        G.add_node(str(e)[:50], type="category", label=str(e)[:50], force="error")
        G.add_edge(err_msg, str(e)[:50])
        data = nx.node_link_data(G)
        data["links"] = data.get("edges", [])
        if "edges" in data:
            del data["edges"]
        return data

@router.post("/generate-ecosystem")
def generate_ecosystem(payload: IntentPayload):
    graph_data = generate_dynamic_ecosystem_graph(payload.intent, payload.brief)
    
    # ── DEV BYPASS CAPTURE: Save snapshot of this run ──
    import pathlib
    capture_dir = pathlib.Path("latest_run_data")
    capture_dir.mkdir(exist_ok=True)
    (capture_dir / "latest_graph.json").write_text(
        json.dumps(graph_data, indent=2), encoding="utf-8"
    )
    
    return {
        "status": "success",
        "graph": graph_data
    }


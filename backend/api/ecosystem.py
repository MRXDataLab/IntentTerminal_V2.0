import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import networkx as nx

from services.llm_client import call_openrouter
from kb.kb_loader import load_kb

router = APIRouter()

class IntentPayload(BaseModel):
    intent: str
    brief: str | None = None

# We no longer use a fixed list of forces; categories are dynamically derived from the intent/brief.



def _get_ecosystem_generic_prompt() -> str:
    """Load the generic ecosystem prompt from KB."""
    return load_kb("agents/ecosystem_generic_agent.md")

def _get_ecosystem_brief_prompt() -> str:
    """Load the brief-driven ecosystem prompt from KB."""
    return load_kb("agents/ecosystem_brief_agent.md")


def generate_dynamic_ecosystem_graph(intent: str, brief: str | None = None) -> Dict[str, Any]:
    try:
        if brief:
            system_prompt = _get_ecosystem_brief_prompt()
            user_prompt = (
                f"Research Intent: {intent}\n\n"
                f"=== STRATEGIC RESEARCH BRIEF (PRIMARY SOURCE) ===\n"
                f"{brief[:7000]}\n"
                f"=== END BRIEF ===\n\n"
                f"Now generate the Category Graph JSON by mapping the brief's tiers, units, signals, and sources directly to the 5 Strategic Forces.\n"
                f"Every node must be a named entity, platform, signal, or source from the brief above."
            )
        else:
            system_prompt = _get_ecosystem_generic_prompt()
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
        if not subjects and "categories" in llm_result: # fallback
            subjects = llm_result.get("categories", [])
            
        for subject in subjects:
            subj_name = subject.get("name", subject.get("category_name", "Unknown Subject"))
            subj_force = subject.get("force_metadata", "Demand Gravity")
            subj_desc = subject.get("description", "")
            
            G.add_node(subj_name, type="subject", label=subj_name, force=subj_force, subject=subj_name, description=subj_desc)
            G.add_edge(core_topic, subj_name)
            
            # Tier 2: Components
            components = subject.get("components", [])
            if not components and "nodes" in subject: # fallback handling
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


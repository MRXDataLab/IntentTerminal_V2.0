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


SYSTEM_PROMPT_ECOSYSTEM_GENERIC = f"""You are a domain taxonomy and strategic intelligence expert.
Given a research intent, generate a comprehensive ecosystem landscape map.
Instead of using fixed generic categories, derive 4-6 key thematic points (pillars) directly from the research intent to act as the primary categories.

For each category, generate 3-4 specific, real-world entities that are most relevant to that thematic point.
Entities should be a mix of brands, platforms, concepts, regulations, personas, or data signals.

Your output MUST be a strict JSON object:
{{
  "core_topic": "2-3 word core subject",
  "categories": [
    {{
      "category_name": "Key Point 1 from Intent",
      "description": "Brief description of this point",
      "nodes": ["Entity A", "Entity B", "Entity C"]
    }},
    ...4-6 total categories...
  ]
}}
"""

SYSTEM_PROMPT_ECOSYSTEM_WITH_BRIEF = f"""You are a Strategic Ecosystem Graph Architect for Outllyr.
You will receive a fully synthesized Strategic Research Brief. Your job is to convert it directly into a Subject-Relationship Web.

CRITICAL RULE: You MUST extract nodes from the actual named entities, brands, platforms, signals, and sources found IN the brief.
DO NOT use generic category knowledge.

Mapping logic (Semantic Market Web):
- "core_topic": Extract from the North Star Statement — the central problem.
- "subjects" (Tier 1 Nodes): Major themes from the Brief (e.g. "Battery Life", "Brand Trust", "Price Sensitivity").
- "components" (Tier 2 Nodes): Sub-topics mapped to a specific subject (e.g. "FAME II Subsidy").
- "signals" (Tier 3 Nodes): The actual internet sources/keywords mapped to a component.
- "force_metadata": For EVERY node, assign it one of the 5 Strategic Forces (Demand Gravity, Choice Architecture, Value Elasticity, Reinforcement Stability, Competitive Energy) as a background tag.

Output MUST be strict JSON:
{{
  "core_topic": "The Problem Statement",
  "subjects": [
    {{
      "name": "Subject 1",
      "force_metadata": "Demand Gravity",
      "components": [
        {{
          "name": "Component A",
          "force_metadata": "Choice Architecture",
          "signals": [
            {{"name": "Signal X", "force_metadata": "Competitive Energy"}}
          ]
        }}
      ]
    }}
  ]
}}
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
                f"Now generate the Category Graph JSON by mapping the brief's tiers, units, signals, and sources directly to the 5 Strategic Forces.\n"
                f"Every node must be a named entity, platform, signal, or source from the brief above."
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
        G.add_node(core_topic, type="root", label=core_topic, force="root")
        
        subjects = llm_result.get("subjects", [])
        if not subjects and "categories" in llm_result: # fallback
            subjects = llm_result.get("categories", [])
            
        for subject in subjects:
            subj_name = subject.get("name", subject.get("category_name", "Unknown Subject"))
            subj_force = subject.get("force_metadata", "Demand Gravity")
            
            G.add_node(subj_name, type="subject", label=subj_name, force=subj_force, subject=subj_name)
            G.add_edge(core_topic, subj_name)
            
            components = subject.get("components", [])
            if not components and "nodes" in subject: # fallback handling
                components = [{"name": n, "force_metadata": subj_force, "signals": []} for n in subject.get("nodes", [])]
                
            for comp in components:
                comp_name = comp.get("name", "Unknown Component")
                comp_force = comp.get("force_metadata", "Demand Gravity")
                G.add_node(comp_name, type="component", label=comp_name, force=comp_force, subject=subj_name)
                G.add_edge(subj_name, comp_name)
                
                for sig in comp.get("signals", []):
                    sig_name = sig.get("name", "Unknown Signal")
                    sig_force = sig.get("force_metadata", "Demand Gravity")
                    G.add_node(sig_name, type="signal", label=sig_name, force=sig_force, subject=subj_name)
                    G.add_edge(comp_name, sig_name)
                
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
    return {
        "status": "success",
        "graph": graph_data
    }


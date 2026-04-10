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

# 5 Strategic Forces — the fixed, locked category structure for all ecosystem maps
STRATEGIC_FORCES = [
    "Demand Gravity",
    "Choice Architecture",
    "Value Elasticity",
    "Reinforcement Stability",
    "Competitive Energy"
]

FORCE_DESCRIPTIONS = {
    "Demand Gravity": "What pulls consumers toward this category — triggers, aspirations, lifestyle signals, and macro demand drivers.",
    "Choice Architecture": "What shapes the decision-making environment — shelf dynamics, default options, UX friction, influencer ecosystems, and platform defaults.",
    "Value Elasticity": "Price sensitivity signals, perceived value shifts, premium/value trade-offs, and willingness-to-pay thresholds.",
    "Reinforcement Stability": "Brand loyalty inertia, habit formation, switching cost barriers, community ties, and subscription lock-ins.",
    "Competitive Energy": "Direct competitors, indirect substitutes, insurgent brands, international entrants, and strategic M&A moves.",
}

SYSTEM_PROMPT_ECOSYSTEM_GENERIC = f"""You are a domain taxonomy and strategic intelligence expert.
Given a research intent, generate a comprehensive ecosystem landscape map structured around the 5 Strategic Forces of market physics.
You MUST use EXACTLY these 5 category names (forces): {json.dumps(STRATEGIC_FORCES)}

For each force, generate 3-4 specific, real-world entities that are most relevant to the research intent.
Entities should be a mix of brands, platforms, concepts, regulations, personas, or data signals — whichever is most relevant for that force.

Your output MUST be a strict JSON object:
{{
  "core_topic": "2-3 word core subject",
  "categories": [
    {{
      "force": "Demand Gravity",
      "description": "...",
      "nodes": ["Entity A", "Entity B", "Entity C"]
    }},
    ...all 5 forces required...
  ]
}}
"""

SYSTEM_PROMPT_ECOSYSTEM_WITH_BRIEF = f"""You are a Strategic Ecosystem Graph Architect for Outllyr.
You will receive a fully synthesized Strategic Research Brief. Your job is to convert it directly into a hierarchical Category Graph.

CRITICAL RULE: You MUST extract nodes from the actual named entities, brands, platforms, signals, and sources found IN the brief.
DO NOT use generic category knowledge. Every node must trace back to the brief content.

Graph structure (use EXACTLY these 5 force names): {json.dumps(STRATEGIC_FORCES)}

Mapping logic:
- "core_topic": Extract from the North Star Statement — the 2-3 word subject (e.g., "Eggoz Brand Erosion")
- Tier 2 Pillars → map them to the matching Strategic Forces
- Tier 3 Domains → use as the "description" for each force category
- Tier 4 Units (both Structural and Subjective) → use as entity nodes under the relevant force
- Tier 5 Signals & Sources → use as leaf entity nodes, formatted as "Signal (Source)"
- Internet Discovery Mandate (Ghost Brands, News Cluster, Proxies) → add as entity nodes under the most relevant force

Generate 5-7 specific entity nodes per force, drawn directly from the brief.
DO NOT pad with generic concepts. If the brief mentions "Zepto OOS Rate" under Structural Units, that becomes a node.

Output MUST be strict JSON:
{{
  "core_topic": "3-4 word subject from North Star",
  "categories": [
    {{
      "force": "Demand Gravity",
      "description": "Tier 3 domain description from brief",
      "nodes": ["Exact entity from brief", "Another from brief", ...]
    }},
    ...all 5 forces required...
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

        llm_result = call_openrouter(system_prompt=system_prompt, user_prompt=user_prompt, expect_json=True)
        
        G = nx.DiGraph()
        
        core_topic = llm_result.get("core_topic", "Core Subject")
        G.add_node(core_topic, type="root", label=core_topic, force="root")
        
        categories = llm_result.get("categories", [])
        
        for category in categories:
            force_name = category.get("force", "Unknown Force")
            force_desc = category.get("description", FORCE_DESCRIPTIONS.get(force_name, ""))
            G.add_node(force_name, type="category", label=force_name, force=force_name, description=force_desc)
            G.add_edge(core_topic, force_name)
            
            nodes = category.get("nodes", [])
            for node_name in nodes:
                G.add_node(node_name, type="entity", label=node_name, force=force_name)
                G.add_edge(force_name, node_name)
                
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
        "graph": graph_data,
        "forces": STRATEGIC_FORCES,
        "force_descriptions": FORCE_DESCRIPTIONS
    }

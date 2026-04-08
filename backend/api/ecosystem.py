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

SYSTEM_PROMPT_ECOSYSTEM = f"""You are a domain taxonomy and strategic intelligence expert.
Given a research intent, generate a comprehensive ecosystem landscape map structured around the 5 Strategic Forces of market physics.
You MUST use EXACTLY these 5 category names (forces): {json.dumps(STRATEGIC_FORCES)}

For each force, generate 3-4 specific, real-world entities that are most relevant to the research intent.
Entities should be a mix of brands, platforms, concepts, regulations, personas, or data signals — whichever is most relevant for that force.

Also consider populating with specialised node types where relevant:
- Structural nodes: OOS rates, pricing volatility, logistics friction
- Talent nodes: key personnel migration patterns (e.g., "Ex-Ola hiring at Ather")
- Secondary market nodes: resale platforms (OLX, Spinny), refurbished demand
- Policy/Macro nodes: regulatory subsidies (FAME II, PLI), infrastructure density

Your output MUST be a strict JSON object:
{{
  "core_topic": "2-3 word core subject",
  "categories": [
    {{
      "force": "Demand Gravity",
      "description": "...",
      "nodes": ["Entity A", "Entity B", "Entity C"]
    }},
    {{
      "force": "Choice Architecture",
      ...
    }},
    ...all 5 forces required...
  ]
}}
"""

def generate_dynamic_ecosystem_graph(intent: str) -> Dict[str, Any]:
    try:
        user_prompt = f"Map the ecosystem for this research intent: {intent}"
        llm_result = call_openrouter(system_prompt=SYSTEM_PROMPT_ECOSYSTEM, user_prompt=user_prompt, expect_json=True)
        
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
    graph_data = generate_dynamic_ecosystem_graph(payload.intent)
    return {
        "status": "success",
        "graph": graph_data,
        "forces": STRATEGIC_FORCES,
        "force_descriptions": FORCE_DESCRIPTIONS
    }

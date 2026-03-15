from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
import networkx as nx

router = APIRouter()

class IntentPayload(BaseModel):
    intent: str

def generate_mock_ecosystem_graph(intent: str) -> Dict[str, Any]:
    """
    Simulates the Agent extracting the 'Horizon Scan' logic
    and building the Category Graph / Taxonomy for Step 2 & 3.
    """
    G = nx.DiGraph()
    
    # Core Entity
    core_topic = "Electric 2W" if "EV" in intent else "Core Subject"
    G.add_node(core_topic, type="root", label=core_topic)
    
    # Primary Categories
    categories = ["Premium Scooters", "Economy/Commuter", "ICE Scooters (Substitutes)", "Mobility Alternatives"]
    
    for cat in categories:
        G.add_node(cat, type="category", label=cat)
        G.add_edge(core_topic, cat)
        
    # Nodes
    nodes_map = {
        "Premium Scooters": ["Ola S1", "Ather 450", "TVS iQube"],
        "Economy/Commuter": ["Ola S1 X", "Hero Vida"],
        "ICE Scooters (Substitutes)": ["Honda Activa", "Suzuki Access"],
        "Mobility Alternatives": ["Namma Metro", "Rapido/Uber Moto", "Bicycles"]
    }
    
    for cat, items in nodes_map.items():
        for item in items:
            G.add_node(item, type="entity", label=item)
            G.add_edge(cat, item)
            
    # Serialize for frontend (e.g. react-force-graph or cytoscape)
    data = nx.node_link_data(G)
    data["links"] = data.get("edges", [])
    if "edges" in data:
        del data["edges"]
    return data

@router.post("/generate-ecosystem")
def generate_ecosystem(payload: IntentPayload):
    graph_data = generate_mock_ecosystem_graph(payload.intent)
    return {
        "status": "success",
        "graph": graph_data
    }

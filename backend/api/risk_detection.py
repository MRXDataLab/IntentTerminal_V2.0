import json
from typing import List, Dict, Any
from services.llm_client import call_openrouter
from kb.kb_loader import load_kb

def _get_risk_system_prompt() -> str:
    """Load the risk detection prompt from KB."""
    return load_kb("agents/risk_agent.md")

class RiskDetector:
    """
    Step 8: Risk Detection Module
    Analyzes the ingested pool to detect Blind Spots dynamically using Claude 3.5 Sonnet.
    """
    def __init__(self):
        pass
        
    def detect_blind_spots(self, graph_nodes: List[str], ingested_sources: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Compares the theoretical Ecosystem Graph with the actual ingested data 
        using an LLM to find missing perspectives.
        """
        if not graph_nodes:
            return []
            
        user_prompt = f"Graph Nodes:\n{json.dumps(graph_nodes)}\n\nIngested Sources:\n{json.dumps(ingested_sources)}"
        
        try:
            llm_result = call_openrouter(
                system_prompt=_get_risk_system_prompt(),
                user_prompt=user_prompt,
                expect_json=True
            )
            return llm_result.get("risks", [])
        except Exception as e:
            print(f"Risk Detection LLM Error: {e}")
            # Fallback
            covered_nodes = {src.get("node") for src in ingested_sources if src.get("status") == "APPROVED"}
            missing_nodes = set(graph_nodes) - covered_nodes
            risks = []
            for node in missing_nodes:
                risks.append({
                    "type": "COVERAGE_GAP",
                    "node": node,
                    "description": f"Fallback Risk: Missing data for {node}",
                    "severity": "HIGH",
                    "suggestion": "Search explicitly for this term."
                })
            return risks

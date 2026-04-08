import json
from typing import List, Dict, Any
from services.llm_client import call_openrouter

SYSTEM_PROMPT_RISK = """You are an expert Data Risk and Bias Analyst.
Compare the expected theoretical Ecosystem Graph (list of nodes) against the ACTUAL ingested data sources.
Identify 2 to 3 critical blind spots, missing perspectives, or coverage gaps.

Your output must be a strict JSON object matching this schema:
{
  "risks": [
    {
      "type": "COVERAGE_GAP or PERSPECTIVE_BIAS",
      "node": "The associated graph node name",
      "description": "A deep, consultative explanation of the risk.",
      "severity": "HIGH or MEDIUM or LOW",
      "suggestion": "Specific actionable suggestion to find this missing data."
    }
  ]
}
"""

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
                system_prompt=SYSTEM_PROMPT_RISK,
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

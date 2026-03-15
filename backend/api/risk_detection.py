from typing import List, Dict, Any

class RiskDetector:
    """
    Step 8: Risk Detection Module
    Analyzes the ingested pool to detect Blind Spots.
    """
    def __init__(self):
        pass
        
    def detect_blind_spots(self, graph_nodes: List[str], ingested_sources: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Compares the theoretical Ecosystem Graph (Step 3) with the actual
        ingested data (Step 7) to find missing perspectives.
        """
        risks = []
        
        # MOCK LOGIC: If a graph node has no strong sources, flag it.
        covered_nodes = {src["node"] for src in ingested_sources if src["status"] == "APPROVED"}
        
        missing_nodes = set(graph_nodes) - covered_nodes
        
        for node in missing_nodes:
            risks.append({
                "type": "COVERAGE_GAP",
                "node": node,
                "description": f"Missing high-signal data for {node}. Consider adding subreddits or niche forums for this node.",
                "severity": "HIGH"
            })
            
        # Example of contextual blind-spot mocking
        risks.append({
            "type": "PERSPECTIVE_BIAS",
            "node": "Ecosystem",
            "description": "We have high Consumer data; missing B2B/Delivery Partner perspectives.",
            "severity": "MEDIUM",
            "suggestion": "Add source: r/SwiggyDeliveryPartners"
        })
        
        return risks

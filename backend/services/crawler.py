from typing import List, Dict, Any
import random

class SourceOracle:
    def __init__(self):
        # Mock index of potential sources
        self.platforms = ["YouTube", "Reddit", "Team-BHP", "X (Twitter)", "News Sites", "Vahan"]
        
    def discover_sources(self, graph_nodes: List[str]) -> List[Dict[str, Any]]:
        """
        Simulates Step 4: The Exhaustive Link-Farm.
        """
        results = []
        for node in graph_nodes:
            # Generate 2-5 mock sources per node
            num_sources = random.randint(2, 5)
            for _ in range(num_sources):
                platform = random.choice(self.platforms)
                results.append({
                    "id": f"src_{random.randint(1000, 9999)}",
                    "node": node,
                    "platform": platform,
                    "url": f"https://mock-{platform.lower().replace(' ', '')}.com/discuss/{node.replace(' ', '-')}",
                })
        return results

    def audit_source(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulates Step 5: The Dipstick Analysis.
        Scouts and peeks to rank on Neutrality, Relevance, and Engagement Density.
        """
        # Mock light analysis
        neutrality = round(random.uniform(0.1, 1.0), 2)
        relevance = round(random.uniform(0.3, 1.0), 2)
        engagement_density = random.randint(10, 500)
        
        # Calculate a blended "Signal Score"
        signal_score = round((neutrality * 0.4) + (relevance * 0.4) + (min(engagement_density/500, 1.0) * 0.2), 2)
        
        return {
            **source,
            "metrics": {
                "neutrality": neutrality,
                "relevance": relevance,
                "engagement_density": engagement_density
            },
            "signal_score": signal_score,
            "status": "APPROVED" if signal_score > 0.5 else "REJECTED"
        }

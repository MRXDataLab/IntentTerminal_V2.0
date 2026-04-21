from typing import List, Dict, Any
import random
import json
import uuid
from services.llm_client import call_openrouter
from services.scout import scout_internet

SYSTEM_PROMPT_CRAWLER = """You are an expert data sourcing and research oracle. 
Given a list of concepts/nodes from an ecosystem graph, generate an exhaustive list of possibilities of searching for data sources for each node.
Consider unconventional sources, niche forums, specialized databases, social listening (Reddit, X), video platforms (YouTube), and industry portals.

You must reply with a JSON object strictly matching this format. Provide 3 highly specific, diverse sources for every node in the list.
{
  "sources": [
    {
      "node": "The specific node name",
      "platform": "Platform Name (e.g., r/electricvehicles, Team-BHP, Statista)",
      "url": "A realistic example URL (e.g., https://reddit.com/r/electricvehicles/search?q=...)",
      "search_strategy": "What exact search terms or API filters would yield the best signal-to-noise ratio?"
    }
  ]
}
"""

class SourceOracle:
    def __init__(self):
        pass
        
    def discover_sources(self, graph_nodes: List[str]) -> List[Dict[str, Any]]:
        """
        Simulates Step 4: The Exhaustive Link-Farm.
        Uses Claude to dynamically map the best data sources and search strategies.
        """
        if not graph_nodes:
            return []
            
        sources = []
        
        # 1. Real-time Serper Scout
        # Use top 3 nodes to build a good search query
        query_str = " ".join(graph_nodes[:3])
        if query_str:
            serper_results = scout_internet(query_str)
            
            if "market_discovery" in serper_results:
                for item in serper_results["market_discovery"]:
                    sources.append({
                        "id": f"src_{uuid.uuid4().hex[:8]}",
                        "node": "Market Landscape",
                        "platform": "Google Search (organic)",
                        "url": item.get("link", ""),
                        "search_strategy": item.get("title", ""),
                        "signal_score": 0.95,
                        "status": "APPROVED"
                    })
                    
            if "news_cluster" in serper_results:
                for item in serper_results["news_cluster"]:
                    sources.append({
                        "id": f"src_{uuid.uuid4().hex[:8]}",
                        "node": "News Trigger",
                        "platform": item.get("source", "Google News"),
                        "url": item.get("link", ""),
                        "search_strategy": item.get("title", ""),
                        "signal_score": 0.85,
                        "status": "APPROVED"
                    })
                    
            if "shopping_pulse" in serper_results:
                for item in serper_results["shopping_pulse"]:
                     sources.append({
                        "id": f"src_{uuid.uuid4().hex[:8]}",
                        "node": "Competitor / Ghost Brand",
                        "platform": item.get("source", "Google Shopping"),
                        "url": item.get("link", ""),
                        "search_strategy": f"{item.get('title', '')} - {item.get('price', '')}",
                        "signal_score": 0.9,
                        "status": "APPROVED"
                    })
        
        # 2. Augment with LLM for specific niche sources based on all nodes
        user_prompt = f"Please generate data sources for the following nodes:\n{json.dumps(graph_nodes)}"
        
        try:
            llm_result = call_openrouter(
                system_prompt=SYSTEM_PROMPT_CRAWLER, 
                user_prompt=user_prompt, 
                expect_json=True
            )
            
            llm_sources = llm_result.get("sources", [])
            for src in llm_sources:
                src["id"] = f"src_{uuid.uuid4().hex[:8]}"
            
            sources.extend(llm_sources)
            return sources
        except Exception as e:
            # Fallback if API fails or parsing fails
            print(f"Error in discover_sources LLM call: {e}")
            results = []
            for node in graph_nodes:
                results.append({
                    "id": f"src_{uuid.uuid4().hex[:8]}",
                    "node": node,
                    "platform": "Fallback Search Engine",
                    "url": f"https://google.com/search?q={node.replace(' ', '+')}",
                    "search_strategy": "Fallback general search due to API error."
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

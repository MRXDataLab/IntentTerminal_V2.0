import os
import requests
import json
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")

def extract_keywords_from_history(history: list) -> str:
    if not history:
        return "Category Subject"
    user_msgs = [m['content'] for m in history if m['role'] == 'user']
    if not user_msgs:
        return "Category Subject"
    return user_msgs[-1][:50]

def scout_internet(keywords: str) -> Dict[str, Any]:
    """
    Executes live search queries against Serper.dev API to pull ground truth context.
    """
    if not SERPER_API_KEY:
        print("Warning: No SERPER_API_KEY found, bypassing real scout...")
        return {"error": "Missing SERPER_API_KEY configuration."}

    print(f"Scout Mode Activated: Scanning internet for [{keywords}]...")
    
    headers = {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
    }
    
    results = {}
    
    # General Web Search (Competitors & Landscape)
    try:
        payload = json.dumps({"q": f"{keywords} market landscape competitors price", "num": 5})
        response = requests.post("https://google.serper.dev/search", headers=headers, data=payload, timeout=10)
        search_data = response.json()
        organic = search_data.get("organic", [])
        results["market_discovery"] = [
            {"title": item.get("title"), "link": item.get("link"), "snippet": item.get("snippet")}
            for item in organic[:4]
        ]
    except Exception as e:
        results["market_discovery_error"] = str(e)
        
    # News Search (Triggers & Sentiments)
    try:
        payload_news = json.dumps({"q": f"{keywords} industry trends", "num": 3})
        response_news = requests.post("https://google.serper.dev/news", headers=headers, data=payload_news, timeout=10)
        news_data = response_news.json()
        news_items = news_data.get("news", [])
        results["news_cluster"] = [
            {"title": item.get("title"), "link": item.get("link"), "source": item.get("source")}
            for item in news_items[:3]
        ]
    except Exception as e:
        results["news_cluster_error"] = str(e)

    # Shopping/Product Search (Finding Ghost Brands / OOS / Price deltas)
    # The Serper Shopping endpoint is extremely useful for seeing e-comm listings natively.
    try:
        payload_shop = json.dumps({"q": f"{keywords}", "num": 5})
        response_shop = requests.post("https://google.serper.dev/shopping", headers=headers, data=payload_shop, timeout=10)
        shop_data = response_shop.json()
        shop_items = shop_data.get("shopping", [])
        results["shopping_pulse"] = [
            {"title": item.get("title"), "price": item.get("price"), "source": item.get("source"), "link": item.get("link")}
            for item in shop_items[:4]
        ]
    except Exception as e:
        results["shopping_pulse_error"] = str(e)

    return results

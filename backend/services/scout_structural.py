"""
scout_structural.py — The "Physics" Layer (FR 3.2)

Real implementations:
  - Google Trends (pytrends)
  - People Also Ask (PAA) trees — via SerpAPI or LLM simulation
  - Reddit volume trends (via PRAW)

LLM-simulated implementations:
  - Blinkit/Zepto OOS rates
  - LinkedIn talent signals
  - Google Maps Popular Times / footfall proxy
  - OLX/Spinny resale data
"""

import os
import json
from typing import List, Dict, Any
from services.llm_client import call_openrouter


# ─── Google Trends (Real) ────────────────────────────────────────────────────

def get_google_trends(keywords: List[str], timeframe: str = "today 3-m", geo: str = "IN") -> Dict[str, Any]:
    """
    Uses pytrends to fetch real interest-over-time and related queries.
    """
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl='en-US', tz=330)  # IST timezone
        pytrends.build_payload(keywords[:5], timeframe=timeframe, geo=geo)

        interest_df = pytrends.interest_over_time()
        related_queries = pytrends.related_queries()

        # Z-score approximate: (value - mean) / std
        trend_summary = {}
        for kw in keywords[:5]:
            if kw in interest_df.columns:
                series = interest_df[kw]
                mean = float(series.mean())
                std = float(series.std()) if series.std() > 0 else 1
                latest = float(series.iloc[-1]) if len(series) > 0 else 0
                z_score = round((latest - mean) / std, 2)
                trend_summary[kw] = {
                    "latest_interest": latest,
                    "mean_interest": round(mean, 1),
                    "z_score": z_score,
                    "trend": "Rising" if z_score > 0.5 else "Falling" if z_score < -0.5 else "Stable"
                }

        # Top related queries
        top_related = {}
        for kw, data in related_queries.items():
            if data and data.get("top") is not None:
                top_related[kw] = data["top"]["query"].head(5).tolist()

        return {
            "source": "Google Trends",
            "source_type": "live",
            "timeframe": timeframe,
            "geo": geo,
            "trends": trend_summary,
            "related_queries": top_related
        }

    except ImportError:
        return _simulate_trends(keywords)
    except Exception as e:
        print(f"[Trends Scout] pytrends error: {e}. Using LLM simulation.")
        return _simulate_trends(keywords)


def _simulate_trends(keywords: List[str]) -> Dict[str, Any]:
    prompt = f"""Simulate realistic Google Trends data for these keywords in India: {json.dumps(keywords)}
    Return JSON: {{"trends": {{"keyword": {{"latest_interest": 72, "mean_interest": 65.3, "z_score": 0.8, "trend": "Rising"}}}}}}"""
    try:
        result = call_openrouter(
            system_prompt="You are a Google Trends data simulator for Indian market research.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source"] = "Google Trends"
        result["source_type"] = "llm_simulated"
        return result
    except Exception as e:
        return {"source": "Google Trends", "source_type": "llm_simulated", "error": str(e)}


# ─── PAA Trees (People Also Ask) ─────────────────────────────────────────────

def get_paa_tree(query: str, depth: int = 4) -> Dict[str, Any]:
    """
    Builds a 4-level deep People Also Ask tree.
    Uses SerpAPI if configured, otherwise uses LLM simulation.
    """
    serp_api_key = os.getenv("SERP_API_KEY")

    if serp_api_key:
        try:
            import requests
            res = requests.get(
                "https://serpapi.com/search",
                params={"q": query, "api_key": serp_api_key, "engine": "google"},
                timeout=10
            )
            data = res.json()
            paa = data.get("related_questions", [])
            return {
                "source": "SerpAPI (PAA)",
                "source_type": "live",
                "query": query,
                "questions": [q.get("question") for q in paa[:15]]
            }
        except Exception as e:
            print(f"[PAA Scout] SerpAPI error: {e}. Using LLM simulation.")

    return _simulate_paa(query, depth)


def _simulate_paa(query: str, depth: int = 4) -> Dict[str, Any]:
    prompt = f"""Generate a realistic 4-level deep "People Also Ask" question tree for the Google search query: "{query}"
    Return JSON: {{"questions": [{{"level": 1, "question": "...", "children": [{{"level": 2, "question": "...", "children": []}}]}}]}}"""
    try:
        result = call_openrouter(
            system_prompt="You are a Google SERP PAA tree simulator for SEO and market research.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source"] = "PAA Tree"
        result["source_type"] = "llm_simulated"
        result["query"] = query
        return result
    except Exception as e:
        return {"source": "PAA Tree", "source_type": "llm_simulated", "error": str(e)}


# ─── LLM-Simulated Structural Layers ─────────────────────────────────────────

def simulate_oos_rates(nodes: List[str], platforms: List[str] = None) -> Dict[str, Any]:
    """Simulates real-time OOS rates for Blinkit/Zepto/Amazon."""
    if platforms is None:
        platforms = ["Blinkit", "Zepto", "Amazon"]
    prompt = f"""Simulate realistic Out-of-Stock (OOS) rates and restock lead times for these product categories: {json.dumps(nodes)}
    across these quick-commerce platforms: {json.dumps(platforms)} in Indian Tier-1 cities.
    Return JSON: {{"oos_data": [{{"node": "...", "platform": "Blinkit", "oos_rate_pct": 23, "avg_restock_days": 2.5, "city": "Bengaluru"}}]}}"""
    try:
        result = call_openrouter(
            system_prompt="You are an inventory analytics simulator for Indian quick-commerce platforms.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source_type"] = "llm_simulated"
        result["source"] = "Blinkit/Zepto OOS Data"
        return result
    except Exception as e:
        return {"source": "OOS Data", "source_type": "llm_simulated", "error": str(e)}


def simulate_talent_signals(companies: List[str]) -> Dict[str, Any]:
    """Simulates LinkedIn/Glassdoor talent migration signals."""
    prompt = f"""Simulate realistic LinkedIn talent migration signals for these companies: {json.dumps(companies)}.
    Identify notable executive movements, hiring surges, and layoff patterns from Q1 2025 to Q1 2026.
    Return JSON: {{"talent_signals": [{{"company": "...", "signal_type": "HIRING_SURGE|EXEC_EXIT|LAYOFF", "role": "...", "from": "...", "to": "...", "implication": "..."}}]}}"""
    try:
        result = call_openrouter(
            system_prompt="You are a LinkedIn talent intelligence simulator for strategic market research.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source_type"] = "llm_simulated"
        result["source"] = "LinkedIn Talent Signals"
        return result
    except Exception as e:
        return {"source": "Talent Signals", "source_type": "llm_simulated", "error": str(e)}


def simulate_footfall_data(locations: List[str]) -> Dict[str, Any]:
    """Simulates Google Maps Popular Times footfall proxy data."""
    prompt = f"""Simulate realistic footfall patterns for these retail/showroom locations: {json.dumps(locations)}
    based on Google Maps "Popular Times" data logic for Indian cities.
    Return JSON: {{"footfall_data": [{{"location": "...", "city": "...", "peak_day": "Saturday", "peak_hour": "11am-1pm", "avg_weekly_visits_estimate": 450, "trend": "Increasing"}}]}}"""
    try:
        result = call_openrouter(
            system_prompt="You are a Google Maps footfall data simulator for retail market research.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source_type"] = "llm_simulated"
        result["source"] = "Google Maps Popular Times"
        return result
    except Exception as e:
        return {"source": "Footfall Data", "source_type": "llm_simulated", "error": str(e)}


def simulate_resale_data(product_categories: List[str]) -> Dict[str, Any]:
    """Simulates OLX/Spinny resale market data."""
    prompt = f"""Simulate realistic resale market data from OLX and Spinny for these product categories: {json.dumps(product_categories)} in India.
    Return JSON: {{"resale_data": [{{"category": "...", "platform": "OLX|Spinny", "avg_resale_price_inr": 85000, "demand_index": 72, "supply_glut": false, "yoy_price_change_pct": -8.5}}]}}"""
    try:
        result = call_openrouter(
            system_prompt="You are a resale market data simulator for Indian secondary markets.",
            user_prompt=prompt,
            expect_json=True
        )
        result["source_type"] = "llm_simulated"
        result["source"] = "OLX/Spinny Resale Data"
        return result
    except Exception as e:
        return {"source": "Resale Data", "source_type": "llm_simulated", "error": str(e)}


# ─── Unified Structural Scout ─────────────────────────────────────────────────

def run_structural_scout(intent: str, nodes: List[str]) -> Dict[str, Any]:
    """
    Entry point — runs all structural scouts and returns aggregated physics data.
    """
    keywords = nodes[:5]  # Limit Trends API calls

    trends_data = get_google_trends(keywords)
    paa_data = get_paa_tree(intent)
    oos_data = simulate_oos_rates(nodes)
    talent_data = simulate_talent_signals(nodes[:5])
    footfall_data = simulate_footfall_data(nodes[:3])
    resale_data = simulate_resale_data(nodes[:4])

    return {
        "intent": intent,
        "layers": {
            "search_intelligence": {
                "google_trends": trends_data,
                "paa_tree": paa_data
            },
            "inventory_signals": oos_data,
            "talent_signals": talent_data,
            "location_signals": footfall_data,
            "secondary_market": resale_data
        }
    }

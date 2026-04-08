"""
scout_subjective.py — The "Why" Layer (FR 3.1)
Harvests subjective voice signals from Reddit, YouTube, and e-commerce reviews.
"""

import json
import os
from typing import List, Dict, Any
from services.llm_client import call_openrouter

# ─── Reddit Scout ────────────────────────────────────────────────────────────

def scout_reddit(query: str, limit: int = 30) -> List[Dict[str, Any]]:
    """
    Searches Reddit for friction narratives using PRAW.
    Falls back to LLM simulation if PRAW credentials not configured.
    """
    reddit_client_id = os.getenv("REDDIT_CLIENT_ID")
    reddit_secret = os.getenv("REDDIT_CLIENT_SECRET")

    if reddit_client_id and reddit_secret:
        try:
            import praw
            reddit = praw.Reddit(
                client_id=reddit_client_id,
                client_secret=reddit_secret,
                user_agent="MRXResearchBot/1.0"
            )
            results = []
            for submission in reddit.subreddit("all").search(query, sort="top", limit=limit):
                results.append({
                    "platform": "Reddit",
                    "source_type": "live",
                    "url": f"https://reddit.com{submission.permalink}",
                    "title": submission.title,
                    "text": submission.selftext[:500] if submission.selftext else submission.title,
                    "score": submission.score,
                    "num_comments": submission.num_comments,
                    "subreddit": str(submission.subreddit)
                })
            return results
        except Exception as e:
            print(f"[Reddit Scout] PRAW error: {e}. Using LLM simulation.")

    # LLM simulation fallback
    return _simulate_reddit(query)


def _simulate_reddit(query: str) -> List[Dict[str, Any]]:
    prompt = f"""Simulate 5 realistic Reddit post titles and brief discussion excerpts about: "{query}"
    Focus on friction, complaints, real user experiences, and niche subreddits.
    Return JSON array: [{{"subreddit": "...", "title": "...", "text": "...", "score": 100, "num_comments": 45}}]"""
    try:
        result = call_openrouter(
            system_prompt="You are a realistic Reddit data simulator for research purposes.",
            user_prompt=prompt,
            expect_json=True
        )
        posts = result if isinstance(result, list) else result.get("posts", [])
        for p in posts:
            p["platform"] = "Reddit"
            p["source_type"] = "llm_simulated"
            p["url"] = f"https://reddit.com/r/{p.get('subreddit', 'general')}/simulated"
        return posts
    except Exception as e:
        return [{"platform": "Reddit", "source_type": "llm_simulated", "text": f"Simulation error: {e}", "score": 0}]


# ─── YouTube Scout ───────────────────────────────────────────────────────────

def scout_youtube(query: str, max_results: int = 10) -> List[Dict[str, Any]]:
    """
    Searches YouTube for videos and comment threads using YouTube Data API v3.
    Falls back to LLM simulation if API key not configured.
    """
    youtube_api_key = os.getenv("YOUTUBE_API_KEY")

    if youtube_api_key:
        try:
            import requests
            search_url = "https://www.googleapis.com/youtube/v3/search"
            params = {
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": max_results,
                "order": "relevance",
                "key": youtube_api_key
            }
            res = requests.get(search_url, params=params, timeout=10)
            items = res.json().get("items", [])
            results = []
            for item in items:
                snippet = item.get("snippet", {})
                results.append({
                    "platform": "YouTube",
                    "source_type": "live",
                    "video_id": item["id"].get("videoId"),
                    "title": snippet.get("title"),
                    "description": snippet.get("description", "")[:300],
                    "channel": snippet.get("channelTitle"),
                    "url": f"https://youtube.com/watch?v={item['id'].get('videoId')}"
                })
            return results
        except Exception as e:
            print(f"[YouTube Scout] API error: {e}. Using LLM simulation.")

    return _simulate_youtube(query)


def _simulate_youtube(query: str) -> List[Dict[str, Any]]:
    prompt = f"""Simulate 5 realistic YouTube video titles and key comment themes about: "{query}"
    Focus on video reviews, owner vlogs, and heated comment debates.
    Return JSON array: [{{"title": "...", "channel": "...", "key_comment_themes": ["...", "..."], "view_count_estimate": 50000}}]"""
    try:
        result = call_openrouter(
            system_prompt="You are a realistic YouTube data simulator for research purposes.",
            user_prompt=prompt,
            expect_json=True
        )
        videos = result if isinstance(result, list) else result.get("videos", [])
        for v in videos:
            v["platform"] = "YouTube"
            v["source_type"] = "llm_simulated"
            v["url"] = f"https://youtube.com/results?search_query={query.replace(' ', '+')}"
        return videos
    except Exception as e:
        return [{"platform": "YouTube", "source_type": "llm_simulated", "text": f"Simulation error: {e}"}]


# ─── E-commerce Review Scout ─────────────────────────────────────────────────

def scout_ecommerce_reviews(query: str, platform: str = "Amazon") -> List[Dict[str, Any]]:
    """
    LLM-simulated e-commerce review signals (SKU-level failures, complaints).
    Real scraping deferred to crawler infrastructure phase.
    """
    prompt = f"""Simulate 5 realistic {platform} product review excerpts about: "{query}"
    Focus on SKU-level failures, unmet expectations, delivery issues, and comparative complaints.
    Return JSON array: [{{"rating": 2, "title": "...", "body": "...", "verified_purchase": true, "helpful_votes": 23}}]"""
    try:
        result = call_openrouter(
            system_prompt=f"You are a realistic {platform} review data simulator for market research purposes.",
            user_prompt=prompt,
            expect_json=True
        )
        reviews = result if isinstance(result, list) else result.get("reviews", [])
        for r in reviews:
            r["platform"] = platform
            r["source_type"] = "llm_simulated"
            r["url"] = f"https://amazon.in/s?k={query.replace(' ', '+')}"
        return reviews
    except Exception as e:
        return [{"platform": platform, "source_type": "llm_simulated", "text": f"Simulation error: {e}"}]


# ─── Unified Subjective Scout ────────────────────────────────────────────────

def run_subjective_scout(query: str, nodes: List[str]) -> Dict[str, Any]:
    """
    Entry point — runs all subjective voice scouts in sequence.
    Returns aggregated signal pool tagged by platform.
    """
    all_signals = []

    reddit_signals = scout_reddit(query)
    all_signals.extend(reddit_signals)

    youtube_signals = scout_youtube(query)
    all_signals.extend(youtube_signals)

    review_signals = scout_ecommerce_reviews(query)
    all_signals.extend(review_signals)

    return {
        "query": query,
        "total_signals": len(all_signals),
        "by_platform": {
            "Reddit": [s for s in all_signals if s.get("platform") == "Reddit"],
            "YouTube": [s for s in all_signals if s.get("platform") == "YouTube"],
            "E-commerce": [s for s in all_signals if s.get("platform") not in ("Reddit", "YouTube")]
        },
        "signals": all_signals
    }

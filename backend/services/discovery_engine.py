"""
discovery_engine.py — Multi-Engine Discovery Layer

Three search engines available:
  1. google_direct  — Playwright headless browser (free, anti-CAPTCHA)
  2. brave           — Brave Search API (free 2000/month)
  3. serpapi         — SerpAPI (premium, PAA + everything)

Each engine implements the same interface:
  search(query, vertical) → list of { url, title, snippet, source, vertical }
"""

import os
import json
import time
import random
import hashlib
import asyncio
import requests
from typing import List, Dict, Any, Optional, Set
from dotenv import load_dotenv

load_dotenv()

BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# Domain blacklist — skip brand pages, PR farms, generic aggregators
DOMAIN_BLACKLIST = {
    "amazon.com", "amazon.in", "flipkart.com", "myntra.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "pinterest.com", "tiktok.com", "linkedin.com",
    "wikipedia.org",  # Not useful for signal extraction
}

# User agents for Google Direct to avoid detection
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def _is_blacklisted(url: str) -> bool:
    for domain in DOMAIN_BLACKLIST:
        if domain in url.lower():
            return True
    return False

# ─── ENGINE 1: Google Direct (Playwright) ────────────────────────────────────

async def _google_direct_search(query: str, vertical: str = "web", num_results: int = 10) -> List[Dict[str, Any]]:
    """
    Uses Playwright headless Chromium to scrape Google search results.
    Anti-CAPTCHA measures:
      - Random user agent rotation
      - Random delays between requests (2-5s)
      - Headless with stealth viewport
      - Accept-Language and timezone spoofing
      - Max 10 results per query (don't paginate)
    """
    from playwright.async_api import async_playwright

    # Build the Google URL based on vertical
    base_url = "https://www.google.com/search"
    params = f"?q={requests.utils.quote(query)}&num={num_results}&hl=en"

    if vertical == "forums":
        params += "&udm=4"  # Google's Forums/Discussions tab
    elif vertical == "videos":
        params += "&tbm=vid"
    elif vertical == "news":
        params += "&tbm=nws&tbs=qdr:m3"  # Past 3 months
    elif vertical == "shopping":
        params += "&tbm=shop"

    url = base_url + params
    results = []

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ]
            )
            context = await browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                viewport={"width": 1366, "height": 768},
                locale="en-US",
                timezone_id="America/New_York",
            )

            # Anti-detection: remove webdriver flag
            page = await context.new_page()
            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            """)

            await page.goto(url, wait_until="domcontentloaded", timeout=15000)

            # Random human-like delay
            await page.wait_for_timeout(random.randint(1000, 2000))

            # Check for CAPTCHA
            content = await page.content()
            if "captcha" in content.lower() or "unusual traffic" in content.lower():
                await browser.close()
                return [{"error": "CAPTCHA detected. Try again later or use Brave/SerpAPI.", "url": "", "title": "", "snippet": ""}]

            # Parse results based on vertical
            if vertical == "videos":
                items = await page.query_selector_all("div.g, div[data-vid]")
            else:
                items = await page.query_selector_all("div.g, div.tF2Cxc, div.MjjYud div.g")

            for item in items[:num_results]:
                try:
                    link_el = await item.query_selector("a[href^='http']")
                    title_el = await item.query_selector("h3")
                    snippet_el = await item.query_selector("div.VwiC3b, span.aCOpRe, div.IsZvec")

                    link = await link_el.get_attribute("href") if link_el else ""
                    title = await title_el.inner_text() if title_el else ""
                    snippet = await snippet_el.inner_text() if snippet_el else ""

                    if link and not _is_blacklisted(link):
                        results.append({
                            "url": link,
                            "title": title,
                            "snippet": snippet,
                            "source": "Google Direct",
                            "vertical": vertical,
                        })
                except Exception:
                    continue

            # Extract PAA questions if web search
            if vertical == "web":
                paa_items = await page.query_selector_all("div.related-question-pair, div[data-q]")
                for paa in paa_items[:8]:
                    try:
                        q_text = await paa.inner_text()
                        if q_text and len(q_text) > 10:
                            results.append({
                                "url": "",
                                "title": q_text.split("\n")[0],
                                "snippet": "",
                                "source": "Google PAA",
                                "vertical": "paa",
                            })
                    except Exception:
                        continue

            await browser.close()

    except Exception as e:
        results.append({"error": str(e), "url": "", "title": "", "snippet": "", "source": "Google Direct", "vertical": vertical})

    return results


def google_direct_search(query: str, vertical: str = "web", num_results: int = 10) -> List[Dict[str, Any]]:
    """Sync wrapper for the async Playwright search."""
    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_google_direct_search(query, vertical, num_results))
        loop.close()
        return result
    except Exception as e:
        return [{"error": str(e), "url": "", "title": "", "snippet": "", "source": "Google Direct", "vertical": vertical}]

# ─── ENGINE 2: Brave Search API ──────────────────────────────────────────────

def brave_search(query: str, vertical: str = "web", num_results: int = 10) -> List[Dict[str, Any]]:
    """
    Uses Brave Search API. Free tier: 2000 queries/month.
    Returns real URLs from Brave's independent search index.
    """
    if not BRAVE_API_KEY:
        return [{"error": "BRAVE_API_KEY not set", "url": "", "title": "", "snippet": "", "source": "Brave", "vertical": vertical}]

    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
    }

    results = []

    try:
        if vertical == "news":
            url = f"https://api.search.brave.com/res/v1/news/search?q={requests.utils.quote(query)}&count={num_results}&freshness=pm"
            response = requests.get(url, headers=headers, timeout=15)
            data = response.json()
            for item in data.get("results", [])[:num_results]:
                if not _is_blacklisted(item.get("url", "")):
                    results.append({
                        "url": item.get("url", ""),
                        "title": item.get("title", ""),
                        "snippet": item.get("description", ""),
                        "source": "Brave News",
                        "vertical": "news",
                        "age": item.get("age", ""),
                    })

        elif vertical == "videos":
            url = f"https://api.search.brave.com/res/v1/videos/search?q={requests.utils.quote(query)}&count={num_results}"
            response = requests.get(url, headers=headers, timeout=15)
            data = response.json()
            for item in data.get("results", [])[:num_results]:
                results.append({
                    "url": item.get("url", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("description", ""),
                    "source": "Brave Videos",
                    "vertical": "videos",
                    "duration": item.get("video", {}).get("duration", ""),
                })

        else:
            # Web search (covers forums too via site: operator)
            search_query = query
            if vertical == "forums":
                search_query = f"{query} site:reddit.com OR site:quora.com OR site:forums"

            url = f"https://api.search.brave.com/res/v1/web/search?q={requests.utils.quote(search_query)}&count={num_results}"
            response = requests.get(url, headers=headers, timeout=15)
            data = response.json()

            for item in data.get("web", {}).get("results", [])[:num_results]:
                if not _is_blacklisted(item.get("url", "")):
                    results.append({
                        "url": item.get("url", ""),
                        "title": item.get("title", ""),
                        "snippet": item.get("description", ""),
                        "source": "Brave Web",
                        "vertical": vertical,
                    })

    except Exception as e:
        results.append({"error": str(e), "url": "", "title": "", "snippet": "", "source": "Brave", "vertical": vertical})

    return results


# ─── ENGINE 3: SerpAPI ────────────────────────────────────────────────────────

def serpapi_search(query: str, vertical: str = "web", num_results: int = 10) -> List[Dict[str, Any]]:
    """
    Uses SerpAPI for Google SERP parsing. Free: 100/month. Paid: $50/5000.
    Returns organic results, PAA, related searches, videos, news.
    """
    if not SERPAPI_KEY:
        return [{"error": "SERPAPI_KEY not set", "url": "", "title": "", "snippet": "", "source": "SerpAPI", "vertical": vertical}]

    results = []

    try:
        params = {
            "api_key": SERPAPI_KEY,
            "q": query,
            "engine": "google",
            "num": num_results,
            "hl": "en",
        }

        if vertical == "news":
            params["tbm"] = "nws"
            params["tbs"] = "qdr:m3"
        elif vertical == "videos":
            params["tbm"] = "vid"
        elif vertical == "shopping":
            params["tbm"] = "shop"
        elif vertical == "forums":
            params["q"] = f"{query} site:reddit.com OR site:quora.com"

        response = requests.get("https://serpapi.com/search", params=params, timeout=20)
        data = response.json()

        # Organic results
        for item in data.get("organic_results", [])[:num_results]:
            if not _is_blacklisted(item.get("link", "")):
                results.append({
                    "url": item.get("link", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "source": "SerpAPI",
                    "vertical": vertical,
                    "position": item.get("position"),
                })

        # Video results
        for item in data.get("video_results", [])[:num_results]:
            results.append({
                "url": item.get("link", ""),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "source": "SerpAPI Videos",
                "vertical": "videos",
                "duration": item.get("duration", ""),
                "channel": item.get("channel", ""),
            })

        # News results
        for item in data.get("news_results", [])[:num_results]:
            if not _is_blacklisted(item.get("link", "")):
                results.append({
                    "url": item.get("link", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "source": item.get("source", "SerpAPI News"),
                    "vertical": "news",
                    "date": item.get("date", ""),
                })

        # People Also Ask (PAA) — the rabbit hole seeds
        for item in data.get("related_questions", []):
            results.append({
                "url": item.get("link", ""),
                "title": item.get("question", ""),
                "snippet": item.get("snippet", ""),
                "source": "SerpAPI PAA",
                "vertical": "paa",
            })

        # Related Searches
        for item in data.get("related_searches", []):
            results.append({
                "url": "",
                "title": item.get("query", ""),
                "snippet": "",
                "source": "SerpAPI Related",
                "vertical": "related",
            })

    except Exception as e:
        results.append({"error": str(e), "url": "", "title": "", "snippet": "", "source": "SerpAPI", "vertical": vertical})

    return results

# ─── Unified Discovery Orchestrator ──────────────────────────────────────────

ENGINE_MAP = {
    "google_direct": google_direct_search,
    "brave": brave_search,
    "serpapi": serpapi_search,
}

VERTICALS = ["web", "forums", "videos", "news"]


def build_seed_queries(manifest: Dict[str, Any], intent: str) -> List[str]:
    """Extract seed queries from the Link Farming Manifest."""
    seeds = []

    # From boolean_nets
    for net in manifest.get("boolean_nets", []):
        q = net.get("query", "")
        if q:
            seeds.append(q)

    # From entity_anchors
    anchors = manifest.get("entity_anchors", {})
    primary = anchors.get("primary_brand", "")
    competitors = anchors.get("tracked_competitors", [])
    if primary:
        seeds.append(f"{primary} review complaints")
        for comp in competitors[:3]:
            seeds.append(f"{primary} vs {comp}")

    # From signal_taxonomy — combine with intent
    for tag in manifest.get("signal_taxonomy", [])[:5]:
        seeds.append(f"{intent} {tag.replace('_', ' ')}")

    # Deduplicate
    seen = set()
    unique = []
    for s in seeds:
        key = s.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique[:15]  # Cap at 15 seed queries


def run_discovery(
    engine: str,
    manifest: Dict[str, Any],
    intent: str,
    graph_nodes: List[str],
    paa_depth: int = 3,
    progress_callback: Optional[callable] = None,
) -> Dict[str, Any]:
    """
    Full discovery pipeline:
      1. Build seed queries from manifest
      2. Run vertical passes for each seed
      3. Recursive PAA loop (BFS, max depth)
      4. Dedup + cleanse
      5. Return ranked results
    """
    search_fn = ENGINE_MAP.get(engine, brave_search)
    seen_urls: Set[str] = set()
    all_results: List[Dict[str, Any]] = []
    paa_tree: List[Dict[str, Any]] = []
    stats = {
        "engine": engine,
        "seed_queries": 0,
        "total_raw": 0,
        "total_unique": 0,
        "total_blacklisted": 0,
        "paa_questions_found": 0,
        "paa_max_depth": paa_depth,
        "verticals": {v: 0 for v in VERTICALS},
    }

    # Step 1: Build seeds
    seeds = build_seed_queries(manifest, intent)
    stats["seed_queries"] = len(seeds)

    if progress_callback:
        progress_callback({"phase": "seeding", "seed_count": len(seeds), "message": f"Built {len(seeds)} seed queries from manifest"})

    # Step 2: Vertical passes for each seed
    for seed_idx, seed in enumerate(seeds):
        if progress_callback:
            progress_callback({
                "phase": "vertical_scan",
                "seed_index": seed_idx + 1,
                "seed_total": len(seeds),
                "seed_query": seed,
                "message": f"Scanning: {seed[:60]}..."
            })

        for vertical in VERTICALS:
            try:
                # Anti-CAPTCHA: random delay between requests
                if engine == "google_direct":
                    time.sleep(random.uniform(2.0, 4.0))
                else:
                    time.sleep(random.uniform(0.3, 0.8))

                results = search_fn(seed, vertical, num_results=10)

                for r in results:
                    if r.get("error"):
                        continue
                    url = r.get("url", "")
                    url_hash = _hash_url(url) if url else ""

                    stats["total_raw"] += 1

                    if _is_blacklisted(url):
                        stats["total_blacklisted"] += 1
                        continue

                    if url and url_hash in seen_urls:
                        continue

                    if url:
                        seen_urls.add(url_hash)

                    r["seed_query"] = seed
                    all_results.append(r)
                    stats["verticals"][vertical] = stats["verticals"].get(vertical, 0) + 1

                    # Collect PAA questions for the rabbit hole
                    if r.get("vertical") == "paa":
                        paa_tree.append({"question": r["title"], "depth": 0, "children": [], "links_found": 0})
                        stats["paa_questions_found"] += 1

            except Exception as e:
                print(f"[Discovery] Error in {vertical} for '{seed[:40]}': {e}")
                continue

    # Step 3: Recursive PAA loop (BFS)
    if paa_tree and paa_depth > 0:
        paa_queue = [(q, 1) for q in paa_tree]  # (paa_item, current_depth)

        while paa_queue:
            paa_item, depth = paa_queue.pop(0)
            if depth > paa_depth:
                continue

            question = paa_item["question"]
            if progress_callback:
                progress_callback({
                    "phase": "paa_recursion",
                    "depth": depth,
                    "max_depth": paa_depth,
                    "question": question[:60],
                    "message": f"PAA Depth {depth}: {question[:50]}..."
                })

            # Anti-CAPTCHA delay
            if engine == "google_direct":
                time.sleep(random.uniform(3.0, 5.0))
            else:
                time.sleep(random.uniform(0.5, 1.0))

            try:
                results = search_fn(question, "web", num_results=8)
                links_found = 0

                for r in results:
                    if r.get("error"):
                        continue
                    url = r.get("url", "")
                    url_hash = _hash_url(url) if url else ""

                    stats["total_raw"] += 1

                    if _is_blacklisted(url):
                        stats["total_blacklisted"] += 1
                        continue

                    if url and url_hash in seen_urls:
                        continue

                    if url:
                        seen_urls.add(url_hash)
                        links_found += 1

                    r["seed_query"] = f"PAA(d{depth}): {question}"
                    all_results.append(r)

                    # New PAA questions discovered at this depth
                    if r.get("vertical") == "paa" and depth < paa_depth:
                        child = {"question": r["title"], "depth": depth, "children": [], "links_found": 0}
                        paa_item["children"].append(child)
                        paa_queue.append((child, depth + 1))
                        stats["paa_questions_found"] += 1

                paa_item["links_found"] = links_found

            except Exception as e:
                print(f"[Discovery PAA] Error at depth {depth} for '{question[:40]}': {e}")
                continue

    # Step 4: Final stats
    stats["total_unique"] = len([r for r in all_results if r.get("url")])

    if progress_callback:
        progress_callback({
            "phase": "complete",
            "message": f"Discovery complete. {stats['total_unique']} unique URLs found.",
            "stats": stats,
        })

    return {
        "results": all_results,
        "paa_tree": paa_tree,
        "stats": stats,
    }

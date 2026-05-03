"""
discovery.py — Discovery Layer API

Endpoints:
  POST /api/discovery/start     — Kick off a discovery job (background)
  GET  /api/discovery/status/{id} — Poll job progress
  GET  /api/discovery/results/{id} — Get final ranked results
  GET  /api/discovery/engines    — List available search engines
"""

import uuid
import threading
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.discovery_engine import run_discovery, ENGINE_MAP
from services.llm_client import call_openrouter

router = APIRouter()

# In-memory job store (replace with Redis in production)
_jobs: Dict[str, Dict[str, Any]] = {}


class DiscoveryStartRequest(BaseModel):
    engine: str  # "google_direct" | "brave" | "serpapi"
    manifest: Dict[str, Any]
    intent: str
    graph_nodes: List[str] = []
    paa_depth: int = 3


class DiscoveryStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: Dict[str, Any]
    results_count: int


@router.get("/discovery/engines")
def list_engines():
    """List available search engines and their status."""
    import os
    return {
        "engines": [
            {
                "id": "google_direct",
                "name": "Google Direct",
                "description": "Headless browser scraping of Google Search. Free, includes Forums & Videos tabs. Slower due to anti-CAPTCHA delays.",
                "available": True,
                "cost": "Free",
                "rate": "~3-5s per query",
                "features": ["Web", "Forums", "Videos", "News", "PAA"],
            },
            {
                "id": "brave",
                "name": "Brave Search",
                "description": "Brave's independent search index via API. Fast, real URLs, generous free tier.",
                "available": bool(os.getenv("BRAVE_API_KEY")),
                "cost": "Free: 2000/month",
                "rate": "~0.5s per query",
                "features": ["Web", "Forums (via site:)", "Videos", "News"],
            },
            {
                "id": "serpapi",
                "name": "SerpAPI",
                "description": "Premium Google SERP parser. Best data quality with PAA, Related Searches, and all verticals.",
                "available": bool(os.getenv("SERPAPI_KEY")),
                "cost": "Free: 100/month, Paid: $50/5000",
                "rate": "~1s per query",
                "features": ["Web", "Forums", "Videos", "News", "Shopping", "PAA", "Related Searches"],
            },
            {
                "id": "duckduckgo",
                "name": "DuckDuckGo",
                "description": "Privacy-focused web search. Supports multiple data modalities (Web, News, Images, Videos). No API key required via duckduckgo-search package.",
                "available": True,
                "cost": "Free",
                "rate": "~1s per query",
                "features": ["Web", "Images", "Videos", "News"],
            },
        ]
    }


def _run_job(job_id: str, engine: str, manifest: Dict, intent: str, graph_nodes: List[str], paa_depth: int):
    """Background thread that runs the discovery pipeline."""
    def progress_cb(update: Dict[str, Any]):
        _jobs[job_id]["progress"] = {**_jobs[job_id]["progress"], **update}

    try:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["progress"] = {"phase": "starting", "message": "Initializing discovery engine..."}

        result = run_discovery(
            engine=engine,
            manifest=manifest,
            intent=intent,
            graph_nodes=graph_nodes,
            paa_depth=paa_depth,
            progress_callback=progress_cb,
        )

        # LLM triage — score the top results for relevance
        raw_results = [r for r in result["results"] if r.get("url") and not r.get("error")]

        if raw_results:
            _jobs[job_id]["progress"]["phase"] = "llm_triage"
            _jobs[job_id]["progress"]["message"] = f"Running LLM triage on {len(raw_results[:100])} URLs..."

            # Batch the titles/snippets for LLM scoring
            triage_batch = []
            for r in raw_results[:100]:
                triage_batch.append({
                    "title": r.get("title", ""),
                    "snippet": r.get("snippet", ""),
                    "url": r.get("url", ""),
                    "vertical": r.get("vertical", "web"),
                })

            try:
                triage_prompt = f"""You are the Outllyr Triage Assistant. Score these {len(triage_batch)} search results for a study on: "{intent}"

For each result, output a JSON array with:
- "index": the position (0-based)
- "relevance_score": 0-100 (how relevant to the research intent)
- "summary": 1-sentence summary
- "signal_tags": top 2 predicted signal tags
- "extraction_rationale": why this should be scraped (1 sentence)

Return ONLY the JSON array."""

                triage_result = call_openrouter(
                    system_prompt="You are a search result relevance scorer for market research.",
                    user_prompt=triage_prompt + "\n\nResults:\n" + json.dumps(triage_batch[:50], indent=1),
                    expect_json=True,
                )

                # Merge scores back
                scored_items = triage_result if isinstance(triage_result, list) else triage_result.get("results", [])
                for item in scored_items:
                    idx = item.get("index", -1)
                    if 0 <= idx < len(raw_results):
                        raw_results[idx]["relevance_score"] = item.get("relevance_score", 50)
                        raw_results[idx]["summary"] = item.get("summary", "")
                        raw_results[idx]["signal_tags"] = item.get("signal_tags", [])
                        raw_results[idx]["extraction_rationale"] = item.get("extraction_rationale", "")

            except Exception as e:
                print(f"[Discovery] LLM triage failed: {e}")
                # Assign default scores
                for r in raw_results:
                    r["relevance_score"] = 50

        # Sort by relevance score descending
        ranked = sorted(raw_results, key=lambda x: x.get("relevance_score", 0), reverse=True)

        # Generate CSV file
        csv_path = _save_results_csv(job_id, ranked[:200], intent, engine)

        _jobs[job_id]["status"] = "complete"
        _jobs[job_id]["results"] = ranked[:200]
        _jobs[job_id]["paa_tree"] = result.get("paa_tree", [])
        _jobs[job_id]["stats"] = result.get("stats", {})
        _jobs[job_id]["csv_path"] = csv_path
        _jobs[job_id]["progress"] = {
            "phase": "complete",
            "message": f"Discovery complete. {len(ranked)} ranked URLs ready. CSV saved.",
        }

    except Exception as e:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["progress"] = {"phase": "error", "message": str(e)}


import json
import csv
import io
import pathlib


def _save_results_csv(job_id: str, results: List[Dict], intent: str, engine: str) -> str:
    """Save ranked discovery results to a CSV file on disk."""
    output_dir = pathlib.Path("discovery_outputs")
    output_dir.mkdir(exist_ok=True)
    csv_path = output_dir / f"discovery_{job_id}.csv"

    fieldnames = [
        "rank", "relevance_score", "title", "url", "vertical", "source",
        "summary", "signal_tags", "extraction_rationale", "seed_query"
    ]

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for i, r in enumerate(results):
            writer.writerow({
                "rank": i + 1,
                "relevance_score": r.get("relevance_score", ""),
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "vertical": r.get("vertical", ""),
                "source": r.get("source", ""),
                "summary": r.get("summary", ""),
                "signal_tags": "; ".join(r.get("signal_tags", [])) if isinstance(r.get("signal_tags"), list) else r.get("signal_tags", ""),
                "extraction_rationale": r.get("extraction_rationale", ""),
                "seed_query": r.get("seed_query", ""),
            })

    print(f"[Discovery] CSV saved: {csv_path} ({len(results)} rows)")
    return str(csv_path)


@router.post("/discovery/start")
def start_discovery(request: DiscoveryStartRequest):
    """Start a discovery job in the background."""
    if request.engine not in ENGINE_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown engine: {request.engine}. Use: {list(ENGINE_MAP.keys())}")

    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "status": "queued",
        "engine": request.engine,
        "progress": {"phase": "queued", "message": "Job queued..."},
        "results": [],
        "paa_tree": [],
        "stats": {},
    }

    thread = threading.Thread(
        target=_run_job,
        args=(job_id, request.engine, request.manifest, request.intent, request.graph_nodes, request.paa_depth),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "queued", "engine": request.engine}


@router.get("/discovery/status/{job_id}")
def get_discovery_status(job_id: str):
    """Poll the status of a discovery job."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    job = _jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "results_count": len(job.get("results", [])),
    }


@router.get("/discovery/results/{job_id}")
def get_discovery_results(job_id: str):
    """Get the final ranked results of a completed discovery job."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    job = _jobs[job_id]
    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail=f"Job is still {job['status']}. Poll /status first.")

    return {
        "job_id": job_id,
        "results": job["results"],
        "paa_tree": job["paa_tree"],
        "stats": job["stats"],
    }


@router.get("/discovery/csv/{job_id}")
def download_discovery_csv(job_id: str):
    """Download the discovery results as a CSV file."""
    from fastapi.responses import FileResponse

    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    job = _jobs[job_id]
    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail=f"Job is still {job['status']}.")

    csv_path = job.get("csv_path")
    if not csv_path or not pathlib.Path(csv_path).exists():
        # Generate CSV on the fly if not saved yet
        csv_path = _save_results_csv(job_id, job["results"], "", job.get("engine", "unknown"))

    return FileResponse(
        path=csv_path,
        media_type="text/csv",
        filename=f"outtlyr_discovery_{job_id}.csv",
    )

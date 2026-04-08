"""
ingest.py — Ingestion Orchestration API (Step 7 + Scout Layers)
Triggers both subjective and structural scouts concurrently,
then feeds results through the confidence sieve.
"""

import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.scout_subjective import run_subjective_scout
from services.scout_structural import run_structural_scout
from services.sieve import classify_signals, filter_accepted, filter_rejected
from core.msu_engine import MarginalSignalUtilityEngine

router = APIRouter()

# In-memory job state (replace with Redis/DB in production)
_ingest_jobs: Dict[str, Dict[str, Any]] = {}

class IngestRequest(BaseModel):
    intent: str
    graph_nodes: List[str]
    job_id: Optional[str] = None

class IngestStatusResponse(BaseModel):
    job_id: str
    status: str  # "running", "done", "error"
    progress: Dict[str, Any]
    results: Optional[Dict[str, Any]] = None


def _run_ingest_job(job_id: str, intent: str, nodes: List[str]):
    """Background job: runs scouts → sieve → MSU engine."""
    try:
        _ingest_jobs[job_id]["status"] = "running"
        _ingest_jobs[job_id]["progress"]["stage"] = "subjective_scout"

        # Run Subjective Scout (The "Why")
        subjective_results = run_subjective_scout(intent, nodes)
        _ingest_jobs[job_id]["progress"]["subjective_signals"] = subjective_results["total_signals"]
        _ingest_jobs[job_id]["progress"]["stage"] = "structural_scout"

        # Run Structural Scout (The "Physics")
        structural_results = run_structural_scout(intent, nodes)
        _ingest_jobs[job_id]["progress"]["stage"] = "sieve"

        # Collect raw text signals from subjective layer for sieve
        raw_signals = []
        for signal in subjective_results.get("signals", []):
            text = signal.get("text") or signal.get("title") or ""
            if text:
                raw_signals.append(text)

        # Run Confidence Sieve
        classified = classify_signals(raw_signals[:50], intent)  # Limit to 50 for sieve
        accepted = filter_accepted(classified)
        rejected = filter_rejected(classified)

        _ingest_jobs[job_id]["progress"]["sieve_accepted"] = len(accepted)
        _ingest_jobs[job_id]["progress"]["sieve_rejected"] = len(rejected)
        _ingest_jobs[job_id]["progress"]["stage"] = "msu_check"

        # Run MSU Engine on accepted signals
        msu = MarginalSignalUtilityEngine()
        msu_result = msu.process_batch(
            batch_id=f"batch_{job_id}",
            new_signals=[s.get("suggested_label", s.get("original", "")) for s in accepted]
        )

        _ingest_jobs[job_id]["status"] = "done"
        _ingest_jobs[job_id]["progress"]["stage"] = "complete"
        _ingest_jobs[job_id]["results"] = {
            "subjective": {
                "total": subjective_results["total_signals"],
                "by_platform": {k: len(v) for k, v in subjective_results["by_platform"].items()},
            },
            "structural": {
                "layers": list(structural_results["layers"].keys())
            },
            "sieve": {
                "total_classified": len(classified),
                "accepted": len(accepted),
                "rejected": len(rejected),
                "acceptance_rate": round(len(accepted) / max(len(classified), 1) * 100, 1)
            },
            "msu": msu_result,
            "accepted_signals": accepted[:20],  # Top 20 for UI
            "structural_data": structural_results,
        }

    except Exception as e:
        _ingest_jobs[job_id]["status"] = "error"
        _ingest_jobs[job_id]["progress"]["error"] = str(e)


@router.post("/ingest/start")
async def start_ingest(request: IngestRequest, background_tasks: BackgroundTasks):
    """
    Triggers the full dual-layer ingestion pipeline as a background job.
    Returns a job_id for status polling.
    """
    import uuid
    job_id = request.job_id or str(uuid.uuid4())[:8]

    _ingest_jobs[job_id] = {
        "status": "queued",
        "intent": request.intent,
        "nodes": request.graph_nodes,
        "progress": {
            "stage": "queued",
            "subjective_signals": 0,
            "sieve_accepted": 0,
            "sieve_rejected": 0,
        },
        "results": None
    }

    background_tasks.add_task(
        _run_ingest_job,
        job_id,
        request.intent,
        request.graph_nodes
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"Ingestion pipeline started for intent: '{request.intent[:60]}...'"
    }


@router.get("/ingest/status/{job_id}")
def get_ingest_status(job_id: str):
    """Returns the live status and progress of an ingestion job."""
    if job_id not in _ingest_jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    job = _ingest_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "results": job.get("results")
    }


@router.get("/ingest/jobs")
def list_ingest_jobs():
    """Lists all ingest jobs and their current status."""
    return {
        "jobs": [
            {"job_id": jid, "status": j["status"], "stage": j["progress"].get("stage")}
            for jid, j in _ingest_jobs.items()
        ]
    }

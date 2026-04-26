import json
import pathlib
from fastapi import APIRouter, HTTPException

router = APIRouter()

CAPTURE_DIR = pathlib.Path("latest_run_data")

@router.get("/latest-run")
def get_latest_run():
    """
    DEV BYPASS ENDPOINT.
    Returns the full snapshot of the most recent live run (intent, brief, manifest, graph)
    so the frontend can replay it without calling any LLM endpoints.
    """
    missing = []
    for fname in ["latest_intent.txt", "latest_brief.md", "latest_manifest.json", "latest_graph.json"]:
        if not (CAPTURE_DIR / fname).exists():
            missing.append(fname)

    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"No captured run found. Missing files: {missing}. Please do a full live run first."
        )

    intent = (CAPTURE_DIR / "latest_intent.txt").read_text(encoding="utf-8").strip()
    brief  = (CAPTURE_DIR / "latest_brief.md").read_text(encoding="utf-8")
    manifest = json.loads((CAPTURE_DIR / "latest_manifest.json").read_text(encoding="utf-8"))
    graph    = json.loads((CAPTURE_DIR / "latest_graph.json").read_text(encoding="utf-8"))

    return {
        "intent":   intent,
        "brief":    brief,
        "manifest": manifest,
        "graph":    graph,
    }

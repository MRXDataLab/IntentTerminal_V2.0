import json
import logging
import pathlib
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()

CAPTURE_DIR = pathlib.Path("latest_run_data")

@router.get("/latest-run")
def get_latest_run():
    """
    DEV BYPASS ENDPOINT.
    Returns the full snapshot of the most recent live run (intent, brief, manifest,
    graph, hypothesis_manifest) so the frontend can replay it without calling any
    LLM endpoints.

    The four pre-existing files (intent, brief, manifest, graph) are REQUIRED:
    if any are missing, the endpoint returns 404 with the missing-files list
    (preserves backward compatibility).

    The new ``latest_hypothesis_manifest.json`` file is OPTIONAL:
    - When present, it is loaded and returned under ``hypothesis_manifest``.
    - When absent, ``hypothesis_manifest`` is ``None`` in the response.
    - When present but malformed, a warning is logged and ``hypothesis_manifest``
      is ``None`` (the endpoint never raises 404 due solely to absence or
      corruption of this optional file — Property 15 invariant).
    """
    required = [
        "latest_intent.txt",
        "latest_brief.md",
        "latest_manifest.json",
        "latest_graph.json",
    ]
    missing = [fname for fname in required if not (CAPTURE_DIR / fname).exists()]

    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"No captured run found. Missing files: {missing}. Please do a full live run first."
        )

    intent = (CAPTURE_DIR / "latest_intent.txt").read_text(encoding="utf-8").strip()
    brief  = (CAPTURE_DIR / "latest_brief.md").read_text(encoding="utf-8")
    manifest = json.loads((CAPTURE_DIR / "latest_manifest.json").read_text(encoding="utf-8"))
    graph    = json.loads((CAPTURE_DIR / "latest_graph.json").read_text(encoding="utf-8"))

    # Optional cached hypothesis manifest — gracefully degrade when absent or malformed.
    hypothesis_manifest = None
    hyp_manifest_path = CAPTURE_DIR / "latest_hypothesis_manifest.json"
    if hyp_manifest_path.exists():
        try:
            hypothesis_manifest = json.loads(hyp_manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning(
                "Failed to load latest_hypothesis_manifest.json (%s): %s",
                hyp_manifest_path,
                exc,
            )
            hypothesis_manifest = None

    return {
        "intent":              intent,
        "brief":               brief,
        "manifest":            manifest,
        "graph":               graph,
        "hypothesis_manifest": hypothesis_manifest,
    }

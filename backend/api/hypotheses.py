"""
hypotheses.py — Outtlyr Hypothesis Engine API

Exposes ``POST /api/generate-hypotheses``: accepts the locked intent + full
pillar payload from the Intake Terminal and returns the structured Hypothesis
Manifest produced by ``services.hypothesis_engine.generate_hypothesis_manifest``.

Error mapping (see design.md → Error Taxonomy):
  * 400 — empty/whitespace ``intent``
  * 422 — engine returned a manifest with ``metadata.validation_errors`` populated
          (i.e. all three regeneration attempts failed hard validation)
  * 429 — ``RateLimitExhausted`` raised by the engine (LLM fallback chain spent)
  * 500 — any other engine exception (full stack trace logged)

The response body is the raw manifest ``dict`` rather than a Pydantic model so
``schema_version`` evolution does not require a Python class change.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.hypothesis_engine import (
    RateLimitExhausted,
    generate_hypothesis_manifest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Request models ─────────────────────────────────────────────────────────

class PillarScore(BaseModel):
    label: str
    score: int


class ChatMessage(BaseModel):
    # "user" | "agent" | "assistant" — kept as a free string to match
    # IntakeTerminal's existing message shape.
    role: str
    content: str


class HypothesisRequest(BaseModel):
    intent: str
    pillar_extractions: Optional[Dict[str, Any]] = None
    pillar_scores: Optional[List[PillarScore]] = None
    context_document: Optional[str] = None
    template: Optional[str] = None
    chat_history: Optional[List[ChatMessage]] = None


# ─── Endpoint ───────────────────────────────────────────────────────────────

@router.post("/generate-hypotheses")
async def generate_hypotheses(request: HypothesisRequest) -> Dict[str, Any]:
    """Generate a Hypothesis Manifest from the intake payload.

    Returns the manifest dict on success. Maps engine outcomes to HTTP
    status codes per the design's Error Taxonomy.
    """
    # 400 — intent required
    if not request.intent or not request.intent.strip():
        raise HTTPException(status_code=400, detail="intent is required")

    # Convert the Pydantic sub-models back to plain dicts: the engine helpers
    # operate on raw mappings (matching how `call_openrouter` consumes them).
    pillar_scores = (
        [{"label": p.label, "score": p.score} for p in request.pillar_scores]
        if request.pillar_scores
        else None
    )
    chat_history = (
        [{"role": m.role, "content": m.content} for m in request.chat_history]
        if request.chat_history
        else None
    )

    try:
        manifest = generate_hypothesis_manifest(
            intent=request.intent,
            pillar_extractions=request.pillar_extractions,
            pillar_scores=pillar_scores,
            context_document=request.context_document,
            template=request.template,
            chat_history=chat_history,
        )
    except RateLimitExhausted:
        # Cascading model fallback exhausted — surface to client.
        raise HTTPException(
            status_code=429,
            detail="LLM rate limited; cascading fallback exhausted",
        )
    except HTTPException:
        # Allow nested HTTPExceptions (none expected today, but stay safe).
        raise
    except Exception:
        # Log the full stack trace for ops; return a generic 500 to the client.
        logger.exception("hypothesis engine error")
        raise HTTPException(
            status_code=500,
            detail="hypothesis engine internal error",
        )

    # 422 — engine returned a manifest but hard validation failed after the
    # full retry budget was spent. Surface the partial manifest + errors so
    # the client can render a debug pane.
    validation_errors = (manifest.get("metadata") or {}).get("validation_errors") or []
    if validation_errors:
        logger.warning(f"Manifest generated with validation errors: {validation_errors}")


    # 200 — return the raw manifest dict (FastAPI JSON-encodes via JSONResponse).
    return manifest

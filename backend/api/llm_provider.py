"""
llm_provider.py — API endpoints for LLM provider selection.

Exposes GET/POST /api/llm-provider so the frontend can:
  1. Fetch the list of available providers + active status
  2. Switch the active provider at application startup
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.llm_client import (
    get_active_provider,
    get_provider_status,
    set_active_provider,
)

router = APIRouter()


class ProviderSelectRequest(BaseModel):
    provider_id: str


@router.get("/llm-provider")
def list_providers():
    """Return all supported providers with availability and active status."""
    return {
        "providers": get_provider_status(),
        "active": get_active_provider(),
    }


@router.post("/llm-provider")
def select_provider(request: ProviderSelectRequest):
    """Switch the active LLM provider."""
    try:
        result = set_active_provider(request.provider_id)
        return {
            "status": "success",
            **result,
            "providers": get_provider_status(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

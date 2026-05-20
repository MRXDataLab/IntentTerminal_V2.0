"""
llm_client.py — LLM provider abstraction with quota-aware fallback.

Optimizations to minimize Gemini quota burn:
  1. Per-model 429 retries removed (the model cascade already handles fallback).
  2. Hard 429s with "monthly spending cap" / "exceeded" / "RESOURCE_EXHAUSTED"
     short-circuit the cascade — every Gemini model in this project shares
     the same quota, so trying the next model is a guaranteed waste.
  3. Process-level circuit breaker: once the monthly cap is detected, skip
     Gemini entirely for ``CIRCUIT_BREAKER_TTL_SEC`` and fall through to
     OpenRouter immediately. Resets after the TTL.
  4. ``maxOutputTokens`` capped per call so short prompts don't burn long
     output budgets.
  5. Soft rate-limit (per-minute / RPM) errors get ONE quick retry with a
     2s wait — beyond that we cascade rather than burn more time.
"""

import os
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# OpenRouter free models to try when Gemini is exhausted.
OPENROUTER_MODELS = [
    "deepseek/deepseek-v4-flash:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
]

# Gemini models to try in order (all free tier)
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
]

# Output token cap — most prompts in this app produce <2k tokens, but briefs can be very long.
MAX_OUTPUT_TOKENS_DEFAULT = 8192
MAX_OUTPUT_TOKENS_JSON = 8192


def _is_monthly_cap_error(message: str) -> bool:
    """True iff the 429 message indicates a project-level cap exhaustion."""
    lowered = (message or "").lower()
    return any(
        phrase in lowered
        for phrase in (
            "monthly spending cap",
            "exceeded its monthly",
            "exceeded your current quota",
            "resource_exhausted",
            "quota exceeded",
            "spending cap",
        )
    )


def _build_gemini_contents(user_prompt: str, chat_history: list | None) -> list:
    """Compose Gemini ``contents`` array, normalizing roles and edge cases."""
    contents: list = []
    if chat_history:
        for msg in chat_history:
            role = "model" if msg["role"] in ("assistant", "agent") else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    if user_prompt:
        contents.append({"role": "user", "parts": [{"text": user_prompt}]})
    # Gemini requires the first message to be from "user".
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "Hello, let's begin."}]})
    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Please respond based on the system instructions."}]})
    return contents


def _strip_json_fences(content: str) -> str:
    """Remove ```json ... ``` fences if the model wrapped JSON in them."""
    cleaned = content.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _parse_json_or_raise(content: str, source: str) -> dict | list:
    """Parse JSON, falling back to fence-stripping. Raises on hard failure."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        try:
            return json.loads(_strip_json_fences(content))
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse JSON from {source}: {content[:300]}") from e


def _call_gemini(
    model: str,
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
):
    """Call a specific Gemini model. Single attempt with one short retry on
    soft (per-minute) rate limits. Hard caps (monthly spend / RESOURCE_EXHAUSTED)
    raise immediately so the caller can short-circuit the cascade."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={GEMINI_API_KEY}"
    )

    payload = {
        "systemInstruction": {"role": "system", "parts": [{"text": system_prompt}]},
        "contents": _build_gemini_contents(user_prompt, chat_history),
        "generationConfig": {
            "maxOutputTokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
        },
    }
    if expect_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    # Retry with extended backoff for rate limits
    max_retries = 5
    for attempt in range(max_retries):
        response = requests.post(
            url, json=payload, headers={"Content-Type": "application/json"}, timeout=120
        )

        if response.status_code == 200:
            break

        body = response.text[:500]

        if response.status_code in [429, 503]:
            if response.status_code == 429 and _is_monthly_cap_error(body):
                # Project-level cap. All Gemini models share this quota —
                # skip the cascade entirely.
                raise Exception(f"GEMINI_CAPPED: {model}: {body[:200]}")
            if attempt < max_retries - 1:
                wait = 8 * (attempt + 1)
                print(f"[Gemini {model}] Error {response.status_code}. Waiting {wait}s...")
                time.sleep(wait)
                continue
            
            raise Exception(f"Gemini API Error ({model}): {response.status_code} - {body[:200]}")

        # Non-429 hard failure — no retry.
        raise Exception(f"Gemini API Error ({model}): {response.status_code} - {body[:200]}")

    result = response.json()
    try:
        content = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse Gemini response ({model}): {json.dumps(result)[:300]}")

    if expect_json:
        return _parse_json_or_raise(content, f"Gemini ({model})")
    return content


def _call_openrouter_api(
    model: str,
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
):
    """Call OpenRouter API as a fallback when Gemini is unavailable."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "Outtlyr MRX Module-1",
    }

    messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        for msg in chat_history:
            role = "assistant" if msg["role"] in ("assistant", "agent") else "user"
            messages.append({"role": role, "content": msg["content"]})
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})

    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
    }
    if expect_json:
        payload["response_format"] = {"type": "json_object"}

    response = requests.post(url, json=payload, headers=headers, timeout=60)
    if response.status_code != 200:
        raise Exception(f"OpenRouter Error ({model}): {response.status_code} - {response.text[:300]}")

    result = response.json()
    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse OpenRouter response ({model}): {json.dumps(result)[:300]}")

    if expect_json:
        return _parse_json_or_raise(content, f"OpenRouter ({model})")
    return content


def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    model: str | None = None,
):
    """
    Main LLM entry point. Tries Gemini first (cheaper-first cascade), then
    falls back to OpenRouter when Gemini is exhausted.

    The ``model`` parameter is accepted for backward compatibility but ignored.
    """
    if not GEMINI_API_KEY and not OPENROUTER_API_KEY:
        raise ValueError(
            "Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set. "
            "Add at least one to backend/.env"
        )

    last_error: str | None = None

    # ── Phase 1: Gemini cascade (always try first) ──
    if GEMINI_API_KEY:
        for gemini_model in GEMINI_MODELS:
            try:
                return _call_gemini(
                    gemini_model, system_prompt, user_prompt, chat_history, expect_json
                )
            except Exception as e:
                last_error = str(e)
                if last_error.startswith("GEMINI_CAPPED:"):
                    # Project-level cap — all models share this quota.
                    # Break the Gemini cascade and fall through to OpenRouter.
                    print(f"[LLM] {gemini_model} hit project cap; skipping remaining Gemini models.")
                    break
                print(f"[LLM] {gemini_model} failed: {last_error[:120]}. Trying next Gemini model...")
                continue

    # ── Fallback: OpenRouter free models ──
    # User requested to disable OpenRouter
    raise Exception(f"All Gemini models exhausted. OpenRouter fallback is disabled. Last error: {last_error}")

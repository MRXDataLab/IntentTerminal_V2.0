"""
llm_client.py — Multi-provider LLM abstraction with startup-selectable backend.

Supported providers (selected at application startup via /api/llm-provider):
  1. gcp_gemini       — GCP Gemini Endpoint (Vertex AI express mode, API key auth)
  2. gemini_studio    — Gemini Studio direct API (existing free-tier cascade)
  3. deepseek_api     — DeepSeek API (chat completions)
  4. openrouter       — OpenRouter multi-model gateway
  5. local_llm        — Local LLM placeholder (Ollama, vLLM, etc.)

The public entry point ``call_openrouter`` is preserved for backward
compatibility — all callers (intake, ecosystem, brief, hypothesis engine, etc.)
continue to use it unchanged.
"""

import os
import json
import time
import requests
import hashlib
import threading
from dotenv import load_dotenv

load_dotenv()

# ── Global LLM cache ─────────────────────────────────────────────────────────
_llm_cache = {}
_llm_cache_lock = threading.Lock()

# ── API Keys ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
VERTEX_AI_API_KEY = os.getenv("VERTEX_AI_API_KEY")
LOCAL_LLM_URL = os.getenv("LOCAL_LLM_URL", "http://localhost:11434")

# GCP Vertex AI Express Mode endpoint (no project/location needed with API key)
VERTEX_AI_BASE_URL = "https://aiplatform.googleapis.com/v1beta1/publishers/google/models"

# ── Provider Configuration ────────────────────────────────────────────────────
# This is set at startup via the /api/llm-provider endpoint.
# Default: gemini_studio (preserves existing behavior).
_active_provider = "gemini_studio"
_provider_lock = threading.Lock()

SUPPORTED_PROVIDERS = [
    {
        "id": "gcp_gemini",
        "name": "GCP Gemini Endpoint",
        "description": "Vertex AI Express Mode — Gemini models via GCP with API key authentication",
        "icon": "cloud",
        "color": "#4285F4",
        "requires": ["VERTEX_AI_API_KEY"],
    },
    {
        "id": "gemini_studio",
        "name": "Gemini Studio",
        "description": "Gemini API direct access — free-tier cascade across flash models",
        "icon": "sparkles",
        "color": "#8B5CF6",
        "requires": ["GEMINI_API_KEY"],
    },
    {
        "id": "deepseek_api",
        "name": "DeepSeek API",
        "description": "DeepSeek V4 — high-performance reasoning model via OpenAI-compatible API",
        "icon": "brain",
        "color": "#06B6D4",
        "requires": ["DEEPSEEK_API_KEY"],
    },
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "description": "OpenRouter multi-model gateway — access to 200+ models via unified API",
        "icon": "route",
        "color": "#F59E0B",
        "requires": ["OPENROUTER_API_KEY"],
    },
    {
        "id": "local_llm",
        "name": "Local LLM",
        "description": "Local inference server (Ollama, vLLM, LM Studio) — coming soon",
        "icon": "server",
        "color": "#10B981",
        "requires": [],
        "placeholder": True,
    },
]


def get_active_provider() -> str:
    """Return the currently active provider ID."""
    with _provider_lock:
        return _active_provider


def set_active_provider(provider_id: str) -> dict:
    """Set the active LLM provider. Returns status dict."""
    global _active_provider
    valid_ids = [p["id"] for p in SUPPORTED_PROVIDERS]
    if provider_id not in valid_ids:
        raise ValueError(f"Unknown provider '{provider_id}'. Valid: {valid_ids}")

    # Check if the provider is a placeholder
    provider_info = next(p for p in SUPPORTED_PROVIDERS if p["id"] == provider_id)
    if provider_info.get("placeholder"):
        raise ValueError(f"Provider '{provider_id}' is not yet available (placeholder).")

    with _provider_lock:
        _active_provider = provider_id

    # Clear cache when switching providers
    with _llm_cache_lock:
        _llm_cache.clear()

    print(f"[LLM] Active provider switched to: {provider_id}")
    return {"provider": provider_id, "status": "active"}


def get_provider_status() -> list:
    """Return the list of providers with their availability status."""
    active = get_active_provider()
    result = []
    for p in SUPPORTED_PROVIDERS:
        available = True
        for env_var in p.get("requires", []):
            if not os.getenv(env_var):
                available = False
                break
        result.append({
            **p,
            "available": available and not p.get("placeholder", False),
            "active": p["id"] == active,
        })
    return result


# ── OpenRouter free models ────────────────────────────────────────────────────
OPENROUTER_MODELS = [
    "deepseek/deepseek-v4-flash:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
]

# ── Gemini models cascade ────────────────────────────────────────────────────
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]

# ── DeepSeek models ───────────────────────────────────────────────────────────
DEEPSEEK_MODELS = [
    "deepseek-chat",
    "deepseek-reasoner",
]

# ── Output token caps ─────────────────────────────────────────────────────────
# ── GCP Gemini models (Vertex AI express mode) ───────────────────────────────
GCP_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
]

# ── Output token caps ─────────────────────────────────────────────────────────
MAX_OUTPUT_TOKENS_DEFAULT = 8192
MAX_OUTPUT_TOKENS_JSON = 16384



# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

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


def _build_openai_messages(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
) -> list:
    """Build OpenAI-compatible messages array (used by DeepSeek, OpenRouter, Local LLM)."""
    messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        for msg in chat_history:
            role = "assistant" if msg["role"] in ("assistant", "agent") else "user"
            messages.append({"role": role, "content": msg["content"]})
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})
    return messages


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER: GEMINI STUDIO (existing)
# ═══════════════════════════════════════════════════════════════════════════════

def _call_gemini(
    model: str,
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
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
    if expect_json or response_schema:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    if response_schema:
        payload["generationConfig"]["responseSchema"] = response_schema

    # Retry with extended backoff for rate limits
    max_retries = 5
    for attempt in range(max_retries):
        response = requests.post(
            url, json=payload, headers={"Content-Type": "application/json"}, timeout=120
        )

        if response.status_code == 200:
            break

        body = response.text[:500]

        if response.status_code == 503:
            raise Exception(f"Gemini API Error ({model}): 503 Service Unavailable - {body[:200]}")

        if response.status_code == 429:
            if _is_monthly_cap_error(body):
                # Project-level cap. All Gemini models share this quota —
                # skip the cascade entirely.
                raise Exception(f"GEMINI_CAPPED: {model}: {body[:200]}")
            if attempt < max_retries - 1:
                wait = 2 * (attempt + 1)
                print(f"[Gemini {model}] Error 429. Waiting {wait}s...")
                time.sleep(wait)
                continue
            
            raise Exception(f"Gemini API Error ({model}): 429 - {body[:200]}")

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


def _dispatch_gemini_studio(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """Gemini Studio cascade: try each model in order."""
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY is not set in .env")

    last_error = None
    for gemini_model in GEMINI_MODELS:
        try:
            return _call_gemini(
                gemini_model, system_prompt, user_prompt, chat_history, expect_json, response_schema
            )
        except Exception as e:
            last_error = str(e)
            if last_error.startswith("GEMINI_CAPPED:"):
                print(f"[LLM] {gemini_model} hit project cap; skipping remaining Gemini models.")
                break
            print(f"[LLM] {gemini_model} failed: {last_error[:120]}. Trying next Gemini model...")
            continue

    raise Exception(f"All Gemini Studio models exhausted. Last error: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER: GCP GEMINI ENDPOINT (Vertex AI Express Mode)
# ═══════════════════════════════════════════════════════════════════════════════

def _call_gcp_gemini(
    model: str,
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """Call a Gemini model via Vertex AI express mode endpoint.
    Uses API key authentication with the global aiplatform.googleapis.com endpoint.
    Retries on transient rate-limit errors with exponential backoff."""
    url = f"{VERTEX_AI_BASE_URL}/{model}:generateContent?key={VERTEX_AI_API_KEY}"

    payload = {
        "systemInstruction": {"role": "system", "parts": [{"text": system_prompt}]},
        "contents": _build_gemini_contents(user_prompt, chat_history),
        "generationConfig": {
            "maxOutputTokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
        },
    }
    if expect_json or response_schema:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    if response_schema:
        payload["generationConfig"]["responseSchema"] = response_schema

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
                # Project-level cap. All models share this quota —
                # skip the cascade entirely.
                raise Exception(f"GCP_CAPPED: {model}: {body[:200]}")
            if attempt < max_retries - 1:
                wait = 8 * (attempt + 1)
                print(f"[GCP Gemini {model}] Error {response.status_code}. Waiting {wait}s...")
                time.sleep(wait)
                continue

            raise Exception(f"GCP Gemini Error ({model}): {response.status_code} - {body[:200]}")

        # Non-429 hard failure — no retry.
        raise Exception(f"GCP Gemini Error ({model}): {response.status_code} - {body[:200]}")

    result = response.json()
    try:
        content = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse GCP Gemini response ({model}): {json.dumps(result)[:300]}")

    if expect_json:
        return _parse_json_or_raise(content, f"GCP Gemini ({model})")
    return content


def _dispatch_gcp_gemini(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """GCP Gemini cascade: try each model in order via Vertex AI express mode."""
    if not VERTEX_AI_API_KEY:
        raise Exception("VERTEX_AI_API_KEY is not set in .env")

    last_error = None
    for model in GCP_GEMINI_MODELS:
        try:
            return _call_gcp_gemini(
                model, system_prompt, user_prompt, chat_history, expect_json, response_schema
            )
        except Exception as e:
            last_error = str(e)
            if last_error.startswith("GCP_CAPPED:"):
                print(f"[LLM] {model} hit project cap; skipping remaining GCP Gemini models.")
                break
            print(f"[LLM] GCP Gemini {model} failed: {last_error[:120]}. Trying next model...")
            continue

    raise Exception(f"All GCP Gemini models exhausted. Last error: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER: DEEPSEEK API
# ═══════════════════════════════════════════════════════════════════════════════

def _dispatch_deepseek(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """Call DeepSeek API using OpenAI-compatible chat completions endpoint."""
    if not DEEPSEEK_API_KEY:
        raise Exception("DEEPSEEK_API_KEY is not set in .env")

    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    messages = _build_openai_messages(system_prompt, user_prompt, chat_history)

    last_error = None
    for model in DEEPSEEK_MODELS:
        payload: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
            "stream": False,
        }
        if expect_json or response_schema:
            payload["response_format"] = {"type": "json_object"}

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=120)
            
            if response.status_code != 200:
                body = response.text[:300]
                last_error = f"DeepSeek API Error ({model}): {response.status_code} - {body}"
                print(f"[LLM] {last_error}")
                continue

            result = response.json()
            try:
                content = result["choices"][0]["message"]["content"]
            except (KeyError, IndexError):
                last_error = f"Failed to parse DeepSeek response ({model}): {json.dumps(result)[:300]}"
                continue

            if expect_json:
                return _parse_json_or_raise(content, f"DeepSeek ({model})")
            return content

        except requests.exceptions.Timeout:
            last_error = f"DeepSeek API ({model}): Request timed out"
            continue
        except Exception as e:
            last_error = str(e)
            continue

    raise Exception(f"All DeepSeek models exhausted. Last error: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER: OPENROUTER
# ═══════════════════════════════════════════════════════════════════════════════

def _call_openrouter_api(
    model: str,
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """Call OpenRouter API."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "Outtlyr MRX Module-1",
    }

    messages = _build_openai_messages(system_prompt, user_prompt, chat_history)

    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
    }
    if expect_json or response_schema:
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


def _dispatch_openrouter(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """OpenRouter cascade: try each free model in order."""
    if not OPENROUTER_API_KEY:
        raise Exception("OPENROUTER_API_KEY is not set in .env")

    last_error = None
    for model in OPENROUTER_MODELS:
        try:
            return _call_openrouter_api(
                model, system_prompt, user_prompt, chat_history, expect_json, response_schema
            )
        except Exception as e:
            last_error = str(e)
            print(f"[LLM] OpenRouter {model} failed: {last_error[:120]}. Trying next...")
            continue

    raise Exception(f"All OpenRouter models exhausted. Last error: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER: LOCAL LLM (placeholder)
# ═══════════════════════════════════════════════════════════════════════════════

def _dispatch_local_llm(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    response_schema: dict | None = None,
):
    """Local LLM — Ollama/vLLM/LM Studio via OpenAI-compatible endpoint."""
    model = os.getenv("LOCAL_LLM_MODEL", "llama3.1:8b")
    url = f"{LOCAL_LLM_URL}/v1/chat/completions"

    messages = _build_openai_messages(system_prompt, user_prompt, chat_history)

    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": MAX_OUTPUT_TOKENS_JSON if expect_json else MAX_OUTPUT_TOKENS_DEFAULT,
        "stream": False,
    }
    if expect_json or response_schema:
        payload["response_format"] = {"type": "json_object"}

    try:
        response = requests.post(url, json=payload, timeout=120)
    except requests.exceptions.ConnectionError:
        raise Exception(
            f"Local LLM server not reachable at {LOCAL_LLM_URL}. "
            f"Start Ollama/vLLM/LM Studio first."
        )

    if response.status_code != 200:
        raise Exception(f"Local LLM Error: {response.status_code} - {response.text[:300]}")

    result = response.json()
    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse Local LLM response: {json.dumps(result)[:300]}")

    if expect_json:
        return _parse_json_or_raise(content, "Local LLM")
    return content


# ═══════════════════════════════════════════════════════════════════════════════
# DISPATCH ROUTER
# ═══════════════════════════════════════════════════════════════════════════════

_PROVIDER_DISPATCH = {
    "gcp_gemini": _dispatch_gcp_gemini,
    "gemini_studio": _dispatch_gemini_studio,
    "deepseek_api": _dispatch_deepseek,
    "openrouter": _dispatch_openrouter,
    "local_llm": _dispatch_local_llm,
}


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT (backward-compatible name)
# ═══════════════════════════════════════════════════════════════════════════════

def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    chat_history: list | None = None,
    expect_json: bool = False,
    model: str | None = None,
    response_schema: dict | None = None,
):
    """
    Main LLM entry point. Routes to the active provider configured at startup.

    The ``model`` parameter is accepted for backward compatibility but ignored
    (each provider manages its own model cascade internally).
    """
    # ── Phase 0: Caching ──
    cache_key_data = json.dumps({
        "sys": system_prompt,
        "usr": user_prompt,
        "hist": chat_history,
        "json": expect_json,
        "schema": response_schema,
        "provider": get_active_provider(),
    }, sort_keys=True)
    cache_key = hashlib.sha256(cache_key_data.encode("utf-8")).hexdigest()

    with _llm_cache_lock:
        if cache_key in _llm_cache:
            print("[LLM Cache Hit]")
            return _llm_cache[cache_key]

    # ── Phase 1: Dispatch to active provider ──
    provider_id = get_active_provider()
    dispatch_fn = _PROVIDER_DISPATCH.get(provider_id)

    if not dispatch_fn:
        raise ValueError(f"No dispatch function for provider '{provider_id}'")

    print(f"[LLM] Dispatching to provider: {provider_id}")

    result_content = dispatch_fn(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        chat_history=chat_history,
        expect_json=expect_json,
        response_schema=response_schema,
    )

    with _llm_cache_lock:
        _llm_cache[cache_key] = result_content

    return result_content

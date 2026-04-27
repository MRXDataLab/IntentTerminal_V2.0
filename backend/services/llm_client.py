import os
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Gemini models to try in order (all free tier)
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]


def _call_gemini(model: str, system_prompt: str, user_prompt: str, chat_history: list = None, expect_json: bool = False):
    """Call a specific Gemini model via the native REST API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"

    contents = []

    # Process chat history
    if chat_history:
        for msg in chat_history:
            role = "model" if msg["role"] in ["assistant", "agent"] else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    # Add new user prompt
    if user_prompt:
        contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    # Gemini requires the first message to be from "user"
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "Hello, let's begin."}]})

    # If no contents at all (empty user_prompt and no history), add a placeholder
    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Please respond based on the system instructions."}]})

    payload = {
        "systemInstruction": {
            "role": "system",
            "parts": [{"text": system_prompt}]
        },
        "contents": contents
    }

    if expect_json:
        payload["generationConfig"] = {
            "responseMimeType": "application/json"
        }

    # Retry with backoff for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=90)

        if response.status_code == 429 and attempt < max_retries - 1:
            wait = 2 ** (attempt + 1)
            print(f"[Gemini {model}] Rate limited. Waiting {wait}s...")
            time.sleep(wait)
            continue

        if response.status_code != 200:
            raise Exception(f"Gemini API Error ({model}): {response.status_code} - {response.text[:300]}")

        break

    result = response.json()
    try:
        content = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse Gemini response ({model}): {json.dumps(result)[:300]}")

    if expect_json:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            cleaned = content.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            try:
                return json.loads(cleaned.strip())
            except json.JSONDecodeError as e:
                raise Exception(f"Failed to parse JSON from Gemini ({model}): {content[:300]}") from e

    return content


def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    chat_history: list = None,
    expect_json: bool = False,
    model: str = None
):
    """
    Main LLM entry point. Uses Gemini native API exclusively.
    The 'model' parameter is accepted for backward compatibility but ignored —
    all calls route through Gemini models.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set in environment variables. Add it to backend/.env")

    last_error = None

    for gemini_model in GEMINI_MODELS:
        try:
            result = _call_gemini(gemini_model, system_prompt, user_prompt, chat_history, expect_json)
            return result
        except Exception as e:
            last_error = str(e)
            print(f"[LLM] {gemini_model} failed: {last_error[:120]}. Trying next model...")
            # Rate limit or server error → try next model
            if "429" in last_error or "500" in last_error or "503" in last_error:
                continue
            # For other errors (parsing, etc.), also try next model
            continue

    raise Exception(f"All Gemini models exhausted. Last error: {last_error}")

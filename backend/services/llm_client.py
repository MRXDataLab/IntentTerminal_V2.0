import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

FREE_MODELS = [
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "google/gemma-4-26b-a4b-it:free",
]

def _call_gemini_native(system_prompt: str, user_prompt: str, chat_history: list = None, expect_json: bool = False):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    contents = []
    
    # Process history
    if chat_history:
        for msg in chat_history:
            role = "model" if msg["role"] in ["assistant", "agent"] else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
            
    # Add new prompt if exists
    if user_prompt:
        contents.append({"role": "user", "parts": [{"text": user_prompt}]})
        
    # Edge case: If the first message in contents is 'model', Gemini throws an error.
    # We must prepend a dummy user message to satisfy alternating turn requirements
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "Hello, let's begin."}]})

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

    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    
    if response.status_code != 200:
        raise Exception(f"Gemini API Error: {response.status_code} - {response.text}")
        
    result = response.json()
    try:
        content = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise Exception(f"Failed to parse Gemini response: {result}")
        
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
                raise Exception(f"Failed to parse JSON from Gemini: {content}") from e

    return content


def _call_once(model: str, messages: list, data_base: dict, headers: dict, expect_json: bool):
    data = {**data_base, "model": model, "messages": messages}
    if expect_json:
        data["response_format"] = {"type": "json_object"}

    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        data=json.dumps(data),
        timeout=60
    )
    return response

def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    chat_history: list = None,
    expect_json: bool = False,
    model: str = None
):
    # If a native Gemini API key is active, hijack the request and use it
    if GEMINI_API_KEY:
        return _call_gemini_native(system_prompt, user_prompt, chat_history, expect_json)

    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set in environment variables.")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        messages.extend(chat_history)
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})

    models_to_try = [model] if model else FREE_MODELS
    last_error = None
    
    for m in models_to_try:
        try:
            response = _call_once(m, messages, {}, headers, expect_json)

            if response.status_code in (400, 429, 502, 503, 404):
                last_error = f"{m} failed ({response.status_code})"
                continue

            if response.status_code != 200:
                raise Exception(f"OpenRouter API Error [{m}]: {response.status_code} - {response.text}")

            result = response.json()
            content = result["choices"][0]["message"]["content"]

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
                        raise Exception(f"Failed to parse JSON from LLM [{m}]: {content}") from e

            return content

        except Exception as e:
            last_error = str(e)
            if "429" in str(e) or "rate" in str(e).lower() or "503" in str(e) or "502" in str(e):
                continue
            raise

    raise Exception(f"All models exhausted. Last error: {last_error}")

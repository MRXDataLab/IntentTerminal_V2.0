"""
sieve.py — Confidence-Based Signal Router (FR 3.3)

Two-path classifier:
  Path 1 (Fast): Known entity found in seeds.py → instant 100% confidence → ACCEPT
  Path 2 (LLM):  Unknown signal → batch 10-15 → OpenRouter verification → accept if ≥ 0.6 confidence
"""

import json
from typing import List, Dict, Any
from services.seeds import lookup
from services.llm_client import call_openrouter

CONFIDENCE_THRESHOLD = 0.6
LLM_BATCH_SIZE = 12

SYSTEM_PROMPT_SIEVE = """You are a signal relevance classifier for a market research system.
You will receive a batch of raw text signals (comments, phrases, data points) along with the research intent context.
For each signal, determine:
1. Is it relevant to the research intent?
2. What named entity or concept does it refer to (if any)?
3. Your confidence score (0.0 to 1.0) that it is genuinely relevant.

Return a JSON array — one entry per signal in the exact order provided:
[
  {
    "original": "the original signal text",
    "entity": "Extracted entity or concept name, or null",
    "is_relevant": true,
    "confidence": 0.85,
    "suggested_label": "A clean 2-4 word tag for this signal",
    "reason": "One concise sentence explaining why"
  }
]
"""

def classify_signals(signals: List[str], intent_context: str) -> List[Dict[str, Any]]:
    """
    Run the full sieve on a list of raw text signals.
    Returns classified signals with confidence scores.
    """
    results = []

    # Partition signals: fast-path via seeds vs LLM verification
    fast_path = []
    llm_path = []

    for signal in signals:
        seed_match = lookup(signal)
        if seed_match:
            fast_path.append({
                "original": signal,
                "entity": seed_match["label"],
                "is_relevant": True,
                "confidence": 1.0,
                "suggested_label": seed_match["label"],
                "reason": f"Matched known entity from seed dictionary: {seed_match['category']}",
                "path": "SEED"
            })
        else:
            llm_path.append(signal)

    results.extend(fast_path)

    # Batch LLM verification for unknown signals
    for i in range(0, len(llm_path), LLM_BATCH_SIZE):
        batch = llm_path[i:i + LLM_BATCH_SIZE]
        user_prompt = f"Research Intent: {intent_context}\n\nSignals to classify:\n{json.dumps(batch)}"

        try:
            llm_result = call_openrouter(
                system_prompt=SYSTEM_PROMPT_SIEVE,
                user_prompt=user_prompt,
                expect_json=True
            )

            # Handle both list and wrapped dict responses
            if isinstance(llm_result, list):
                batch_results = llm_result
            elif isinstance(llm_result, dict):
                batch_results = llm_result.get("results", llm_result.get("signals", []))
            else:
                batch_results = []

            for item in batch_results:
                item["path"] = "LLM"
                results.append(item)

        except Exception as e:
            # Fallback if LLM fails — mark as low confidence
            for signal in batch:
                results.append({
                    "original": signal,
                    "entity": None,
                    "is_relevant": False,
                    "confidence": 0.0,
                    "suggested_label": "Unclassified",
                    "reason": f"LLM verification failed: {str(e)[:80]}",
                    "path": "FALLBACK"
                })

    return results


def filter_accepted(classified: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filter to only signals that passed the confidence threshold."""
    return [s for s in classified if s.get("confidence", 0) >= CONFIDENCE_THRESHOLD and s.get("is_relevant", False)]


def filter_rejected(classified: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filter to only signals that were rejected."""
    return [s for s in classified if s.get("confidence", 0) < CONFIDENCE_THRESHOLD or not s.get("is_relevant", True)]

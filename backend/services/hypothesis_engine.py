"""
hypothesis_engine.py — Outtlyr Hypothesis Engine

Three-stage hypothesis generation pipeline that consolidates hypothesis
creation into a single first-class stage, emitting a structured Hypothesis
Manifest consumed by all downstream stages (brief, manifest, ecosystem,
intelligence map).

Stages:
  1. DECOMPOSER     — splits the intent into one or more core problems
  2. GENERATOR      — for each problem, generates exhaustive hypotheses with
                      contrarian pairs. Runs twice per problem (context-aware
                      + naive de-anchored pass) to mitigate confirmation bias.
  3. MECE_AUDITOR   — reviews the merged hypothesis set for semantic overlap
                      and merges duplicates. Runs in fresh context with no
                      chat history. Up to MAX_MECE_AUDIT_ITERATIONS iterations.

This module currently exposes ONLY:
  - module-level constants (SCHEMA_VERSION, dimension/force/priority/source sets)
  - Literal type aliases used by the manifest schema
  - Pydantic v2 models for internal validation of the manifest

The orchestrator (``generate_hypothesis_manifest``) and private helper
functions are implemented in a follow-up task.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ValidationInfo, field_validator


# ─── Constants ──────────────────────────────────────────────────────────────

SCHEMA_VERSION: str = "1.0"
MIN_EXPECTED_SIGNALS: int = 3
MAX_MECE_AUDIT_ITERATIONS: int = 0
MAX_GENERATION_RETRIES: int = 2
MAX_HYPOTHESES: int = 40

#: Ten structural taxonomy dimensions the GENERATOR stage must evaluate.
STRUCTURAL_DIMENSIONS: List[str] = [
    "price",
    "product",
    "brand_perception",
    "distribution",
    "cultural_identity",
    "regulatory",
    "demographic_shift",
    "competitive_shift",
    "situational_context",
    "identity_expression",
]

#: Snake-case slugs for the five Strategic Forces defined in
#: ``services.force_taxonomy``.
VALID_FORCES: set[str] = {
    "demand_gravity",
    "choice_architecture_pressure",
    "value_elasticity_field",
    "reinforcement_stability",
    "competitive_energy_field",
}

VALID_PRIORITIES: set[str] = {"high", "medium", "low"}
VALID_GEN_SOURCES: set[str] = {"context_aware", "naive", "contrarian_pair"}


# ─── Literal type aliases ───────────────────────────────────────────────────

StructuralDimension = Literal[
    "price",
    "product",
    "brand_perception",
    "distribution",
    "cultural_identity",
    "regulatory",
    "demographic_shift",
    "competitive_shift",
    "situational_context",
    "identity_expression",
]

StrategicForce = Literal[
    "demand_gravity",
    "choice_architecture_pressure",
    "value_elasticity_field",
    "reinforcement_stability",
    "competitive_energy_field",
]

GenerationSource = Literal["context_aware", "naive", "contrarian_pair"]
InvestigationPriority = Literal["high", "medium", "low"]
Priority = Literal["primary", "secondary"]


# ─── Pydantic v2 schema models ──────────────────────────────────────────────

class HypothesisModel(BaseModel):
    """A single structured hypothesis record within the Hypothesis Manifest.

    Mirrors Section 5.1 of ``UPDATE_HYPOTHESIS_GENERATION.md`` and the Data
    Models section of ``design.md``.
    """

    id: str = Field(..., pattern=r"^h_\d{3,}$|^h_merged_[a-f0-9]+$")
    statement: str = Field(..., min_length=1)
    dimension: StructuralDimension
    force_assignment: StrategicForce
    mece_cluster_id: str = Field(..., min_length=1)
    expected_signals: List[str] = Field(..., min_length=MIN_EXPECTED_SIGNALS)
    expected_counter_signals: List[str] = Field(default_factory=list)
    contrarian_pair_id: Optional[str] = None
    investigation_priority: InvestigationPriority
    generation_source: GenerationSource
    rationale: str = ""

    @field_validator("rationale")
    @classmethod
    def _justify_null_pair(cls, v: str, info: ValidationInfo) -> str:
        """Hard validation rule 2: a null ``contrarian_pair_id`` requires a
        rationale that explicitly justifies the absence of an opposite.
        """
        if info.data.get("contrarian_pair_id") is None:
            lowered = v.lower()
            if (
                "no meaningful opposite" not in lowered
                and "no useful contrarian" not in lowered
            ):
                raise ValueError(
                    "contrarian_pair_id=null requires rationale justification "
                    "containing 'no meaningful opposite' or 'no useful contrarian'"
                )
        return v


class CoreProblemModel(BaseModel):
    """A discrete problem decomposed from the research intent.

    Each Core Problem owns a non-empty list of hypotheses.
    """

    id: str = Field(..., pattern=r"^cp_\d{3,}$")
    statement: str
    priority: Priority
    decomposed_from_intent: bool
    hypothesis_count: int
    hypotheses: List[HypothesisModel] = Field(..., min_length=1)


class ManifestMetadataModel(BaseModel):
    """Manifest-level counters and audit telemetry."""

    total_core_problems: int
    total_hypotheses: int
    total_contrarian_pairs: int
    generation_method: str = "ai_native_mece"
    mece_audit_passed: bool
    mece_audit_iterations: int = Field(..., ge=0, le=MAX_MECE_AUDIT_ITERATIONS)
    de_anchored_pass_count: int = Field(..., ge=0)
    dimensions_covered: List[StructuralDimension]
    validation_errors: Optional[List[str]] = None
    audit_notes: Optional[List[str]] = None


class HypothesisManifestModel(BaseModel):
    """Top-level Hypothesis Manifest schema (version 1.0)."""

    schema_version: Literal["1.0"]
    generated_at: str  # ISO 8601 timestamp
    intent: str
    metadata: ManifestMetadataModel
    core_problems: List[CoreProblemModel] = Field(..., min_length=1)


# ─── Imports for orchestrator ───────────────────────────────────────────────

import hashlib
import json
import logging
import pathlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from pydantic import ValidationError

from kb.kb_loader import load_kb
from services.llm_client import call_openrouter


logger = logging.getLogger(__name__)


# ─── Module exceptions ──────────────────────────────────────────────────────

class RateLimitExhausted(Exception):
    """Raised when the LLM provider rate-limits the request and the
    cascading model fallback chain has been exhausted.

    Surfaces upward to the API layer (HTTP 429).
    """


# ─── KB sub-prompt loader ───────────────────────────────────────────────────

_STAGE_PATTERN_TMPL = r"\[{stage}\]\s*\n(.+?)(?=\n---\s*\n\[|\Z)"


def _load_subprompt(stage: str) -> str:
    """Return the system prompt for a specific stage of the engine.

    Parses ``backend/kb/agents/hypothesis_agent.md`` by ``[STAGE]`` markers.
    Loads the KB file via the existing mtime-cached :func:`load_kb` so edits
    are picked up without restart.

    Args:
        stage: One of ``"DECOMPOSER"``, ``"GENERATOR"``, ``"MECE_AUDITOR"``.

    Raises:
        ValueError: If the requested marker is not found in the KB file.
    """
    raw = load_kb("agents/hypothesis_agent.md")
    pattern = _STAGE_PATTERN_TMPL.format(stage=re.escape(stage))
    match = re.search(pattern, raw, re.DOTALL)
    if not match:
        raise ValueError(
            f"Stage marker '[{stage}]' not found in agents/hypothesis_agent.md"
        )
    return match.group(1).strip()


# ─── Defensive LLM wrapper ──────────────────────────────────────────────────

def _safe_call_llm(
    system_prompt: str,
    user_prompt: str,
    *,
    expect_json: bool = True,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Any:
    """Call ``call_openrouter`` and convert exhausted rate limits into
    :class:`RateLimitExhausted`.

    On malformed/non-dict JSON or any other LLM-level failure, returns an
    empty dict (when ``expect_json=True``) or empty string. Callers treat the
    empty default as a soft failure that ultimately fails hard validation,
    triggering retry.
    """
    try:
        result = call_openrouter(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            chat_history=chat_history,
            expect_json=expect_json,
        )
    except Exception as exc:  # noqa: BLE001 — provider-level errors are opaque
        msg = str(exc)
        if "exhausted" in msg.lower() or "429" in msg or "GEMINI_CAPPED" in msg:
            raise RateLimitExhausted(
                f"LLM provider rate-limited and fallback chain exhausted: {msg}"
            ) from exc
        logger.warning("LLM call failed: %s; returning empty default", msg)
        return {} if expect_json else ""

    if expect_json and not isinstance(result, dict):
        logger.warning(
            "LLM returned non-dict despite expect_json=True; got %s",
            type(result).__name__,
        )
        return {}
    return result


# ─── Stage 1: Decomposer ────────────────────────────────────────────────────

def _decompose_intent(
    intent: str,
    pillar_extractions: Optional[Dict[str, Any]],
    pillar_scores: Optional[List[Dict[str, Any]]],
    context_document: Optional[str],
    template: Optional[str],
    chat_history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, Any]]:
    """Split the locked intent into one or more discrete core problems.

    Returns a list of normalized core_problem dicts with deterministic
    ``cp_NNN`` IDs, defaulted ``priority``, and ``decomposed_from_intent``
    forced to ``True``. Returns an empty list when the LLM produces malformed
    output (caller treats as invalid → triggers retry).
    """
    system_prompt = _load_subprompt("DECOMPOSER")

    extractions_block = ""
    if pillar_extractions:
        extractions_block = (
            "\n\n### Pillar Extractions\n```json\n"
            + json.dumps(pillar_extractions, indent=2)
            + "\n```"
        )

    scores_block = ""
    if pillar_scores:
        scores_block = "\n\n### Pillar Scores\n" + "\n".join(
            f"- {p.get('label', '?')}: {p.get('score', 0)}/100" for p in pillar_scores
        )

    context_block = ""
    if context_document:
        truncated = context_document[:3000] + (
            "..." if len(context_document) > 3000 else ""
        )
        context_block = f"\n\n### Uploaded Research Context\n```\n{truncated}\n```"

    template_block = ""
    if template and template != "none":
        template_block = f"\n\n**Study Archetype:** {template}"

    user_prompt = (
        f"## Locked Research Intent\n{intent}"
        f"{template_block}{scores_block}{extractions_block}{context_block}\n\n"
        "Decompose this intent into one or more core problems. Return strict JSON."
    )

    result = _safe_call_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        expect_json=True,
        chat_history=chat_history,
    )

    raw_problems = result.get("core_problems", []) if isinstance(result, dict) else []
    if not isinstance(raw_problems, list) or not raw_problems:
        return []

    normalized: List[Dict[str, Any]] = []
    for i, p in enumerate(raw_problems, start=1):
        if not isinstance(p, dict) or not p.get("statement"):
            continue
        priority = p.get("priority", "primary")
        if priority not in {"primary", "secondary"}:
            priority = "primary"
        normalized.append(
            {
                "id": f"cp_{i:03d}",
                "statement": str(p.get("statement", "")).strip(),
                "priority": priority,
                "decomposed_from_intent": True,
                "decomposition_rationale": p.get("decomposition_rationale", ""),
            }
        )

    return normalized


# ─── Stage 2: Generator ─────────────────────────────────────────────────────

def _generate_for_problem(
    core_problem: Dict[str, Any],
    mode: str,
    intent: str,
    pillar_extractions: Optional[Dict[str, Any]],
    context_document: Optional[str],
    template: Optional[str],
    chat_history: Optional[List[Dict[str, str]]],
) -> Dict[str, Any]:
    """Run the generator once for a single core problem.

    When ``mode == "naive"``, all anchoring context is forced to ``None``
    regardless of caller-supplied values (de-anchored generation per
    Requirement 3.1).
    """
    if mode not in {"context_aware", "naive"}:
        raise ValueError(
            f"_generate_for_problem requires mode in {{'context_aware','naive'}}; "
            f"got {mode!r}"
        )

    # CRITICAL: enforce de-anchoring for the naive pass.
    if mode == "naive":
        pillar_extractions = None
        context_document = None
        template = None
        chat_history = None

    system_prompt = _load_subprompt("GENERATOR")

    user_prompt = (
        f"## Core Problem to Hypothesize\n"
        f"**ID:** {core_problem['id']}\n"
        f"**Statement:** {core_problem['statement']}\n"
        f"**Priority:** {core_problem.get('priority', 'primary')}\n\n"
        f"## Mode\nGENERATION_MODE: {mode}\n"
        f"Set `generation_source: \"{mode}\"` on every hypothesis you originate.\n"
    )

    if mode == "context_aware":
        template_block = (
            f"\n\n**Study Archetype:** {template}" if template and template != "none" else ""
        )
        extractions_block = ""
        if pillar_extractions:
            extractions_block = (
                "\n\n### Pillar Extractions\n```json\n"
                + json.dumps(pillar_extractions, indent=2)
                + "\n```"
            )
        context_block = ""
        if context_document:
            truncated = context_document[:3000] + (
                "..." if len(context_document) > 3000 else ""
            )
            context_block = f"\n\n### Uploaded Context\n```\n{truncated}\n```"
        user_prompt += (
            f"\n## Research Intent\n{intent}"
            f"{template_block}{extractions_block}{context_block}"
        )
    else:
        user_prompt += (
            f"\n## Research Intent (Bare Intent Only — De-Anchored Pass)\n{intent}\n\n"
            "You are deliberately running without pillar context, chat history, or "
            "template guidance. Generate hypotheses purely from the bare intent — "
            "surface dimensions and angles the context-aware pass might have missed."
        )

    user_prompt += "\n\nReturn strict JSON. No markdown fences."

    result = _safe_call_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        expect_json=True,
        chat_history=chat_history,
    )

    if not isinstance(result, dict):
        return {"hypotheses": [], "dimensions_covered": []}

    hypotheses = result.get("hypotheses", []) if isinstance(result.get("hypotheses"), list) else []
    dimensions = result.get("dimensions_covered", []) if isinstance(result.get("dimensions_covered"), list) else []

    # Stamp generation_source if missing.
    for h in hypotheses:
        if isinstance(h, dict):
            h.setdefault("generation_source", mode)

    return {"hypotheses": hypotheses, "dimensions_covered": dimensions}


# ─── Stage 2 helpers ────────────────────────────────────────────────────────

_NO_OPPOSITE_SENTENCE = (
    "No meaningful opposite exists for this hypothesis — it stands alone."
)


def _has_no_opposite_phrase(rationale: str) -> bool:
    """Return True iff the rationale already justifies the absent pair.

    Matches the two phrases recognized by ``HypothesisModel`` and Hard
    Validation Rule 2 (Section 5.2): ``"no meaningful opposite"`` and
    ``"no useful contrarian"``.
    """
    lowered = (rationale or "").lower()
    return (
        "no meaningful opposite" in lowered
        or "no useful contrarian" in lowered
    )


def _append_no_opposite_sentence(rationale: str) -> str:
    """Idempotently append the no-opposite justification to a rationale."""
    if _has_no_opposite_phrase(rationale):
        return rationale
    base = (rationale or "").strip()
    if not base:
        return _NO_OPPOSITE_SENTENCE
    return f"{base} {_NO_OPPOSITE_SENTENCE}"


def _merge_passes(
    context_result: Dict[str, Any],
    naive_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Concatenate context-aware hypotheses with naive hypotheses whose
    ``mece_cluster_id`` is not already present in the context-aware set.

    Pure function. Preserves every context-aware hypothesis untouched. Unions
    the ``dimensions_covered`` lists from both inputs.
    """
    ctx_hyps = list(context_result.get("hypotheses", []) or [])
    naive_hyps = list(naive_result.get("hypotheses", []) or [])

    seen_clusters = {
        h.get("mece_cluster_id") for h in ctx_hyps if isinstance(h, dict) and h.get("mece_cluster_id")
    }
    merged: List[Dict[str, Any]] = list(ctx_hyps)
    for h in naive_hyps:
        if not isinstance(h, dict):
            continue
        cluster = h.get("mece_cluster_id")
        if cluster and cluster in seen_clusters:
            continue
        merged.append(h)
        if cluster:
            seen_clusters.add(cluster)

    dimensions = set(context_result.get("dimensions_covered", []) or [])
    dimensions.update(naive_result.get("dimensions_covered", []) or [])

    return {
        "hypotheses": merged,
        "dimensions_covered": sorted(dimensions),
    }


_CLUSTER_SUFFIX_RE = re.compile(
    r"_(aligned|misalignment|misaligned|positive|negative|high|low|true|false)$"
)


def _generate_contrarian_pairs(
    hypotheses: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Assign deterministic ``h_NNN`` IDs and cross-link contrarian pairs.

    1. Assigns deterministic IDs ``h_001``, ``h_002``, ... by insertion order.
    2. For any pair of hypotheses sharing a cluster prefix that the LLM did
       not link, sets ``contrarian_pair_id`` mutually.
    3. For unpaired hypotheses, sets ``contrarian_pair_id=None`` and
       idempotently appends the no-opposite rationale sentence.

    Pure function — no LLM call. Returns the same list, mutated in place.
    """
    # 1. Deterministic IDs
    for i, h in enumerate(hypotheses, start=1):
        h["id"] = f"h_{i:03d}"

    # 2. Auto-link by cluster prefix when LLM omitted contrarian_pair_id.
    by_prefix: Dict[str, List[Dict[str, Any]]] = {}
    for h in hypotheses:
        cluster = h.get("mece_cluster_id") or ""
        if not cluster:
            continue
        prefix = _CLUSTER_SUFFIX_RE.sub("", cluster)
        by_prefix.setdefault(prefix, []).append(h)

    for prefix, group in by_prefix.items():
        if len(group) != 2:
            continue
        a, b = group
        a_pair = a.get("contrarian_pair_id")
        b_pair = b.get("contrarian_pair_id")
        if not a_pair and not b_pair:
            a["contrarian_pair_id"] = b["id"]
            b["contrarian_pair_id"] = a["id"]

    # 3. Justify any unpaired hypotheses idempotently.
    for h in hypotheses:
        if h.get("contrarian_pair_id"):
            continue
        h["contrarian_pair_id"] = None
        h["rationale"] = _append_no_opposite_sentence(h.get("rationale", ""))

    return hypotheses


_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _cap_hypotheses(hypotheses: List[Dict[str, Any]], cap: int) -> List[Dict[str, Any]]:
    """Trim the hypothesis list to at most ``cap`` entries.

    Selection strategy:
      1. Sort by investigation_priority (high > medium > low).
      2. Walk the sorted list and include each hypothesis. When a hypothesis
         is included, also include its contrarian pair (if not already in).
      3. Stop when the cap is reached.

    This ensures contrarian pairs are never split — both members survive or
    neither does. The result is re-numbered with fresh ``h_NNN`` IDs.
    """
    if len(hypotheses) <= cap:
        return hypotheses

    by_id = {h["id"]: h for h in hypotheses}
    sorted_hyps = sorted(
        hypotheses,
        key=lambda h: _PRIORITY_RANK.get(h.get("investigation_priority", "low"), 2),
    )

    kept_ids: set = set()
    kept: List[Dict[str, Any]] = []

    for h in sorted_hyps:
        if len(kept) >= cap:
            break
        if h["id"] in kept_ids:
            continue
        kept.append(h)
        kept_ids.add(h["id"])
        # Pull in the contrarian pair to keep pairs intact.
        pair_id = h.get("contrarian_pair_id")
        if pair_id and pair_id not in kept_ids and pair_id in by_id:
            if len(kept) < cap:
                kept.append(by_id[pair_id])
                kept_ids.add(pair_id)

    # Re-number IDs contiguously.
    id_remap: Dict[str, str] = {}
    for i, h in enumerate(kept, start=1):
        old_id = h["id"]
        new_id = f"h_{i:03d}" if not old_id.startswith("h_merged_") else old_id
        id_remap[old_id] = new_id

    for h in kept:
        h["id"] = id_remap[h["id"]]
        pair_id = h.get("contrarian_pair_id")
        if pair_id and pair_id in id_remap:
            h["contrarian_pair_id"] = id_remap[pair_id]
        elif pair_id and pair_id not in id_remap:
            # Pair was trimmed — null out and justify.
            h["contrarian_pair_id"] = None
            h["rationale"] = _append_no_opposite_sentence(h.get("rationale", ""))

    logger.info("Capped hypotheses from %d to %d", len(hypotheses), len(kept))
    return kept


# ─── Stage 3: MECE Auditor ──────────────────────────────────────────────────

def _run_mece_audit(hypotheses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Run a single MECE audit pass with FRESH context (no chat history).

    Sends only ``id + statement + dimension + mece_cluster_id +
    contrarian_pair_id`` per hypothesis to keep the prompt small. Returns the
    raw audit dict. On malformed JSON returns
    ``{"merges": [], "audit_passed": False, "audit_notes": ""}``.
    """
    system_prompt = _load_subprompt("MECE_AUDITOR")

    summary = [
        {
            "id": h.get("id", "?"),
            "statement": h.get("statement", ""),
            "dimension": h.get("dimension", ""),
            "mece_cluster_id": h.get("mece_cluster_id", ""),
            "contrarian_pair_id": h.get("contrarian_pair_id"),
        }
        for h in hypotheses
    ]

    user_prompt = (
        "## Hypothesis Set for MECE Audit\n```json\n"
        + json.dumps(summary, indent=2)
        + "\n```\n\nAudit for semantic overlap. Return strict JSON."
    )

    # FRESH context — chat_history is always None for the auditor.
    result = _safe_call_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        expect_json=True,
        chat_history=None,
    )

    if not isinstance(result, dict):
        return {"merges": [], "audit_passed": False, "audit_notes": ""}

    merges = result.get("merges", []) if isinstance(result.get("merges"), list) else []
    audit_passed = bool(result.get("audit_passed", False))
    audit_notes = result.get("audit_notes", "")
    if not isinstance(audit_notes, str):
        audit_notes = str(audit_notes)

    return {
        "merges": merges,
        "audit_passed": audit_passed,
        "audit_notes": audit_notes,
    }


def _apply_merges(
    hypotheses: List[Dict[str, Any]],
    directives: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Apply merge directives to the hypothesis list.

    Pure function:
    - Removes hypotheses cited by any merge directive.
    - Inserts merged replacements with deterministic IDs
      ``h_merged_<sha1prefix>`` (8 hex chars) derived from the sorted
      ``merge_ids``.
    - Re-numbers remaining ``h_NNN`` IDs contiguously while preserving merged
      IDs.
    - For any hypothesis whose ``contrarian_pair_id`` referenced a removed
      hypothesis, sets the field to ``None`` and appends the no-opposite
      rationale sentence.
    """
    by_id: Dict[str, Dict[str, Any]] = {h["id"]: h for h in hypotheses if "id" in h}

    to_remove: set[str] = set()
    new_merged: List[Dict[str, Any]] = []

    for d in directives or []:
        if not isinstance(d, dict):
            continue
        ids = d.get("merge_ids", [])
        if not isinstance(ids, list) or len(ids) < 2:
            continue
        valid_ids = [i for i in ids if i in by_id]
        if len(valid_ids) < 2:
            continue
        to_remove.update(valid_ids)

        seed = "|".join(sorted(valid_ids))
        merged_id = "h_merged_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:8]

        first = by_id[valid_ids[0]]
        new_merged.append(
            {
                "id": merged_id,
                "statement": d.get("merged_statement", first.get("statement", "")),
                "dimension": d.get("merged_dimension", first.get("dimension", "")),
                "force_assignment": d.get(
                    "merged_force_assignment", first.get("force_assignment", "")
                ),
                "mece_cluster_id": d.get(
                    "merged_mece_cluster_id", first.get("mece_cluster_id", "")
                ),
                "expected_signals": list(
                    d.get("merged_expected_signals", first.get("expected_signals", []))
                ),
                "expected_counter_signals": list(
                    d.get(
                        "merged_expected_counter_signals",
                        first.get("expected_counter_signals", []),
                    )
                ),
                "contrarian_pair_id": None,
                "investigation_priority": d.get(
                    "merged_investigation_priority",
                    first.get("investigation_priority", "medium"),
                ),
                "generation_source": "context_aware",
                "rationale": d.get("merged_rationale", first.get("rationale", "")),
                # Preserve the parent core problem of one of the originals so
                # the orchestrator can re-group the merged hypothesis.
                "_cp_id": first.get("_cp_id"),
            }
        )

    survivors: List[Dict[str, Any]] = [h for h in hypotheses if h["id"] not in to_remove]
    combined: List[Dict[str, Any]] = survivors + new_merged

    # Re-link contrarian references that pointed at removed hypotheses.
    surviving_ids = {h["id"] for h in combined}
    for h in combined:
        pair_id = h.get("contrarian_pair_id")
        if pair_id and pair_id not in surviving_ids:
            h["contrarian_pair_id"] = None
            h["rationale"] = _append_no_opposite_sentence(h.get("rationale", ""))

    # Re-number ``h_NNN`` IDs contiguously, preserving ``h_merged_*`` IDs.
    id_remap: Dict[str, str] = {}
    counter = 1
    for h in combined:
        if h["id"].startswith("h_merged_"):
            id_remap[h["id"]] = h["id"]
            continue
        new_id = f"h_{counter:03d}"
        id_remap[h["id"]] = new_id
        counter += 1

    for h in combined:
        old_id = h["id"]
        h["id"] = id_remap[old_id]
        pair_id = h.get("contrarian_pair_id")
        if pair_id and pair_id in id_remap:
            h["contrarian_pair_id"] = id_remap[pair_id]

    return combined


# ─── Validation ─────────────────────────────────────────────────────────────

def _validate_manifest(manifest: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Apply Section 5.2 hard validation rules and Pydantic structural checks.

    Returns ``(is_valid, errors)``. Caller decides retry vs. surface-to-API.
    """
    errors: List[str] = []

    # ── Structural validation via Pydantic ──
    try:
        HypothesisManifestModel.model_validate(manifest)
    except ValidationError as ve:
        for err in ve.errors():
            loc = ".".join(str(part) for part in err.get("loc", ()))
            msg = err.get("msg", "validation error")
            errors.append(f"schema:{loc}: {msg}" if loc else f"schema: {msg}")

    # ── Hard validation rules (Section 5.2) ──
    core_problems = manifest.get("core_problems", []) or []

    # Rule 4: total_core_problems > 0
    if not core_problems:
        errors.append("rule_4: manifest has zero core_problems")

    # Walk every hypothesis and collect cluster-grouping data per dimension.
    cluster_groups: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    all_hyps_by_id: Dict[str, Dict[str, Any]] = {}

    for cp in core_problems:
        if not isinstance(cp, dict):
            continue
        cp_id = cp.get("id", "?")
        hyps = cp.get("hypotheses", []) or []

        # Rule 5: each core_problem has ≥1 hypothesis
        if not hyps:
            errors.append(f"rule_5: core_problem {cp_id} has zero hypotheses")
            continue

        for h in hyps:
            if not isinstance(h, dict):
                continue
            hid = h.get("id", "?")
            all_hyps_by_id[hid] = h

            # Rule 1: ≥3 expected_signals
            if len(h.get("expected_signals", []) or []) < MIN_EXPECTED_SIGNALS:
                errors.append(
                    f"rule_1: hypothesis {hid} has fewer than {MIN_EXPECTED_SIGNALS} "
                    "expected_signals"
                )

            # Rule 2: null contrarian_pair_id requires rationale justification
            pair_id = h.get("contrarian_pair_id")
            if pair_id is None:
                if not _has_no_opposite_phrase(h.get("rationale", "")):
                    errors.append(
                        f"rule_2: hypothesis {hid} has null contrarian_pair_id "
                        "without justification in rationale"
                    )

            cluster = h.get("mece_cluster_id")
            dim = h.get("dimension")
            if cluster and dim:
                cluster_groups.setdefault((dim, cluster), []).append(h)

    # Rule 3: hypotheses sharing (dim, cluster) must be each other's
    # contrarian pair (and only pairs of size 2 are valid).
    for (dim, cluster), members in cluster_groups.items():
        if len(members) < 2:
            continue
        if len(members) > 2:
            ids = [m.get("id", "?") for m in members]
            errors.append(
                f"rule_3: dim={dim} cluster={cluster} shared by {len(members)} "
                f"hypotheses ({ids}); maximum is 2 (a contrarian pair)"
            )
            continue
        a, b = members
        if a.get("contrarian_pair_id") != b.get("id") or b.get(
            "contrarian_pair_id"
        ) != a.get("id"):
            errors.append(
                f"rule_3: dim={dim} cluster={cluster} shared by "
                f"{a.get('id')} and {b.get('id')} without mutual contrarian linkage"
            )

    return (len(errors) == 0, errors)


# ─── Manifest assembly ──────────────────────────────────────────────────────

def _count_mutual_contrarian_pairs(hypotheses: List[Dict[str, Any]]) -> int:
    """Count hypothesis pairs that mutually reference each other."""
    by_id = {h["id"]: h for h in hypotheses if "id" in h}
    seen: set[frozenset] = set()
    for h in hypotheses:
        pair_id = h.get("contrarian_pair_id")
        if not pair_id:
            continue
        partner = by_id.get(pair_id)
        if partner is None:
            continue
        if partner.get("contrarian_pair_id") == h["id"]:
            seen.add(frozenset({h["id"], pair_id}))
    return len(seen)


def _assemble_manifest(
    intent: str,
    core_problems: List[Dict[str, Any]],
    hypotheses_per_cp: Dict[str, List[Dict[str, Any]]],
    dimensions_covered: List[str],
    audit_iterations: int,
    mece_audit_passed: bool,
    de_anchored_pass_count: int,
    validation_errors: Optional[List[str]] = None,
    audit_notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Assemble the final Hypothesis Manifest dict matching schema 1.0."""
    flat_hyps: List[Dict[str, Any]] = []
    for cp in core_problems:
        flat_hyps.extend(hypotheses_per_cp.get(cp["id"], []))

    metadata: Dict[str, Any] = {
        "total_core_problems": len(core_problems),
        "total_hypotheses": len(flat_hyps),
        "total_contrarian_pairs": _count_mutual_contrarian_pairs(flat_hyps),
        "generation_method": "ai_native_mece",
        "mece_audit_passed": bool(mece_audit_passed),
        "mece_audit_iterations": int(audit_iterations),
        "de_anchored_pass_count": int(de_anchored_pass_count),
        "dimensions_covered": sorted(set(dimensions_covered)),
    }
    if validation_errors:
        metadata["validation_errors"] = list(validation_errors)
    if audit_notes:
        metadata["audit_notes"] = list(audit_notes)

    manifest: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "intent": intent,
        "metadata": metadata,
        "core_problems": [
            {
                "id": cp["id"],
                "statement": cp["statement"],
                "priority": cp.get("priority", "primary"),
                "decomposed_from_intent": True,
                "hypothesis_count": len(hypotheses_per_cp.get(cp["id"], [])),
                "hypotheses": [
                    _strip_internal_fields(h)
                    for h in hypotheses_per_cp.get(cp["id"], [])
                ],
            }
            for cp in core_problems
        ],
    }
    return manifest


_INTERNAL_HYP_FIELDS = {"_cp_id"}


def _strip_internal_fields(hypothesis: Dict[str, Any]) -> Dict[str, Any]:
    """Return a shallow copy of the hypothesis without internal-only keys."""
    return {k: v for k, v in hypothesis.items() if k not in _INTERNAL_HYP_FIELDS}


# ─── Persistence ────────────────────────────────────────────────────────────

_MANIFEST_FILENAME = "Hypothesis_Manifest.json"
_LATEST_RUN_DIR = "latest_run_data"
_LATEST_RUN_FILENAME = "latest_hypothesis_manifest.json"


def _persist(manifest: Dict[str, Any]) -> None:
    """Write the manifest to ``Hypothesis_Manifest.json`` and
    ``latest_run_data/latest_hypothesis_manifest.json``.

    I/O failures are logged as warnings — the manifest is still returned to
    the caller per the Error Taxonomy in the design.
    """
    payload = json.dumps(manifest, indent=2)
    try:
        pathlib.Path(_MANIFEST_FILENAME).write_text(payload, encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to write %s: %s", _MANIFEST_FILENAME, exc)

    try:
        capture_dir = pathlib.Path(_LATEST_RUN_DIR)
        capture_dir.mkdir(exist_ok=True)
        (capture_dir / _LATEST_RUN_FILENAME).write_text(payload, encoding="utf-8")
    except OSError as exc:
        logger.warning(
            "Failed to write %s/%s: %s", _LATEST_RUN_DIR, _LATEST_RUN_FILENAME, exc
        )


# ─── Public orchestrator ────────────────────────────────────────────────────

def generate_hypothesis_manifest(
    intent: str,
    pillar_extractions: Optional[Dict[str, Any]] = None,
    pillar_scores: Optional[List[Dict[str, Any]]] = None,
    context_document: Optional[str] = None,
    template: Optional[str] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Orchestrate the full three-stage hypothesis generation pipeline.

    See ``design.md`` "Stage execution flow (algorithm pseudocode)" for the
    exact control flow. Stateless — no module-level mutable globals are
    touched. Persists to disk on every return path (success, partial, and
    validation-failure fallback).

    Returns a Hypothesis Manifest dict. When all retries are exhausted the
    last attempt's manifest is returned with ``metadata.validation_errors``
    populated and ``metadata.mece_audit_passed=False`` (the API layer maps
    this to HTTP 422).
    """
    last_manifest: Optional[Dict[str, Any]] = None
    last_errors: List[str] = []

    for attempt in range(1, MAX_GENERATION_RETRIES + 1):
        logger.info("hypothesis engine attempt %d/%d", attempt, MAX_GENERATION_RETRIES)

        # ── Stage 1: Decompose ──
        core_problems = _decompose_intent(
            intent=intent,
            pillar_extractions=pillar_extractions,
            pillar_scores=pillar_scores,
            context_document=context_document,
            template=template,
            chat_history=chat_history,
        )
        if not core_problems:
            last_errors = ["rule_4: decomposer returned zero core_problems"]
            logger.info("attempt %d: decomposer returned 0 problems; retrying", attempt)
            continue

        # ── Stage 2: Generate per problem (PARALLEL via ThreadPoolExecutor) ──
        # Each core problem is dispatched to its own thread so LLM calls
        # run concurrently, cutting wall-clock time from N*T → ~T.
        all_hyps: List[Dict[str, Any]] = []
        dimensions_covered: set[str] = set()
        de_anchored_pass_count = 0

        def _process_single_problem(cp: Dict[str, Any]) -> Dict[str, Any]:
            """Generate hypotheses for one core problem (runs in a thread)."""
            ctx_result = _generate_for_problem(
                core_problem=cp,
                mode="context_aware",
                intent=intent,
                pillar_extractions=pillar_extractions,
                context_document=context_document,
                template=template,
                chat_history=chat_history,
            )

            ctx_hyp_count = len(ctx_result.get("hypotheses", []) or [])
            did_naive = False
            if ctx_hyp_count < 6:
                naive_result = _generate_for_problem(
                    core_problem=cp,
                    mode="naive",
                    intent=intent,
                    pillar_extractions=None,
                    context_document=None,
                    template=None,
                    chat_history=None,
                )
                did_naive = True
                merged = _merge_passes(ctx_result, naive_result)
            else:
                merged = ctx_result
                merged.setdefault("dimensions_covered", [])

            for h in merged.get("hypotheses", []):
                h["_cp_id"] = cp["id"]

            return {
                "hypotheses": merged.get("hypotheses", []),
                "dimensions": merged.get("dimensions_covered", []),
                "did_naive": did_naive,
            }

        # Fire all core problems in parallel (max 4 threads to respect API limits)
        with ThreadPoolExecutor(max_workers=min(4, len(core_problems))) as executor:
            future_map = {
                executor.submit(_process_single_problem, cp): cp
                for cp in core_problems
            }
            for future in as_completed(future_map):
                cp = future_map[future]
                try:
                    result = future.result()
                    all_hyps.extend(result["hypotheses"])
                    dimensions_covered.update(result["dimensions"])
                    if result["did_naive"]:
                        de_anchored_pass_count += 1
                except Exception:
                    logger.warning(
                        "parallel generation failed for %s; skipping",
                        cp.get("id", "?"),
                        exc_info=True,
                    )

        # Assign deterministic IDs + cross-link contrarian pairs.
        all_hyps = _generate_contrarian_pairs(all_hyps)

        # ── Cap total hypotheses at MAX_HYPOTHESES ──
        # Keep the highest-priority hypotheses. Preserve contrarian pairs
        # together — if one member survives, its pair survives too.
        if len(all_hyps) > MAX_HYPOTHESES:
            all_hyps = _cap_hypotheses(all_hyps, MAX_HYPOTHESES)

        # ── Stage 3: MECE audit (up to MAX_MECE_AUDIT_ITERATIONS) ──
        mece_audit_passed = True
        mece_iterations = 0
        audit_notes_log: List[str] = []

        for iteration in range(1, MAX_MECE_AUDIT_ITERATIONS + 1):
            mece_iterations = iteration
            audit = _run_mece_audit(all_hyps)
            merges = audit.get("merges", []) or []
            passed = bool(audit.get("audit_passed", False))
            notes = audit.get("audit_notes", "") or ""
            audit_notes_log.append(f"iter {iteration}: {notes}")

            if not merges:
                mece_audit_passed = passed if iteration == 1 else True
                break

            all_hyps = _apply_merges(all_hyps, merges)

            if iteration == MAX_MECE_AUDIT_ITERATIONS:
                # Audit could not converge within the budget.
                mece_audit_passed = False

        # Re-group hypotheses under their parent core problems.
        hyps_by_cp: Dict[str, List[Dict[str, Any]]] = {cp["id"]: [] for cp in core_problems}
        fallback_cp_id = core_problems[0]["id"]
        for h in all_hyps:
            cp_id = h.get("_cp_id") or fallback_cp_id
            if cp_id not in hyps_by_cp:
                hyps_by_cp[cp_id] = []
            hyps_by_cp[cp_id].append(h)

        # Prune core problems that ended up with zero hypotheses to pass Pydantic validation
        core_problems = [cp for cp in core_problems if len(hyps_by_cp.get(cp["id"], [])) > 0]

        manifest = _assemble_manifest(
            intent=intent,
            core_problems=core_problems,
            hypotheses_per_cp=hyps_by_cp,
            dimensions_covered=sorted(dimensions_covered),
            audit_iterations=mece_iterations,
            mece_audit_passed=mece_audit_passed,
            de_anchored_pass_count=de_anchored_pass_count,
            audit_notes=audit_notes_log,
        )

        is_valid, errors = _validate_manifest(manifest)
        if is_valid:
            logger.info("hypothesis engine produced valid manifest on attempt %d", attempt)
            _persist(manifest)
            return manifest

        last_manifest = manifest
        last_errors = errors
        logger.info(
            "attempt %d produced invalid manifest with %d errors; retrying",
            attempt,
            len(errors),
        )

    # ── Retries exhausted — return last manifest with validation errors. ──
    logger.warning(
        "hypothesis engine exhausted %d retries; returning fallback manifest",
        MAX_GENERATION_RETRIES,
    )
    if last_manifest is None:
        # Decomposer returned zero problems on every attempt — synthesize a
        # minimal fallback so the caller still receives a structurally
        # complete manifest with validation_errors populated.
        last_manifest = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "intent": intent,
            "metadata": {
                "total_core_problems": 0,
                "total_hypotheses": 0,
                "total_contrarian_pairs": 0,
                "generation_method": "ai_native_mece",
                "mece_audit_passed": False,
                "mece_audit_iterations": 0,
                "de_anchored_pass_count": 0,
                "dimensions_covered": [],
            },
            "core_problems": [],
        }

    last_manifest.setdefault("metadata", {})
    last_manifest["metadata"]["validation_errors"] = list(last_errors)
    last_manifest["metadata"]["mece_audit_passed"] = False
    _persist(last_manifest)
    return last_manifest

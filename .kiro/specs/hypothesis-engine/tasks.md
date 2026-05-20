# Implementation Plan: Hypothesis Engine

## Overview

This plan implements the Hypothesis Engine across five independently shippable sprints, following Section 16 of `UPDATE_HYPOTHESIS_GENERATION.md`. Each sprint hides behind the optional `hypothesis_manifest` parameter on downstream endpoints, so partial deployments are safe.

- **Sprint 1** stands up the engine, KB sub-prompts, the new API endpoint, and disk persistence — fully testable in isolation.
- **Sprint 2** adds the `hypothesis_generation` phase and `HypothesisReview.tsx` so the manifest is reviewable end-to-end while downstream stages remain on legacy logic.
- **Sprint 3** wires Brief and Link Farming Manifest to consume the manifest.
- **Sprint 4** wires Category Graph, Intelligence Map, and the dev-bypass `latest-run` endpoint.
- **Sprint 5** retires hypothesis elicitation from Intake Pillar 3 (user-visible behavior change shipped last).
- **Final acceptance** runs the cross-stage ID propagation E2E test and the 20-intent benchmark.

The 24 correctness properties from `design.md` are turned into property-based test sub-tasks placed adjacent to the code each property validates. Implementation references absolute paths under `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/`. Backend uses Python (`pytest` + `hypothesis`), frontend uses TypeScript (`vitest --run` + `fast-check`).

## Tasks

---

### Sprint 1 — Engine + Schema

- [x] 1. Set up Hypothesis Engine foundation
  - [x] 1.1 Define Pydantic schema models and module constants in `hypothesis_engine.py`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/services/hypothesis_engine.py` (new)
    - Define `SCHEMA_VERSION`, `MIN_EXPECTED_SIGNALS=3`, `MAX_MECE_AUDIT_ITERATIONS=3`, `MAX_GENERATION_RETRIES=3`, `STRUCTURAL_DIMENSIONS` (10 values), `VALID_FORCES`, `VALID_PRIORITIES`, `VALID_GEN_SOURCES`
    - Define `Literal` types and Pydantic models: `HypothesisModel`, `CoreProblemModel`, `ManifestMetadataModel`, `HypothesisManifestModel` per Data Models section of design
    - _Design: Components and Interfaces → Backend Service; Data Models → Pydantic Schema_
    - _Requirements: 1.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 1.2 Create `hypothesis_agent.md` knowledge base file with three sub-prompts
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/hypothesis_agent.md` (new)
    - Sections delimited by `[DECOMPOSER]`, `[GENERATOR]`, `[MECE_AUDITOR]` markers separated by `---`
    - GENERATOR section must enumerate the 10 `STRUCTURAL_DIMENSIONS`, require `≥3 expected_signals`, require contrarian pair generation, require `generation_source` to follow caller's `mode`
    - MECE_AUDITOR section must instruct the LLM not to merge declared contrarian pairs and to return `merges=[]` when no overlap exists
    - Reference prototype at `.claude/worktrees/epic-noyce-a6817c/backend/kb/agents/hypothesis_agent.md`
    - _Design: Backend KB section_
    - _Requirements: 8.1, 8.3_

  - [x] 1.3 Add `FORCE_SLUGS` bidirectional mapping and `force_label()` helper
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/services/force_taxonomy.py` (modified)
    - Append the `FORCE_SLUGS` dict (Title Case → snake_case for the five Strategic Forces), `SLUG_TO_FORCE` reverse map, and `force_label(slug)` function
    - _Design: Force Taxonomy Mapping section_
    - _Requirements: 3.7_

- [x] 2. Implement Hypothesis Engine pipeline
  - [x] 2.1 Implement engine helpers and the `generate_hypothesis_manifest` orchestrator
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/services/hypothesis_engine.py` (modified)
    - Implement private helpers: `_load_subprompt`, `_decompose_intent`, `_generate_for_problem` (with `mode ∈ {context_aware, naive}` enforcement of `chat_history=None, pillar_extractions=None, context_document=None, template=None` for naive mode), `_merge_passes`, `_generate_contrarian_pairs`, `_run_mece_audit`, `_apply_merges`, `_validate_manifest`, `_safe_call_llm`, `_assemble_manifest`, `_persist`
    - Implement the public `generate_hypothesis_manifest` per the algorithm pseudocode in the design (3 retries, 3 audit iterations, fallback manifest with `validation_errors` populated when retry budget exhausted)
    - Persist to `backend/Hypothesis_Manifest.json` and `backend/latest_run_data/latest_hypothesis_manifest.json` on success
    - All LLM calls go through the existing `call_openrouter` (raise `RateLimitExhausted` upward)
    - _Design: Backend Service Stage execution flow + Internal Engine Topology + Error Handling_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.2_

  - [ ]* 2.2 Property test for KB sub-prompt loader
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_kb_subprompt_loader.py` (new)
    - **Property 24: KB sub-prompt loader** — for each stage in `{DECOMPOSER, GENERATOR, MECE_AUDITOR}`, `_load_subprompt(stage)` returns non-empty content that does not contain the other two stage markers literally
    - Use `hypothesis` with `max_examples=100`
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 2.3 Property test for manifest shape invariant
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_manifest_shape.py` (new)
    - **Property 1: Manifest shape invariant** — for any input that produces a manifest, `schema_version=="1.0"`, `generated_at` parses as ISO 8601, all required keys present at every level, every enum field within its allowed value set
    - Mock `call_openrouter` to return arbitrary-but-well-formed payloads via composite Hypothesis strategies
    - **Validates: Requirements 1.1, 3.3, 3.4, 3.7, 3.9, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

  - [ ]* 2.4 Property test for hard validation rules
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_hard_validation.py` (new)
    - **Property 2: Hard validation rules** — `_validate_manifest(M)` returns `(False, errors)` if and only if at least one of the five rules is violated; otherwise returns `(True, [])`
    - Use `@composite` strategies with `force_invalid: bool` flag injecting one of the five violations
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [ ]* 2.5 Property test for contrarian pair invariant
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_contrarian_pair.py` (new)
    - **Property 3: Contrarian pair invariant** — for every hypothesis `h` in a valid manifest, either (a) `h.contrarian_pair_id` references a sibling `p` with `p.contrarian_pair_id == h.id` and matching `dimension`, OR (b) `h.contrarian_pair_id is None` and `h.rationale` (case-insensitive) contains "no meaningful opposite" or "no useful contrarian"
    - **Validates: Requirements 3.5, 3.6**

  - [ ]* 2.6 Property test for stage execution invariant
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_stage_execution.py` (new)
    - **Property 4: Stage execution invariant** — for `N` core problems and `K` MECE iterations, `call_openrouter` is invoked exactly `1 + 2N + K` times in the order DECOMPOSER → 2N×GENERATOR (alternating context_aware/naive) → K×MECE_AUDITOR; naive GENERATOR call receives `chat_history=None`; MECE_AUDITOR call receives `chat_history=None`
    - Mock `call_openrouter` and inspect call args via `mock.call_args_list`
    - **Validates: Requirements 1.2, 2.1, 3.1, 4.1**

  - [ ]* 2.7 Property test for engine statelessness
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_statelessness.py` (new)
    - **Property 5: Engine statelessness** — for any two random input tuples `T1`, `T2`, the set of module attributes of `hypothesis_engine` (excluding constants and functions) is byte-identical before and after each invocation
    - Snapshot module `__dict__` filtered to non-callable, non-uppercase keys
    - **Validates: Requirement 1.3**

  - [ ]* 2.8 Property test for disk persistence round-trip
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_persistence.py` (new)
    - **Property 6: Disk persistence round-trip** — after a successful invocation returning manifest `M`, both `Hypothesis_Manifest.json` and `latest_run_data/latest_hypothesis_manifest.json` exist and `json.loads(file_contents) == M`
    - Use `tmp_path` fixture and `monkeypatch.chdir(tmp_path)` for isolation
    - **Validates: Requirement 1.4**

  - [ ]* 2.9 Property test for decomposer normalization
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_decomposer.py` (new)
    - **Property 7: Decomposer normalization** — all decomposer output IDs match `^cp_\d{3,}$` and are unique, every entry has `priority ∈ {primary, secondary}` (defaulted when missing), every entry has `decomposed_from_intent == True`
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 2.10 Property test for merge passes dedupe
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_merge_passes.py` (new)
    - **Property 8: Merge passes dedupe** — all `ctx_result` hypotheses preserved; a `naive_result` hypothesis appears in the merge iff its `mece_cluster_id` does not collide with any cluster from `ctx_result`; `dimensions_covered` is the union
    - **Validates: Requirement 3.2**

  - [ ]* 2.11 Property test for `apply_merges` length invariant
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_apply_merges.py` (new)
    - **Property 9: `apply_merges` length invariant** — `|H'| == |H| - sum(|d.merge_ids|) + |D|`; merged statements present; merged-away IDs absent; all output IDs unique and pattern-conforming
    - **Validates: Requirement 4.4**

  - [ ]* 2.12 Property test for MECE iterations counter
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_mece_iterations.py` (new)
    - **Property 10: MECE iterations counter** — for an audit sequence of `K` responses (first `K-1` non-empty, `K`-th empty), `metadata.mece_audit_iterations == K`; when all `MAX_MECE_AUDIT_ITERATIONS` return non-empty, `mece_audit_passed=False`
    - **Validates: Requirements 4.5, 4.6, 4.7**

  - [ ]* 2.13 Property test for regeneration retry bound
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_property_regen_retry.py` (new)
    - **Property 11: Regeneration retry bound** — after `i` invalid attempts then a valid `(i+1)`-th, the engine returns the `(i+1)`-th manifest; after `MAX_GENERATION_RETRIES` invalid attempts, returns the last with `validation_errors` populated and `mece_audit_passed=False`
    - **Validates: Requirements 6.6, 6.7**

- [x] 3. Wire the API endpoint
  - [x] 3.1 Implement `hypotheses` router and register in `main.py`
    - Files:
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/hypotheses.py` (new)
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/main.py` (modified)
    - Pydantic request model: `HypothesisRequest` with `intent`, optional `pillar_extractions`, `pillar_scores`, `context_document`, `template`, `chat_history`
    - `POST /api/generate-hypotheses` handler maps engine outcomes to HTTP status: 400 (empty intent), 422 (manifest with `validation_errors` populated), 429 (`RateLimitExhausted`), 500 (other exceptions, log full stack)
    - Response is the raw manifest dict (not wrapped in a Pydantic model) for forward compat with `schema_version` evolution
    - In `main.py`: `from api import hypotheses` and `app.include_router(hypotheses.router, prefix="/api")`
    - _Design: Backend API → `backend/api/hypotheses.py`_
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.2 Unit tests for API error mapping
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_hypotheses_api.py` (new)
    - Test 200 happy path (mock engine returning valid manifest)
    - Test 400 (empty/whitespace intent), 422 (manifest with `validation_errors`), 429 (`RateLimitExhausted` raised), 500 (generic exception)
    - Use FastAPI `TestClient` from `fastapi.testclient`
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.3 Smoke test of the endpoint via FastAPI TestClient
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_hypotheses_smoke.py` (new)
    - Replays one canned intent fixture through `POST /api/generate-hypotheses` end-to-end with `call_openrouter` mocked to return a valid manifest fixture, verifying status 200 and that `Hypothesis_Manifest.json` + `latest_run_data/latest_hypothesis_manifest.json` are written to disk (use `tmp_path`)
    - _Requirements: 1.4, 7.1, 7.2_

- [x] 4. Sprint 1 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

### Sprint 2 — Hypothesis Review Frontend

- [x] 5. Add TypeScript types and frontend state plumbing
  - [x] 5.1 Create `frontend/src/types/hypothesis.ts`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/types/hypothesis.ts` (new)
    - Mirror Pydantic schema as TS unions and interfaces: `StructuralDimension`, `StrategicForce`, `GenerationSource`, `InvestigationPriority`, `Hypothesis`, `CoreProblem`, `HypothesisManifestMetadata`, `HypothesisManifest`
    - _Design: Frontend → `types/hypothesis.ts`_
    - _Requirements: 5.6, 5.7, 9.4, 19.1_

- [x] 6. Build `HypothesisReview.tsx` and integrate the new phase
  - [x] 6.1 Implement `HypothesisReview.tsx`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/components/HypothesisReview.tsx` (new)
    - Props: `interactionPayload`, optional `initialManifest`, `onApprove`, `onReject`, `onBack`
    - On mount, hydrate from `initialManifest` if present, else read `sessionStorage["hypothesisManifest:" + sha256(intent)]`, else `POST /api/generate-hypotheses` with axios
    - Map status codes: 200 → render + cache to sessionStorage; 422 → render partial manifest with red-border on hypotheses cited in `validation_errors`; 429 → countdown retry; 4xx/5xx → error pane with Retry/Back
    - Counter row (sticky top): total core problems, total hypotheses, distinct MECE clusters, audit status
    - Conditional yellow banner when `metadata.mece_audit_passed === false`
    - Per-`core_problem` section with priority chip; hypotheses grouped via `groupHypothesesIntoPairRows()` so contrarian pairs render side-by-side and unpaired hypotheses span full width
    - Each card: ID, dimension chip, investigation_priority chip, full statement, force assignment, expected signal count, clickable contrarian-pair reference (`scrollIntoView`), collapsible rationale
    - Action bar: Proceed to Synthesis (default-highlighted), Add Hypothesis, Edit, Regen, Reject
    - Add Hypothesis modal: requires `dimension ∈ STRUCTURAL_DIMENSIONS`, `force_assignment ∈ VALID_FORCES`, `≥3 expected_signals`, and either a `contrarian_pair_id` selector or a non-empty no-opposite justification
    - Edit: inline edit on selected card with same validation as Add modal
    - Regen: clears the sessionStorage cache for current intent hash and re-POSTs
    - When `mece_audit_passed === false`, render dashed SVG connectors between flagged pairs (computed by `findFlaggedPairs(manifest)` — same dimension + same `mece_cluster_id` and not each other's contrarian pair); hover popover shows merge suggestion from `metadata.audit_notes`
    - _Design: Frontend → `HypothesisReview.tsx`; Layout + Action bar handlers + Pair connector behavior_
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.1, 11.2, 11.3, 20.1, 20.2_

  - [x] 6.2 Update `page.tsx` with phase machine, `phaseReducer`, and dev-bypass updates
    - Files:
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/app/page.tsx` (modified)
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/app/phaseReducer.ts` (new — extracted as a pure reducer for property testing)
    - Phase union: `'interaction' | 'hypothesis_generation' | 'synthesis' | 'discovery'`
    - State: add `hypothesisManifest: HypothesisManifest | null` (never wiped while phase ≥ `hypothesis_generation`); `interactionPayload` already preserved
    - Handlers: `handleInteractionComplete` transitions to `'hypothesis_generation'`; `handleHypothesisManifestApproved` sets manifest and transitions to `'synthesis'`; `handleHypothesisManifestRejected` sets `interactionPayload.isRefinement` + `rejectionContext` and transitions to `'interaction'` without wiping `hypothesisManifest`
    - JSX block rendering `<HypothesisReview>` when `phase === 'hypothesis_generation' && interactionPayload`
    - Pass `hypothesisManifest` prop to `<SynthesisDashboard>`
    - Dev-bypass row updates:
      - **NEW** "Skip to Hypothesis Review" button: `GET /api/latest-run` → hydrate `interactionPayload` (intent only) + `hypothesisManifest`, set phase to `'hypothesis_generation'`
      - "Skip to Synthesis": additionally hydrate `hypothesisManifest` from response (graceful `?? null` until Sprint 4 backend lands)
      - "Skip to Discovery": additionally hydrate `hypothesisManifest`
    - `phaseReducer.ts` exports a pure `phaseReducer(state, action)` covering INTERACTION_COMPLETE, HYPOTHESIS_APPROVED, HYPOTHESIS_REJECTED, SYNTHESIS_REJECTED actions; `page.tsx` consumes it via `useReducer`
    - _Design: Frontend → `page.tsx`; Phase State Machine state diagram; Dev Bypass Frontend Changes_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 18.1, 18.2, 18.3, 19.1_

  - [ ]* 6.3 Property test for `phaseReducer`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/phaseReducer.test.ts` (new)
    - **Property 18: Phase state machine invariants** — `interactionPayload` never null after first INTERACTION_COMPLETE; `hypothesisManifest` preserved across HYPOTHESIS_REJECTED and SYNTHESIS_REJECTED; pillar labels at indices `{0,1,3,4}` byte-identical to baseline; readiness label thresholds and labels byte-identical
    - Use `fast-check` with `numRuns: 100` over arbitrary action sequences
    - **Validates: Requirements 9.3, 9.4, 12.7, 12.8**

  - [ ]* 6.4 Property test for sessionStorage cache round-trip
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/HypothesisReview.cache.test.tsx` (new)
    - **Property 19: sessionStorage cache round-trip** — after a successful first fetch for intent `I`, `sessionStorage.getItem("hypothesisManifest:" + sha256(I))` deserializes to the same manifest; on a subsequent mount with same `I`, no network request is issued
    - Mock `axios.post`; verify `mock.calls.length === 0` on cache hit
    - **Validates: Requirements 20.1, 20.2**

  - [ ]* 6.5 Property test for counter row + action bar render
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/HypothesisReview.counters.test.tsx` (new)
    - **Property 20: Counter row + action bar render fidelity** — counter row displays `total_core_problems`, `total_hypotheses`, distinct cluster count, and audit status; action bar contains the four button labels; "Proceed to Synthesis" carries the default-highlight class
    - Use `@testing-library/react` + `fast-check`
    - **Validates: Requirements 10.2, 10.6, 10.7**

  - [ ]* 6.6 Property test for MECE failure visualization
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/HypothesisReview.banner.test.tsx` (new)
    - **Property 21: MECE failure visualization** — yellow banner DOM node present iff `metadata.mece_audit_passed === false`; number of dashed-connector SVG paths equals `|findFlaggedPairs(M)|`
    - **Validates: Requirements 11.1, 11.2**

  - [ ]* 6.7 Property test for Add modal validation
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/HypothesisReview.add_modal.test.tsx` (new)
    - **Property 22: Add-modal validation** — submit is rejected (no `setManifest` call) when `dimension ∉ STRUCTURAL_DIMENSIONS`, or `force_assignment ∉ VALID_FORCES`, or `expected_signals.length < 3`, or `contrarian_pair_id == null` with empty justification
    - **Validates: Requirement 10.9**

  - [ ]* 6.8 Component rendering tests for valid, invalid, and empty manifests
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/HypothesisReview.render.test.tsx` (new)
    - Three example tests: valid manifest renders cards and counters; manifest with `mece_audit_passed === false` renders banner + dashed connectors + popover on hover; empty/zero-hypothesis manifest renders an explanatory empty-state pane
    - _Requirements: 10.1, 10.2, 11.1, 11.2_

- [x] 7. Sprint 2 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

### Sprint 3 — Brief and Link Farming Manifest Consumption

- [x] 8. Wire Strategic Brief to consume the manifest
  - [x] 8.1 Modify `brief.py` to accept optional `hypothesis_manifest`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/brief.py` (modified)
    - Add `hypothesis_manifest: Optional[Dict[str, Any]] = None` to `BriefRequest`
    - When present, append a `"### Pre-Generated Hypothesis Manifest (RENDER, DO NOT REGENERATE)"` block (truncate JSON dump to 8000 chars) to the user prompt, with explicit "render exactly, one subsection per core_problem, contrarian pairs side-by-side"
    - When absent, retain current behavior unchanged
    - _Design: Backend API Modifications → `backend/api/brief.py`_
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 8.2 Update `brief_agent.md` to render the manifest as prose
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/brief_agent.md` (modified)
    - Add a dedicated section: "When a Hypothesis Manifest is supplied, the Hypotheses portion of the brief MUST render the manifest verbatim (preserving hypothesis IDs) as prose paragraphs grouped by core problem. Contrarian pairs render adjacent (same paragraph or back-to-back). Use the `rationale` field as the body. Do NOT generate alternative hypotheses inline."
    - _Design: Backend API Modifications → brief_agent.md edit_
    - _Requirements: 13.7_

- [x] 9. Wire Link Farming Manifest to consume the manifest
  - [x] 9.1 Modify `manifest.py` for search-net seeding and dimension routing
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/manifest.py` (modified)
    - Add `hypothesis_manifest: Optional[Dict[str, Any]] = None` to `ManifestRequest`
    - Implement helper `_build_hypothesis_block(manifest)` with `DIMENSION_PLATFORMS` mapping covering all 10 dimensions (price → Amazon reviews/deal forums; cultural_identity → TikTok/Reddit/Instagram; distribution → Glassdoor/trade pubs; competitive_shift → competitor blogs/press; etc. — full table in design)
    - When manifest is present, translate each hypothesis's `expected_signals` into search nets and use `dimension` for platform routing; carry `source_hypothesis_id` field on each derived search net so Property 17 can verify ID propagation
    - When absent, retain current behavior unchanged
    - _Design: Backend API Modifications → `backend/api/manifest.py`_
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 10. Forward the manifest from `SynthesisDashboard`
  - [x] 10.1 Modify `SynthesisDashboard.tsx` to thread `hypothesisManifest` through all four API calls
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/components/SynthesisDashboard.tsx` (modified)
    - Add `hypothesisManifest: HypothesisManifest | null` prop
    - In the auto-generation `useEffect`, every `axios.post` body includes `hypothesis_manifest: hypothesisManifest || undefined` for `/api/generate-brief`, `/api/generate-manifest`, `/api/generate-ecosystem`, `/api/intelligence/generate`
    - _Design: Frontend → `SynthesisDashboard.tsx`_
    - _Requirements: 19.1, 19.2_

  - [ ]* 10.2 Property test for `SynthesisDashboard` forwarding
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/__tests__/unit/SynthesisDashboard.forwarding.test.tsx` (new)
    - **Property 16: SynthesisDashboard forwarding** — for any manifest `M` (non-null) and any `interactionPayload`, all four `axios.post` calls receive a body whose `hypothesis_manifest` deep-equals `M`
    - Use `fast-check` `asyncProperty` with `numRuns: 100`; mock `axios` with `vi.mock`
    - **Validates: Requirements 19.1, 19.2**

- [ ] 11. Backward-compat and cross-stage ID tests for Sprint 3
  - [ ]* 11.1 Capture pre-update snapshot baselines for `/api/generate-brief` and `/api/generate-manifest`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/snapshot_baselines/` (new fixtures)
    - Replay a fixed set of inputs (with `hypothesis_manifest` absent) against the pre-update endpoints — capture either by checking out main with a capture script, or by recording responses BEFORE 8.1 and 9.1 are applied
    - Save responses with timestamps/UUIDs normalized; commit fixtures to the repo
    - _Requirements: 13.6, 14.4_

  - [ ]* 11.2 Backward-compat property test (brief + link farming manifest)
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_backward_compat_brief_manifest.py` (new)
    - **Property 14 (partial): Backward compatibility (manifest absent)** — for `/api/generate-brief` and `/api/generate-manifest`, invoking without `hypothesis_manifest` produces output structurally identical to the captured snapshot baselines (modulo timestamps, UUIDs, and other intentionally non-deterministic fields)
    - **Validates: Requirements 13.6, 14.4**

  - [ ]* 11.3 Property test: hypothesis IDs propagate verbatim to brief and link farming manifest
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_id_propagation_sprint3.py` (new)
    - **Property 17 (partial): Hypothesis ID propagation invariant** — for any manifest `M` passed to `/api/generate-brief` and `/api/generate-manifest`, every hypothesis ID in `M` appears as a literal substring in the brief output and as `source_hypothesis_id` on derived search nets in the link farming manifest
    - Mock `call_openrouter` to echo the hypothesis ID into the response body so the test is deterministic
    - **Validates: Requirement 13.2 + cross-stage identity (Acceptance Criterion 9)**

- [x] 12. Sprint 3 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

### Sprint 4 — Ecosystem Graph and Intelligence Map

- [x] 13. Update Category Graph with `hypothesis_anchor` nodes
  - [x] 13.1 Modify `ecosystem.py` to add `hypothesis_anchor` and `core_problem` node types
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/ecosystem.py` (modified)
    - Add `hypothesis_manifest: Dict[str, Any] | None = None` to `IntentPayload`
    - When present, build the graph with: root → `core_problem_{cp.id}` (color `#a855f7`, size 5) → `hypothesis_anchor_{h.id}` (type `hypothesis_anchor`, color `#6366f1`, size 6, carries `hypothesis_id`, `dimension`, `force`, `contrarian_pair_id`); existing Subject/Component/Signal hierarchy hangs off each `hypothesis_anchor`
    - When absent, retain current behavior (subjects/components/signals attach directly to root)
    - _Design: Backend API Modifications → `backend/api/ecosystem.py`_
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ]* 13.2 Property test for `hypothesis_anchor` invariants
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_ecosystem_anchor.py` (new)
    - **Property 12: Category graph hypothesis_anchor invariants** — count of `hypothesis_anchor` nodes equals `metadata.total_hypotheses`; every anchor has color `#6366f1` and size 6 and a `hypothesis_id` matching some manifest hypothesis; every hypothesis has an edge from its `core_problem_{cp.id}` parent; every Subject/Component/Signal node is reachable from some `hypothesis_anchor`
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.5, 15.6**

- [x] 14. Update Intelligence Map for 1:1 manifest consumption
  - [x] 14.1 Modify `intelligence_map.py` to consume manifest as `explicit_hypothesis` source
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/intelligence_map.py` (modified)
    - Add `hypothesis_manifest: Optional[Dict[str, Any]] = None` to `IntelligenceMapRequest` (existing `manifest` field keeps semantics for the link farming manifest)
    - When `hypothesis_manifest` is present, pre-populate `explicit_hypothesis` nodes 1:1 from the manifest preserving hypothesis IDs verbatim, append the literal sentinel "DO NOT REGENERATE" to the LLM user prompt, and post-process to force the explicit set back if the LLM dropped any
    - `suggested_hypothesis` reserved for emergent hypotheses (full implementation deferred per Section 18 of update spec)
    - When absent, retain current behavior
    - _Design: Backend API Modifications → `backend/api/intelligence_map.py`_
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ]* 14.2 Property test for Intelligence Map 1:1 mapping
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_intelligence_map.py` (new)
    - **Property 13: Intelligence map 1:1 mapping** — count of `explicit_hypothesis` nodes equals `metadata.total_hypotheses`; the set of `id` values on `explicit_hypothesis` nodes equals exactly the set of hypothesis IDs in `M`; the LLM call's user prompt contains the literal phrase `"DO NOT REGENERATE"`
    - Mock `call_openrouter` to capture the user prompt argument
    - **Validates: Requirements 16.2, 16.3**

- [x] 15. Update `latest-run` to surface the cached manifest
  - [x] 15.1 Modify `dev_bypass.py` for `hypothesis_manifest` field with missing-files tolerance
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/dev_bypass.py` (modified)
    - Add `hypothesis_manifest` to the `GET /api/latest-run` response body
    - Load value from `backend/latest_run_data/latest_hypothesis_manifest.json` when the file exists; set to `None` when absent (no 404)
    - Required-files check excludes the new file (only the four pre-existing files remain required)
    - _Design: Backend API Modifications → `backend/api/dev_bypass.py`_
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 15.2 Property test for `latest-run` `hypothesis_manifest` field
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_latest_run.py` (new)
    - **Property 15: Latest-run hypothesis_manifest field** — for any state of `latest_run_data/`, `GET /api/latest-run` returns a body containing `hypothesis_manifest`; equals `json.loads(file_contents)` when the file exists, `None` when absent; the endpoint never raises 404 due solely to absence of the hypothesis manifest file
    - Use `tmp_path` + `monkeypatch` to vary the `CAPTURE_DIR` contents
    - **Validates: Requirements 17.1, 17.2, 17.3**

- [ ] 16. Backward-compat and cross-stage ID tests for Sprint 4
  - [ ]* 16.1 Capture pre-update snapshot baselines for `/api/generate-ecosystem` and `/api/intelligence/generate`
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/snapshot_baselines/` (extend with new fixtures)
    - Replay a fixed set of inputs against pre-update endpoints; commit fixtures
    - _Requirements: 15.7, 16.6_

  - [ ]* 16.2 Backward-compat property test (ecosystem + intelligence map)
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_backward_compat_graph_imap.py` (new)
    - **Property 14 (completion): Backward compatibility (manifest absent)** — for `/api/generate-ecosystem` and `/api/intelligence/generate`, invoking without `hypothesis_manifest` produces output structurally identical to captured snapshot baselines
    - **Validates: Requirements 15.7, 16.6**

- [x] 17. Sprint 4 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

### Sprint 5 — Intake Pillar 3 Refactor

- [x] 18. Refactor Pillar 3 backend
  - [x] 18.1 Modify `intake.py`: rename Pillar 3, update saturation criteria, drop hypothesis gate
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/api/intake.py` (modified)
    - Rename `DEFAULT_PARAMETERS[2]` from "Target Lens & Hypothesis" to **"Target Lens & Decision Goal"**
    - Update Pillar 3 saturation scoring to weight decision context, success criteria, and risk tolerance (do not score for hypothesis articulation)
    - Remove any hypothesis-articulation requirement from `is_finalized` derivation; the four other pillars retain existing logic, labels, and thresholds; readiness labels and thresholds (0-20 VAGUE, 21-40 EMERGING, 41-60 DEVELOPING, 61-70 CALIBRATING, 71-100 SATURATED) byte-identical
    - _Design: Backend API Modifications → `backend/api/intake.py`_
    - _Requirements: 12.1, 12.2, 12.4, 12.7, 12.8_

  - [x] 18.2 Update `intake_agent.md` to remove hypothesis-elicitation language
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_agent.md` (modified)
    - Strip all hypothesis-elicitation phrasing
    - Add explicit instruction: "Do not ask the client what their hypothesis is. The hypothesis space is generated downstream by a dedicated engine. For Pillar 3 ('Target Lens & Decision Goal'), probe for the decision the research must inform, what success looks like, and the client's risk tolerance."
    - _Requirements: 12.3, 12.5_

  - [x] 18.3 Update all six archetype files in `intake_archetypes/`
    - Files (modified):
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/ua.md`
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/brand_health.md`
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/market_entry.md`
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/competitive_pulse.md`
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/erosion_study.md`
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/kb/agents/intake_archetypes/pricing_value.md`
    - Apply same edits as `intake_agent.md` — strip hypothesis-elicitation phrasing, add the do-not-ask instruction in archetype-appropriate wording
    - _Requirements: 12.6_

- [x] 19. Verify Pillar 3 label propagates through frontend
  - [x] 19.1 Inspect and (if needed) update `IntakeTerminal.tsx` for the new Pillar 3 label
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/frontend/src/components/IntakeTerminal.tsx` (modified or no-op)
    - The Pillar 3 label is API-driven; rename in `intake.py` should propagate automatically. Confirm by reading the current source. If any label is hardcoded in the component, update it to "Target Lens & Decision Goal"
    - _Requirements: 12.1_

- [ ] 20. Pillar 3 tests
  - [ ]* 20.1 Property test for Pillar 3 label rename
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/api/test_property_pillar3_rename.py` (new)
    - **Property 23: Pillar 3 label rename** — for any successful `POST /api/chat` response, `parameters[2].label == "Target Lens & Decision Goal"`
    - **Validates: Requirement 12.1**

  - [ ]* 20.2 KB content audit smoke test
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/unit/test_kb_content_audit.py` (new)
    - Read `intake_agent.md` and the six archetype files; assert that within the elicitation-question block, no occurrence of the literal token "hypothesis" or "Hypothesis" remains (regex over the relevant section)
    - _Requirements: 12.5, 12.6_

  - [ ]* 20.3 Live integration test: Pillar 3 conversation never elicits hypotheses
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/integration/test_intake_pillar3_no_hypothesis.py` (new)
    - Marked `@pytest.mark.integration`; runs three canned multi-turn conversations against the live LLM through `POST /api/chat`; asserts no agent message during Pillar 3 contains the substring "hypothesis" (case-insensitive); asserts `is_finalized` becomes true without any user message containing "hypothesis"
    - _Requirements: 12.3, 12.4_

- [x] 21. Sprint 5 checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

### Final Acceptance

- [ ] 22. Cross-cutting acceptance and benchmark tests
  - [ ]* 22.1 End-to-end hypothesis ID propagation test
    - File: `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/integration/test_e2e_id_propagation.py` (new)
    - **Property 17: Hypothesis ID propagation invariant (cross-stage identity)** — for one canned intent driven through the full pipeline (intent → engine → review → brief → link farming → ecosystem → intelligence map), every hypothesis ID emitted by the engine appears unchanged in:
      - `hypothesis_anchor_{h_id}` nodes of the Category Graph (with attribute `hypothesis_id == h_id`)
      - `explicit_hypothesis` nodes of the Intelligence Map (`node.id == h_id`)
      - The Strategic Brief's "Hypotheses" section (literal substring search)
      - The Link Farming Manifest's hypothesis-derived search nets (`source_hypothesis_id == h_id`)
    - This is Section 17 acceptance criterion #9 of the update spec
    - **Validates: Cross-stage identity (Requirement 16.2 + Acceptance Criterion 9)**

  - [ ]* 22.2 Benchmark suite for MECE pass rate
    - Files:
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/fixtures/canned_intents.json` (new — 20 canned intents)
      - `/Users/vdogg/Documents/mrxdatalabs_Station/MRX_Module_1/backend/tests/integration/test_benchmark_mece_pass_rate.py` (new)
    - Marked `@pytest.mark.integration`; runs each fixture intent through `generate_hypothesis_manifest`; asserts `_validate_manifest` passes and computes the percentage where `metadata.mece_audit_passed == true`
    - **Acceptance threshold: ≥90%** per Section 17 acceptance criterion #10
    - _Requirements: 4.6, 6.1-6.7_

- [~] 23. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional sub-tasks (property tests, snapshot capture, integration tests). Core implementation tasks are never marked optional. Tests can be skipped for a faster MVP, but Sprint 1 should retain at least Properties 1, 2, 3, 4 to keep the engine trustworthy.
- All 24 correctness properties from `design.md` map 1:1 to PBT sub-tasks. Properties 14 and 17 are split across two sprints (14 across Sprints 3+4 by endpoint; 17 partially in Sprint 3 and fully in Final Acceptance).
- Requirement IDs reference granular sub-requirements (e.g., 5.7) not just user stories. Each implementation task references both the requirement and the design section it implements.
- The five-sprint sequence is independently shippable: each sprint passes acceptance against the optional `hypothesis_manifest` shim. Sprint 5 ships the user-visible intake change last so prior sprints can be QA'd against the existing intake.
- Backend property tests use `hypothesis` (`max_examples=100`); frontend property tests use `fast-check` (`numRuns: 100`). All LLM calls are mocked at the `call_openrouter` boundary in unit/property tests.
- Cross-cutting concerns are tagged within their owning sprint:
  - Sprint 1 task 2.1 captures `latest_hypothesis_manifest.json` via `_persist`
  - Sprint 2 task 6.2 includes "Skip to Hypothesis Review", "Skip to Synthesis", and "Skip to Discovery" frontend dev-bypass updates
  - Sprint 4 task 15.1 surfaces `hypothesis_manifest` in `/api/latest-run` (backend half of the dev bypass change)

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "1.3", "5.1", "11.1", "16.1"]
    },
    {
      "id": 1,
      "tasks": [
        "2.1", "6.1",
        "8.1", "8.2", "9.1", "10.1",
        "13.1", "14.1", "15.1",
        "18.1", "18.2", "18.3", "19.1"
      ]
    },
    {
      "id": 2,
      "tasks": ["3.1", "6.2"]
    },
    {
      "id": 3,
      "tasks": [
        "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13",
        "3.2", "3.3",
        "6.3", "6.4", "6.5", "6.6", "6.7", "6.8",
        "10.2", "11.2", "11.3",
        "13.2", "14.2", "15.2", "16.2",
        "20.1", "20.2", "20.3"
      ]
    },
    {
      "id": 4,
      "tasks": ["22.1", "22.2"]
    }
  ]
}
```

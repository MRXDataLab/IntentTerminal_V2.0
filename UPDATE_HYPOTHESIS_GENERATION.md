# Update — Hypothesis Generation

## `update_hypothesis_generation`

A structural change to the Outtlyr Nucleus Ingestion Platform (Module 1) that elevates hypothesis generation from a scattered byproduct of multiple stages into a dedicated first-class stage producing a machine-readable manifest consumed by every downstream module.

---

## 1. Intent of the Change

The current platform generates hypotheses in three places, with three different mental models, in three different formats:

1. **Pillar 3 of the Intake Terminal** asks the client for their hypothesis directly — embedding confirmation bias from the first conversation turn
2. **`brief.py`** writes hypotheses into the Strategic Brief as free-form LLM prose
3. **`intelligence_map.py`** regenerates `explicit_hypothesis` and `suggested_hypothesis` nodes from the intent at convergence time

This update consolidates hypothesis generation into a single new stage — the **Hypothesis Engine** — that sits between Intake completion and Synthesis. The engine consumes the full pillar payload and emits a structured **Hypothesis Manifest** which becomes the single source of truth for the Strategic Brief, Link Farming Manifest, Category Graph, Methodology Blueprint, and Intelligence Map.

The intake conversation no longer asks the client for their hypothesis. Pillar 3 is rewritten to capture decision goals and success criteria instead. The hypothesis space is generated autonomously by the engine after the intent is locked, and surfaced to the client for review before synthesis runs.

---

## 2. Core Principles

### 2.1 No Restriction on Hypothesis Count
The engine generates as many hypotheses as the problem space warrants. A quality bar replaces a count bar — every hypothesis must meet structural criteria (see Section 7).

### 2.2 Mutually Exclusive
Hypotheses within the manifest must not semantically overlap. The engine enforces this through a three-layer MECE strategy (see Section 7).

### 2.3 Multiple Core Problems Supported
A single research intent may contain multiple distinct problems. The engine decomposes the intent first, then generates hypotheses per problem. Each problem gets its own hypothesis sub-tree under a shared manifest.

### 2.4 Contrarian Pairing
Every hypothesis has an explicit contrarian pair generated alongside it. Confidence emerges from evidence accumulation across pairs, not from one-sided framing.

### 2.5 Machine-Readable Output
The Hypothesis Manifest (`Hypothesis_Manifest.json`) is the durable artifact. All downstream stages consume it programmatically, not through prose interpretation.

### 2.6 De-Anchored Generation
The generator is run twice per problem — once with full pillar context, once with only the intent string and no chat history. The two outputs are merged. The "naive" run catches unknown unknowns that the context-aware run would otherwise miss.

---

## 3. Architectural Insertion

### 3.1 Current Pipeline

```
Intake Terminal
    │
    ▼
Synthesis Dashboard
    ├─→ Brief (generates hypotheses inline)
    ├─→ Link Farming Manifest
    └─→ Category Graph
    │
    ▼
Discovery → Extraction → Intelligence Map (regenerates hypotheses)
```

Hypotheses live in three places with no single source of truth.

### 3.2 New Pipeline

```
Intake Terminal (Pillar 3 rewritten)
    │
    ▼
Hypothesis Engine                                ← NEW STAGE
    │
    ▼
Hypothesis_Manifest.json                          ← NEW ARTIFACT
    │
    ├─→ Strategic Brief (consumes manifest)
    ├─→ Link Farming Manifest (consumes manifest)
    ├─→ Category Graph (manifest hypotheses as anchor nodes)
    └─→ Methodology Blueprint (consumes manifest)
    │
    ▼
Discovery → Extraction → Intelligence Map (consumes manifest)
```

All downstream consumers read the same manifest. No regeneration. No drift between stages.

### 3.3 Frontend Phase State Machine

**Before:**
```
phase: 'interaction' | 'synthesis' | 'discovery'
```

**After:**
```
phase: 'interaction' | 'hypothesis_generation' | 'synthesis' | 'discovery'
```

A new phase is inserted between `interaction` and `synthesis`. The `interactionPayload` is preserved across the new phase (no wipe). Approval/rejection from the new phase loops back to `interaction` with the same refinement-context mechanism already used by Phase 2.

---

## 4. New Components

### 4.1 Backend Service — `backend/services/hypothesis_engine.py`

Three internal stages executed in sequence:

| Stage | Function | LLM Calls |
|---|---|---|
| **Decomposition** | Parse intent + pillars into one or more core problems | 1 call |
| **Generation** | Generate exhaustive hypotheses per problem, with contrarian pairs, run twice per problem (with and without chat-history context) | 2 calls per problem |
| **MECE Audit** | Cluster, dedupe, and merge overlapping hypotheses across the full set | 1 call, fresh context |

**Public interface:**
```python
def generate_hypothesis_manifest(
    intent: str,
    pillar_extractions: dict,
    pillar_scores: list,
    context_document: str | None,
    template: str | None,
    chat_history: list,
) -> dict:
    """
    Returns a fully-populated Hypothesis_Manifest dict matching the schema in Section 5.
    """
```

### 4.2 Knowledge Base Agent — `backend/kb/agents/hypothesis_agent.md`

A single KB file containing three sub-prompts, selected by stage:

- `[DECOMPOSER]` — receives intent + pillars, returns array of core problems
- `[GENERATOR]` — receives one core problem + (optional) context, returns hypotheses with contrarian pairs
- `[MECE_AUDITOR]` — receives full hypothesis set, returns merge/dedupe decisions

The KB file follows the existing `kb_loader.py` mtime-cache pattern. Hot-reloadable.

### 4.3 API Endpoint — `backend/api/hypotheses.py`

```
POST /api/generate-hypotheses
```

**Request:**
```json
{
  "intent": "string",
  "pillar_extractions": {},
  "pillar_scores": [{"label": "string", "score": 0}],
  "context_document": "string | null",
  "template": "string | null",
  "chat_history": [{"role": "string", "content": "string"}]
}
```

**Response:** Full Hypothesis Manifest object (see Section 5).

Saved to disk: `backend/Hypothesis_Manifest.json` + `backend/latest_run_data/latest_hypothesis_manifest.json`.

### 4.4 Frontend Component — `frontend/src/components/HypothesisReview.tsx`

A new sub-phase component rendered between `IntakeTerminal` and `SynthesisDashboard`. See Section 9 for full UI specification.

### 4.5 Dev Bypass Snapshot — `backend/latest_run_data/latest_hypothesis_manifest.json`

Auto-captured during every live run. Loaded by the existing `/api/latest-run` endpoint for downstream phase testing without LLM spend.

---

## 5. Hypothesis Manifest Schema

**File:** `Hypothesis_Manifest.json`

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-18T10:30:00Z",
  "intent": "Why is our brand losing share among Gen-Z in quick commerce?",
  "metadata": {
    "total_core_problems": 1,
    "total_hypotheses": 17,
    "total_contrarian_pairs": 8,
    "generation_method": "ai_native_mece",
    "mece_audit_passed": true,
    "mece_audit_iterations": 1,
    "de_anchored_pass_count": 2,
    "dimensions_covered": [
      "price", "product", "brand_perception",
      "distribution", "cultural_identity", "competitive_shift",
      "demographic_shift", "situational_context"
    ]
  },
  "core_problems": [
    {
      "id": "cp_001",
      "statement": "Declining share among Gen-Z in quick commerce category",
      "priority": "primary",
      "decomposed_from_intent": true,
      "hypothesis_count": 17,
      "hypotheses": [
        {
          "id": "h_001",
          "statement": "Gen-Z perceives our pricing as misaligned with quick-commerce expectations of micro-pack value",
          "dimension": "price",
          "force_assignment": "value_elasticity_field",
          "mece_cluster_id": "cluster_pricing_misalignment",
          "expected_signals": [
            "price_perception",
            "price_sensitivity",
            "value_for_money"
          ],
          "expected_counter_signals": [
            "price_acceptance",
            "premium_justification"
          ],
          "contrarian_pair_id": "h_002",
          "investigation_priority": "high",
          "generation_source": "context_aware",
          "rationale": "Pillar 1 surfaced multiple quick-commerce mentions; Pillar 5 flagged competitors with smaller pack sizes."
        },
        {
          "id": "h_002",
          "statement": "Gen-Z perceives our pricing as appropriately positioned for the category",
          "dimension": "price",
          "force_assignment": "value_elasticity_field",
          "mece_cluster_id": "cluster_pricing_aligned",
          "expected_signals": [
            "price_acceptance",
            "value_for_money",
            "premium_justification"
          ],
          "expected_counter_signals": [
            "price_resistance",
            "price_shock"
          ],
          "contrarian_pair_id": "h_001",
          "investigation_priority": "high",
          "generation_source": "contrarian_pair",
          "rationale": "Contrarian pair of h_001 — both must be evidenced to determine which holds."
        }
      ]
    }
  ]
}
```

### 5.1 Field Definitions

| Field | Type | Purpose |
|---|---|---|
| `schema_version` | string | Manifest schema version for forward compatibility |
| `metadata.total_core_problems` | int | Surfaces in Hypothesis Review UI counter |
| `metadata.total_hypotheses` | int | Surfaces in Hypothesis Review UI counter |
| `metadata.mece_audit_passed` | bool | True if no overlap detected after audit |
| `metadata.dimensions_covered` | array | Structural taxonomy dimensions the engine considered |
| `core_problems[].priority` | enum | `primary` or `secondary` — primary problems get fuller investigation |
| `hypotheses[].dimension` | enum | Structural category: `price`, `product`, `brand_perception`, `distribution`, `cultural_identity`, `regulatory`, `demographic_shift`, `competitive_shift`, `situational_context`, `identity_expression` |
| `hypotheses[].force_assignment` | enum | One of the 5 Strategic Forces (see `services/force_taxonomy.py`) |
| `hypotheses[].mece_cluster_id` | string | Cluster identifier — hypotheses in the same cluster should have been merged unless they are contrarian pairs |
| `hypotheses[].expected_signals` | array | Signal tags from the canonical taxonomy that would evidence this hypothesis. Minimum 3 required. |
| `hypotheses[].expected_counter_signals` | array | Signal tags that would invalidate this hypothesis |
| `hypotheses[].contrarian_pair_id` | string \| null | Reference to the explicit opposite hypothesis |
| `hypotheses[].investigation_priority` | enum | `high`, `medium`, `low` — used by Discovery for IU allocation |
| `hypotheses[].generation_source` | enum | `context_aware`, `naive`, `contrarian_pair` — traces which run produced this hypothesis |

### 5.2 Hard Validation Rules

A manifest is invalid if any of the following are true:

1. Any hypothesis has fewer than 3 `expected_signals`
2. Any hypothesis lacks a `contrarian_pair_id` (except pairs that explicitly resolve to `null` because the hypothesis has no meaningful opposite — these must be flagged in `rationale`)
3. Two hypotheses share the same `mece_cluster_id` and neither is the other's contrarian pair
4. Total `core_problems` is 0
5. Any core problem has 0 hypotheses

Invalid manifests trigger regeneration with stricter constraints (up to 3 retries) before surfacing a `mece_audit_passed: false` flag.

---

## 6. Components That Change

### 6.1 `backend/api/intake.py`

- Pillar 3 prompt rewritten — no longer elicits hypotheses
- New label: `"Target Lens & Decision Goal"`
- New saturation criteria: decision context, success criteria, and risk tolerance captured
- `is_finalized: true` no longer waits for hypothesis articulation

### 6.2 `backend/kb/agents/intake_agent.md`

- Remove all hypothesis-elicitation language from system prompt
- Add explicit instruction: "Do not ask the client what their hypothesis is. The hypothesis space is generated downstream by a dedicated engine."

### 6.3 `backend/kb/agents/intake_archetypes/*.md` (all six files)

Same edits as `intake_agent.md` — strip hypothesis-elicitation language from:
- `ua.md`
- `brand_health.md`
- `market_entry.md`
- `competitive_pulse.md`
- `erosion_study.md`
- `pricing_value.md`

### 6.4 `backend/api/brief.py`

- New input: `hypothesis_manifest` (full JSON object)
- Brief no longer generates hypotheses
- The "Hypotheses" section of the brief becomes a structured render of the manifest:
  - One subsection per core problem
  - Each hypothesis rendered with statement, dimension, force assignment, expected signals, and rationale paragraph
  - Contrarian pairs shown side-by-side

### 6.5 `backend/kb/agents/brief_agent.md`

Update system prompt to instruct the LLM to **render** the provided hypothesis manifest into prose, not generate new hypotheses. Specify the section structure for the "Hypotheses" portion.

### 6.6 `backend/api/manifest.py`

- New input: `hypothesis_manifest`
- Each hypothesis's `expected_signals` get translated into search nets
- Each hypothesis's `dimension` informs platform routing (e.g., `cultural_identity` → TikTok, Reddit; `price` → Amazon reviews, deal forums)

### 6.7 `backend/api/ecosystem.py`

- Hypotheses become first-class anchor nodes in the Category Graph
- New node type: `hypothesis_anchor` (color: Indigo `#6366f1`, size: 6)
- `hypothesis_anchor` nodes attach to core_problem nodes which attach to root
- Existing Subject/Component/Signal hierarchy hangs off each hypothesis anchor

### 6.8 `backend/api/intelligence_map.py`

- Stops generating hypotheses from intent
- Consumes `hypothesis_manifest` directly
- `explicit_hypothesis` nodes are populated from the manifest (1:1 mapping)
- `suggested_hypothesis` is reserved for **emergent** hypotheses surfaced mid-study from signal anomalies (a meaningfully different concept — not just AI-generated upfront alternatives)
- Convergence engine now evaluates manifest hypotheses against signal evidence rather than free-generating them

### 6.9 `frontend/src/components/IntakeTerminal.tsx`

- Pillar 3 label changes from `"Target Lens & Hypothesis"` to `"Target Lens & Decision Goal"`
- Pillar 3 readiness criteria updated (decision goal + success criteria + risk tolerance)
- Other four pillars unchanged

### 6.10 `frontend/src/app/page.tsx`

- Phase state machine gains `'hypothesis_generation'` between `'interaction'` and `'synthesis'`
- New state: `hypothesisManifest` (persisted across rejection loops, same pattern as `interactionPayload`)
- New handler: `onHypothesisManifestApproved` → transitions to `'synthesis'`
- New handler: `onHypothesisManifestRejected` → returns to `'interaction'` with rejection context

### 6.11 `frontend/src/components/SynthesisDashboard.tsx`

- Receives `hypothesisManifest` prop in addition to `interactionPayload`
- Passes the manifest into all four synthesis API calls
- "Skip to Discovery" dev bypass loads cached `latest_hypothesis_manifest.json`

---

## 7. MECE Enforcement Strategy

Three layers of defense against semantic overlap and confirmation bias:

### 7.1 Layer 1 — Structural Taxonomy in the Generator Prompt

The hypothesis generator is required to evaluate the problem across ten structural dimensions:

```
1. price
2. product
3. brand_perception
4. distribution
5. cultural_identity
6. regulatory
7. demographic_shift
8. competitive_shift
9. situational_context
10. identity_expression
```

The LLM cannot return until each dimension has been considered. The LLM may legitimately conclude a dimension is irrelevant and skip generating hypotheses for it, but must explicitly acknowledge each dimension in the `metadata.dimensions_covered` array.

### 7.2 Layer 2 — Contrarian Pair Generation

For every hypothesis generated, the engine generates the explicit opposite within the same dimension. "Gen-Z perceives pricing as too high" is paired with "Gen-Z perceives pricing as appropriately positioned." Both enter the manifest with `contrarian_pair_id` cross-references.

This prevents one-sided framing. Confidence later emerges from which member of each pair accumulates more signal evidence — not from which the AI suspected first.

Edge case: some hypotheses have no meaningful opposite (e.g., "Gen-Z is unaware of the brand" has no useful contrarian). These are allowed with `contrarian_pair_id: null` and must include a justification in `rationale`.

### 7.3 Layer 3 — MECE Audit Pass

After generation, a separate LLM call (different model run, fresh context, no chat history) reviews the full hypothesis list and:

1. Computes pairwise semantic similarity for all hypotheses within the same `dimension`
2. Flags pairs with overlap >75% that are NOT contrarian pairs
3. Returns a merge directive: which hypotheses to combine and the merged statement

Flagged pairs get merged into a single broader hypothesis. The `mece_audit_iterations` field in metadata records how many audit passes were needed. If audit fails to clean up after 3 iterations, the manifest is generated with `mece_audit_passed: false` and the Hypothesis Review UI surfaces a warning banner.

---

## 8. Intake Terminal Pillar Changes

### 8.1 Pillar 3 Before vs After

| | Before | After |
|---|---|---|
| Label | Target Lens & Hypothesis | Target Lens & Decision Goal |
| What it scores | Whether the client has articulated a hypothesis | Whether the client has articulated the decision they need to make and what success looks like |
| Saturation criteria | Hypothesis stated | Decision context + success criteria + risk tolerance captured |
| LLM behavior | Probes for hypothesis | Probes for what decision the research must inform |

### 8.2 Pillars Unchanged

The other four pillars retain their current scoring logic, labels, and saturation criteria:

1. Market Context & Trigger
2. Strategic Decision & Goal
3. ~~Target Lens & Hypothesis~~ → **Target Lens & Decision Goal**
4. Scope & Assets
5. Competitive Landscape & Constraints

### 8.3 Readiness Labels (Unchanged)

| Score Range | Label | Color |
|---|---|---|
| 0–20 | VAGUE | Red |
| 21–40 | EMERGING | Orange |
| 41–60 | DEVELOPING | Amber |
| 61–70 | CALIBRATING | Blue |
| 71–100 | SATURATED | Green |

---

## 9. Hypothesis Review Screen Specification

### 9.1 Trigger

Rendered when `phase === 'hypothesis_generation'` and the `Hypothesis_Manifest.json` has been successfully generated.

### 9.2 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                         │
│  ● Outtlyr Hypothesis Engine                                        │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ X core   │  │ Y hypoth │  │ Z MECE   │  │ Audit:   │           │
│  │ problems │  │ generated│  │ clusters │  │ ✓ passed │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CORE PROBLEM 01 — primary                                          │
│  "Declining share among Gen-Z in quick commerce category"           │
│                                                                     │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ H_001 [price · high]        │  │ H_002 [price · high]        │ │
│  │ "Gen-Z perceives pricing as │  │ "Gen-Z perceives pricing as │ │
│  │  misaligned..."             │  │  appropriately positioned"  │ │
│  │ Force: Value Elasticity     │  │ Force: Value Elasticity     │ │
│  │ Signals: 3 expected         │  │ Signals: 3 expected         │ │
│  │ Pair: ↔ H_002               │  │ Pair: ↔ H_001               │ │
│  └─────────────────────────────┘  └─────────────────────────────┘ │
│                                                                     │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ H_003 [cultural · medium]   │  │ H_004 [cultural · medium]   │ │
│  │ ...                         │  │ ...                         │ │
│  └─────────────────────────────┘  └─────────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ACTION BAR                                                         │
│  [ Proceed to Synthesis ]  [ Add Hypothesis ]  [ Edit ]  [ Regen ] │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 Counters

The counter row (`X core problems · Y hypotheses · Z MECE clusters · Audit status`) is the most prominent UI element after the header. Per specification, these counts must be surfaced clearly so the client can see the engine's coverage at a glance.

### 9.4 Hypothesis Card Layout

Each card displays:
- Hypothesis ID (e.g., `H_001`)
- Dimension chip + investigation priority chip
- Full hypothesis statement
- Force assignment
- Expected signal count
- Contrarian pair reference (clickable — scrolls to paired hypothesis)
- Rationale (collapsible)

### 9.5 Action Bar Behavior

| Action | Behavior |
|---|---|
| Proceed to Synthesis | Persists manifest, transitions to `phase: 'synthesis'` |
| Add Hypothesis | Opens modal for manual hypothesis entry (must specify dimension, force, expected signals, contrarian pair) |
| Edit | Selects a hypothesis card and opens it for inline editing |
| Regen | Triggers `POST /api/generate-hypotheses` again with optional refinement context |

### 9.6 Approval Gate

Decision: **auto-proceed default with manual revisit available.**

The client is not required to approve every hypothesis before synthesis runs. The "Proceed to Synthesis" button defaults to highlighted. A "Modify Hypotheses" pivot remains available within the Synthesis Review screen for clients who want to revisit after seeing the brief.

### 9.7 MECE Audit Failure Banner

If `metadata.mece_audit_passed === false`, a yellow warning banner appears at the top of the review screen:

```
⚠ MECE audit did not converge cleanly after 3 iterations.
  Some hypotheses may have semantic overlap. Review highlighted pairs before proceeding.
```

Overlapping hypothesis pairs are visually linked with a dashed connector in the UI and the auditor's merge suggestion is shown in a popover on hover.

---

## 10. API Contracts

### 10.1 New Endpoint

```
POST /api/generate-hypotheses
```

**Request body:**
```typescript
{
  intent: string;
  pillar_extractions: Record<string, any>;
  pillar_scores: Array<{ label: string; score: number }>;
  context_document: string | null;
  template: string | null;
  chat_history: Array<{ role: string; content: string }>;
}
```

**Response body:** Full Hypothesis Manifest (Section 5 schema).

**Errors:**
- `400` — invalid intent payload or missing required pillars
- `422` — manifest failed all 3 regeneration attempts to meet hard validation rules
- `429` — LLM rate limited (cascading fallback exhausted)
- `500` — engine internal error (logged)

### 10.2 Modified Endpoints

| Endpoint | Change |
|---|---|
| `POST /api/generate-brief` | Now accepts optional `hypothesis_manifest` param; if present, uses it as the hypothesis source |
| `POST /api/generate-manifest` | Now accepts optional `hypothesis_manifest` param; expected signals inform search nets |
| `POST /api/generate-ecosystem` | Now accepts optional `hypothesis_manifest` param; renders hypothesis_anchor nodes |
| `POST /api/intelligence/generate` | Now accepts optional `hypothesis_manifest` param; populates `explicit_hypothesis` nodes from manifest |
| `GET /api/latest-run` | Response payload gains `hypothesis_manifest` field |

Backward compatibility: each modified endpoint retains its current behavior when `hypothesis_manifest` is absent. This allows phased rollout — the engine can be deployed before downstream consumers are updated.

---

## 11. State Management Changes

### 11.1 Frontend (React) — `page.tsx`

```typescript
phase: 'interaction' | 'hypothesis_generation' | 'synthesis' | 'discovery'

interactionPayload: InteractionPayload | null    // unchanged
hypothesisManifest: HypothesisManifest | null    // NEW
manifestData: ManifestData | null                // unchanged
```

`hypothesisManifest` follows the same persistence rules as `interactionPayload` — never wiped on rejection from a later phase.

### 11.2 Backend (Python) — Module Globals

`backend/services/hypothesis_engine.py` runs stateless. No module-level globals. Manifest is persisted to disk only.

### 11.3 Session Storage (Frontend)

The hypothesis manifest is cached in `sessionStorage` after first generation, keyed by intent hash. Prevents redundant LLM spend on hot-reloads during development.

---

## 12. Dev Bypass Updates

### 12.1 New Cached File

`backend/latest_run_data/latest_hypothesis_manifest.json` is captured on every live run, alongside the existing four cached files.

### 12.2 Updated Bypass Buttons

| Button | Updated Behavior |
|---|---|
| **Skip to Synthesis** (Phase 1) | Now skips through `hypothesis_generation` too — loads cached manifest, jumps directly to `synthesis` |
| **Skip to Hypothesis Review** (Phase 1) | NEW — jumps to the Hypothesis Review screen using cached `latest_intent.txt` and `latest_hypothesis_manifest.json` |
| **Skip to Discovery** (Phase 2) | Unchanged behavior, but also loads cached hypothesis manifest into state |

---

## 13. Migration Path for Existing Endpoints

Each downstream endpoint receives a backward-compatible parameter `hypothesis_manifest`. Behavior:

- **If `hypothesis_manifest` is provided:** endpoint consumes it as the hypothesis source
- **If `hypothesis_manifest` is absent:** endpoint falls back to its current behavior (generate hypotheses inline or from intent)

This allows the engine to be deployed and tested in isolation before downstream consumers are migrated. Sprint sequencing in Section 16 takes advantage of this.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Hypothesis explosion (50+ hypotheses per problem) | Hard validation rules (Section 5.2) + minimum signal-tag requirement + investigation_priority filtering |
| Confirmation bias seeping back via pillar context | De-anchored generation pass (Section 2.6) — generator runs twice, once without context |
| MECE detection misses subtle overlap | Multi-iteration MECE audit + explicit `mece_audit_passed` flag surfaced in UI |
| Brief regression — clinical bullets instead of rich prose | `brief_agent.md` updated to render manifest as prose paragraphs with rationale, not just bullets |
| Backward compatibility break across downstream stages | Optional `hypothesis_manifest` parameter on all modified endpoints |
| LLM token spend increases (more LLM calls) | Cascading model fallback already in place; cache MECE audit results; reuse manifests across refinement loops |
| Client expects to see "their" hypothesis | Manifest review screen explicitly surfaces the client's original framing (from Pillar 3 capture of decision goal) and shows which generated hypotheses align with it |

---

## 15. Open Items and Decisions Recorded

The following decisions are recorded with reasonable defaults. Confirm or override at implementation time:

| Decision | Default | Override? |
|---|---|---|
| Approval gating at Hypothesis Review | Auto-proceed (no required approval) | Confirm |
| Counts display location | Hypothesis Review screen only (not intake sidebar) | Confirm |
| Manifest filename | `Hypothesis_Manifest.json` | Confirm |
| Maximum MECE audit iterations | 3 | Confirm |
| Minimum expected_signals per hypothesis | 3 | Confirm |
| Structural dimensions in taxonomy | 10 (Section 7.1) | Confirm |
| New node color for `hypothesis_anchor` | Indigo `#6366f1` | Confirm |
| New phase name | `'hypothesis_generation'` | Confirm |

---

## 16. Implementation Sequence

Five sprints, each independently shippable behind the backward-compatibility shim:

### Sprint 1 — Engine + Schema
- Build `backend/services/hypothesis_engine.py`
- Build `backend/kb/agents/hypothesis_agent.md` with all 3 sub-prompts
- Build `POST /api/generate-hypotheses` endpoint
- Test the engine in isolation via curl/Postman
- No frontend changes
- **Deliverable:** working endpoint emitting valid manifests for canned test intents

### Sprint 2 — Hypothesis Review Frontend
- Build `HypothesisReview.tsx` component
- Wire new phase state in `page.tsx`
- Implement counters, hypothesis card, action bar
- Implement MECE audit failure banner
- **Deliverable:** end-to-end flow from intake → hypothesis review (downstream stages still on old logic)

### Sprint 3 — Brief and Manifest Consumption
- Update `brief.py` and `brief_agent.md` to consume manifest
- Update `manifest.py` to seed search nets from `expected_signals`
- Add `hypothesis_manifest` optional param to both endpoints
- **Deliverable:** hypotheses propagate consistently from manifest into brief and link farming manifest

### Sprint 4 — Ecosystem Graph and Intelligence Map
- Update `ecosystem.py` to add `hypothesis_anchor` nodes
- Update `intelligence_map.py` to consume manifest for `explicit_hypothesis` nodes
- Reserve `suggested_hypothesis` for emergent-only hypotheses
- **Deliverable:** single source of truth — all stages consume the manifest

### Sprint 5 — Intake Pillar Refactor
- Update Pillar 3 label and scoring criteria in `IntakeTerminal.tsx`
- Update `intake_agent.md` system prompt
- Update all 6 archetype files in `intake_archetypes/`
- **Deliverable:** intake no longer elicits hypotheses; user-visible behavior change shipped last

---

## 17. Acceptance Criteria

The update is complete when all of the following are true:

1. `POST /api/generate-hypotheses` returns a manifest passing all hard validation rules (Section 5.2)
2. The Hypothesis Review screen renders correctly with core problem and hypothesis counts visible
3. The Strategic Brief's "Hypotheses" section renders from the manifest, not free-form prose
4. The Link Farming Manifest's search nets reference the manifest's `expected_signals`
5. The Category Graph contains `hypothesis_anchor` nodes attached to core problem nodes
6. The Intelligence Map's `explicit_hypothesis` nodes are 1:1 with the manifest
7. The Intake Terminal's Pillar 3 no longer asks for hypotheses (verified by manual chat)
8. The dev bypass `Skip to Synthesis` button loads a cached manifest and routes correctly
9. A run started fresh from intent to final HTML report references the same hypothesis IDs throughout — no regenerated alternatives anywhere downstream
10. `mece_audit_passed: true` for at least 90% of test runs on a benchmark set of 20 canned intents

---

## 18. Out of Scope (For This Update)

The following are deliberately deferred to future updates:

- **Continuous monitoring of hypothesis verdicts post-convergence** — see proposed `update_continuous_watch`
- **Emergent hypothesis surfacing from signal anomalies mid-study** — partial enablement here (`suggested_hypothesis` reserved for this purpose), full implementation deferred
- **Client-supplied hypothesis seeds** — optional input to bias generation toward specific framings (deferred to retain default de-anchored behavior)
- **Multi-language hypothesis generation** — current implementation assumes English
- **Hypothesis confidence score predictions** — engine generates only the hypothesis space; confidence emerges from signal evidence during the study

---

## 19. References

- Existing platform architecture: `PLATFORM_ARCHITECTURE.md`
- 5 Strategic Forces: `backend/services/force_taxonomy.py`
- Existing pillar scoring logic: `backend/api/intake.py`, `backend/kb/agents/intake_agent.md`
- Existing brief generation: `backend/api/brief.py`, `backend/kb/agents/brief_agent.md`
- Existing intelligence map: `backend/api/intelligence_map.py`, `backend/kb/agents/intelligence_map_agent.md`

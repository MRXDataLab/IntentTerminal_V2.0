# MRX Module 1 — Feature & Update Log

> **Project:** MRX Nucleus Ingestion Engine  
> **Stack:** FastAPI (Python) + Next.js 16 (TypeScript)  
> **LLM Provider:** OpenRouter  
> **Last Updated:** April 8, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Pipeline Architecture](#pipeline-architecture)
3. [Backend Features](#backend-features)
4. [Frontend Features](#frontend-features)
5. [LLM Integration](#llm-integration)
6. [Data Flow](#data-flow)
7. [Updates & Fixes Log](#updates--fixes-log)
8. [Running the Project](#running-the-project)
9. [Known Limitations](#known-limitations)

---

## System Overview

MRX Module 1 is an **AI-powered research orchestration engine** that helps research teams go from a vague business anxiety to a structured, audited data ingestion plan. It operates in 3 sequential phases:

```
Phase 1: Intake Terminal     → Intent Crystallisation via conversational AI
Phase 2: Ecosystem Map       → LLM-generated taxonomy graph of the research domain
Phase 3: Audit Dashboard     → Exhaustive source discovery + signal quality scoring
```

---

## Pipeline Architecture

```
User Input (Chat)
      │
      ▼
┌─────────────────────────┐
│   Intake Terminal       │  Asks 5-parameter questions until readiness ≥ 80%
│   (api/intake.py)       │  Generates North Star Intent Statement
└─────────┬───────────────┘
          │   research_intent (string)
          ▼
┌─────────────────────────┐
│   Ecosystem Map         │  Builds a 4-category taxonomy graph from intent
│   (api/ecosystem.py)    │  Returns: core_topic, categories, nodes (graph)
└─────────┬───────────────┘
          │   graph_nodes[] (real node labels)
          ▼
┌─────────────────────────┐
│   Audit Dashboard       │  Discovers sources per node using LLM
│   (services/crawler.py) │  Scores each source for neutrality, relevance, engagement
└─────────┬───────────────┘
          │   approved_sources[]
          ▼
┌─────────────────────────┐
│   Risk Detection        │  Identifies blind spots & coverage gaps
│   (api/risk_detection.py│  Returns structured risks with severity + suggestions
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│   MSU Engine            │  Monitors ingestion batches
│   (core/msu_engine.py)  │  Stops when < 5% new unique signals are found
└─────────────────────────┘
```

---

## Backend Features

### `services/llm_client.py` — OpenRouter Client

- **Central routing layer** for all LLM calls across the system
- Accepts `model`, `system_prompt`, `user_prompt`, `chat_history`, `expect_json` parameters
- Default model: `openai/gpt-4o-mini` (designed to use `anthropic/claude-sonnet-4.6`)
- Handles `expect_json=True` → auto-parses JSON, strips markdown code fences if present
- Raises descriptive errors for missing API key or API failures
- Loads API key from `backend/.env` via `python-dotenv`

---

### `api/intake.py` — Intake Conversation Engine

**Endpoint:** `POST /api/chat`

**How it works:**
- Maintains full conversation history across turns
- System prompt instructs the LLM to evaluate answers against **5 core parameters**:
  1. Industry Context
  2. Business Goal / Anxiety
  3. Target Audience
  4. Geographical Scope
  5. Competitors
- Each parameter is scored **0–100** after every message
- Agent asks **focused consultative follow-up questions** targeting lowest-scoring parameters
- When **all parameters ≥ 80**, the agent sets `is_finalized: true` and generates a comprehensive **North Star Intent Statement**
- Supports **fast-track mode** (upload an existing `.md` or `.txt` brief) → instantly marks all parameters at 100

**Response schema:**
```json
{
  "response": "Follow-up question text",
  "parameters": [{"label": "Industry Context", "score": 85}, ...],
  "is_finalized": false,
  "overall_readiness": 72,
  "research_intent": null
}
```

---

### `api/ecosystem.py` — Taxonomy Graph Generator

**Endpoint:** `POST /api/generate-ecosystem`

**How it works:**
- Takes the finalized research intent as input
- Claude generates a **4-category taxonomy tree** with 3–4 specific real-world entities per category
- Returns a NetworkX-compatible node-link graph JSON
- Node types: `root` (core topic), `category` (cluster), `entity` (specific item)

**Example output structure:**
```json
{
  "core_topic": "EV Adoption India",
  "categories": [
    {"name": "Key Competitors", "nodes": ["Ola S1", "Ather 450X", "TVS iQube"]},
    {"name": "Consumer Personas", "nodes": ["Urban Commuter", "Delivery Partner", "College Student"]},
    ...
  ]
}
```

---

### `services/crawler.py` — Source Discovery Oracle (SourceOracle)

**Endpoint:** `POST /api/discover` (via sources router)

**How it works:**
- Takes a list of ecosystem graph nodes
- Sends them to Claude with a system prompt asking for an **exhaustive, niche-specific search strategy** per node
- Returns 3 diverse data sources per node, each with:
  - `platform` — specific platform (e.g., `r/IndiaEVs`, `Team-BHP`, `Statista`)
  - `url` — realistic example URL
  - `search_strategy` — exact keywords/filters for maximum signal-to-noise
- Sources are then **audited** (scored for neutrality, relevance, engagement density) to produce a final `signal_score`
- Status: `APPROVED` if `signal_score > 0.5`, else `REJECTED`

> **Previous state:** Was 100% mocked with random platform picks and fake URLs  
> **Now:** Fully LLM-driven, intent-aware, niche-specific source generation

---

### `api/risk_detection.py` — Risk & Blind Spot Detector

**How it works:**
- Receives the ecosystem graph node list + all audited sources
- Sends both to Claude for comparative analysis
- Returns 2–3 structured blind spots covering:
  - **COVERAGE_GAP** — A graph node with no strong or missing data sources
  - **PERSPECTIVE_BIAS** — A skewed viewpoint dominating the pool (e.g., consumer-heavy, missing B2B)
- Each risk includes: `type`, `node`, `description`, `severity` (HIGH/MEDIUM/LOW), `suggestion`

> **Previous state:** Static hardcoded rule — checked if node was in approved set, always appended a fixed Swiggy joke  
> **Now:** Dynamic LLM analysis with contextual risk reasoning

---

### `core/msu_engine.py` — Marginal Signal Utility Engine

- Processes ingestion batches (e.g., 200 comments each)
- Tracks all previously seen signals in a set
- Calculates `msu_percentage = unique_new / total_in_batch * 100`
- **Stop Rule:** If `msu_percentage < 5%` → declares `STOP_INGESTION` (signal saturation)
- Returns full batch history for audit trail

---

## Frontend Features

### `app/page.tsx` — Phase Router

- Manages active phase state: `intake → ecosystem → audit`
- Stores `researchIntent` (string) and `graphNodes` (string[]) in state
- Threads both pieces of data correctly through the component tree:
  - `researchIntent` → flows to all 3 phases
  - `graphNodes` → extracted from `EcosystemMap`, passed to `AuditDashboard`

---

### `IntakeTerminal.tsx` — Chat Interface (Phase 1)

**Left Pane — Chat:**
- Full conversational interface with agent (teal) and user message bubbles
- Animated typing indicator (3-dot bounce) while waiting for response
- Input auto-disables when intent is finalized
- Supports `Enter` to send
- File upload button for fast-track intent document (`.md`, `.txt`)

**Right Pane — Live Readiness Radar:**
- Circular progress ring showing `overall_readiness %`
- Animated progress bars per parameter (green ≥ 60, amber ≥ 40, gray < 40)
- On finalization: displays the **North Star Intent Statement** in a styled card
- Shows "Intent_Form.md generated" confirmation
- **"Initiate Horizon Scan"** CTA button → triggers Phase 2

---

### `EcosystemMap.tsx` — Taxonomy Graph (Phase 2)

- Calls `/api/generate-ecosystem` with the finalized intent
- Renders a live **force-directed graph** using `react-force-graph-2d`
- Node color coding: teal (root), blue (category), gray (entity)
- Custom canvas label rendering for each node
- Sidebar shows: research intent, nodes mapped count, semantic edges count
- Animated scanning progress bar during generation
- **"Generate Source Seeds"** CTA → extracts all non-root node labels and passes them to Phase 3

---

### `AuditDashboard.tsx` — Source Integrity Audit (Phase 3)

- Receives **real graph nodes** from `EcosystemMap` (no more mock data)
- Calls `/api/discover` with those exact nodes on mount
- Displays top KPIs: Total Sources, High-Signal Sources, Extractable Signals, Estimated Ingestion Time
- **Source Integrity Audit Table** with columns:
  - Node / Topic, Platform, Neutrality, Relevance, Engagement, Signal Score, Status
  - Animated progress bars for neutrality and relevance
  - Color-coded signal score badges
- **Risk Detection alert** panel (dynamic, from Claude)
- **"Commit to Ingestion Pipeline"** CTA for Phase 4

---

## LLM Integration

| Component | LLM Call | Model | Output Format |
|---|---|---|---|
| Intake Chat | `/api/chat` | gpt-4o-mini | JSON with scores + response |
| Ecosystem Graph | `/api/generate-ecosystem` | gpt-4o-mini | JSON graph taxonomy |
| Source Discovery | `SourceOracle.discover_sources()` | gpt-4o-mini | JSON list of sources |
| Risk Detection | `RiskDetector.detect_blind_spots()` | gpt-4o-mini | JSON list of risks |

> All calls route through `services/llm_client.py → OpenRouter API → https://openrouter.ai/api/v1/chat/completions`

---

## Data Flow

```
User Message (chat turn)
    → POST /api/chat
    → call_openrouter(SYSTEM_PROMPT, chat_history, expect_json=True)
    → JSON: { response, parameters[], is_finalized, research_intent }
    → Frontend renders response + updates radar

[When is_finalized = true]
    → User clicks "Initiate Horizon Scan"
    → POST /api/generate-ecosystem { intent: research_intent }
    → call_openrouter(SYSTEM_PROMPT_ECOSYSTEM, intent, expect_json=True)
    → JSON graph (nodes, links)
    → ForceGraph2D renders the graph
    → Frontend extracts node labels → graphNodes[]

[User clicks "Generate Source Seeds"]
    → POST /api/discover { graph_nodes: graphNodes[] }
    → call_openrouter(SYSTEM_PROMPT_CRAWLER, graph_nodes, expect_json=True)
    → JSON: { sources: [...] }
    → Each source is audited (signal_score calculated)
    → AuditDashboard renders table + risk panel
```

---

## Updates & Fixes Log

### April 8, 2026

#### ✅ OpenRouter API Key Configured
- Added `OPENROUTER_API_KEY` to `backend/.env`
- Verified API connectivity with a test call

#### ✅ Upgraded Default LLM to Claude Sonnet
- `llm_client.py` updated to accept a `model` parameter
- Default changed from `gpt-4o-mini` → `anthropic/claude-sonnet-4.6`
- Reverted to `gpt-4o-mini` due to insufficient credits on the free tier
- Correct OpenRouter model slug confirmed: `anthropic/claude-sonnet-4.6`

#### ✅ Source Discovery — Replaced Mock with LLM
- `services/crawler.py` completely rewritten
- Removed: hardcoded platform array + `random.choice` mock
- Added: `SYSTEM_PROMPT_CRAWLER` that asks Claude for exhaustive, niche-specific sources
- Each source now includes `platform`, `url`, and a detailed `search_strategy`
- Graceful fallback to Google search if API call fails

#### ✅ Risk Detection — Replaced Static Logic with LLM
- `api/risk_detection.py` completely rewritten
- Removed: static set comparison + hardcoded "Swiggy" risk
- Added: `SYSTEM_PROMPT_RISK` feeding Claude the full graph vs ingested source context
- Returns contextual, deep risk analysis with actionable suggestions

#### ✅ Phase Data Chain Fixed (Critical Bug Fix)
- **Bug:** `EcosystemMap` called `onMapComplete()` with no arguments
- **Bug:** `AuditDashboard` used hardcoded EV scooter mock nodes, completely disconnected from user's actual intent
- **Fix:** `EcosystemMap` now extracts real entity/category node labels from the graph API response and passes them via `onMapComplete(graphNodes[])`
- **Fix:** `page.tsx` stores `graphNodes` in state and passes them as a prop to `AuditDashboard`
- **Fix:** `AuditDashboard` now uses `graphNodes` prop to call `/api/discover` — source discovery is fully intent-driven

---

## Running the Project

### Prerequisites
- Python 3.10+, Node.js 18+
- OpenRouter account + API key with credits

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "OPENROUTER_API_KEY=your_key_here" > .env
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## Known Limitations

| Issue | Status | Notes |
|---|---|---|
| Claude Sonnet 4.6 returns 402 | Active | Account has ~2033 free tokens. Upgrade at openrouter.ai/settings/credits |
| Audit source metrics (neutrality, relevance) are mock-scored | Planned | Real dipstick crawling not yet implemented |
| MSU Engine not yet connected to frontend | Planned | Standalone Python class, needs ingestion API wrapper |
| Risk Detection panel in AuditDashboard is hardcoded | Planned | Dynamic risks from LLM exist in backend but not wired to frontend yet |
| No authentication or session management | Out of scope | Single-user local dev tool |

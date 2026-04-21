# Outtlyr (MRX Module 1) Application Summary

This document provides a comprehensive overview of the functionality and architectural layers of the Outtlyr primary intelligence platform.

## Architecture

*   **Frontend**: Next.js (React) application styled with Tailwind CSS, utilizing Framer Motion for animations and Lucide React for iconography.
*   **Backend**: FastAPI Python application handling requests and routing them to OpenRouter for LLM inference.
*   **Integration**: Communication between the frontend and backend is handled via standard REST APIs (`/api/chat`, `/api/generate-brief`, `/api/generate-ecosystem`).

## Core Pipeline & User Journey

The application operates as a sequential three-phase pipeline, driving the user from initial problem definition to final data ingestion setup.

### Phase 1: The Intake Terminal
The first phase focuses on calibrating the research intent through an interactive, AI-driven diagnostic process.

*   **Document Context Upload**: Users can fast-track the intake by uploading documents (`.md`, `.txt`, `.csv`, `.pdf`). The backend parses the content (truncated to 4,000 characters for token efficiency) to pre-score system pillars.
*   **Diagnostic Chat Interface**: An LLM-powered agent acts as a strategic consultant, asking one short, targeted question at a time to uncover the root cause of the research request. The history is kept to a 6-message rolling window to optimize token burn.
*   **5-Pillar Scoring System**: The backend evaluates the conversation against five critical pillars:
    1.  Market Context & Trigger
    2.  Strategic Decision & Goal
    3.  Target Lens & Hypothesis
    4.  Scope & Assets
    5.  Competitive Landscape & Constraints
*   **Visual Radar Reveal**: A staged UI that displays readiness metrics using a live-updating radar visualization. The threshold for completion is dynamically set at 60%.
*   **Intent Locking & Brief Generation**: Once parameters are met (or if the user bypasses fine-tuning), the system locks a "North Star Statement". It then calls the `/api/generate-brief` endpoint to synthesize the raw input into a highly structured **5-Tier Strategic Research Brief**.
*   **Outcome**: Generates an actionable `.md` file downloaded to the user's local machine, providing a structured mandate (including Ghost Brand discovery, Regulatory Physics, and an Evidence Blueprint).

### Phase 2: Category Ecosystem Map
The second phase transforms the Strategic Research Brief into an interactive visual taxonomy.

*   **Brief-Driven Nodes**: The backend (`/api/generate-ecosystem`) uses the generated Strategic Brief as its primary source of truth. It explicitly maps entities, signals, datasets, and platforms mentioned in the brief rather than relying on generic knowledge.
*   **Dynamic Thematic Categories**: The system extracts 4 to 6 specific thematic pillars from the brief (moving away from static forces), establishing them as root categories in the graph.
*   **Force-Directed Graph**: Uses `react-force-graph-2d` to render a living, interactive canvas of the ecosystem.
*   **Dynamic Visual Legend**: The UI dynamically assigns colors from a predefined palette to the generated thematic categories, displaying a live legend outlining the key themes bridging the graph components.
*   **Outcome**: Maps out target domains and structural/subjective nodes, preparing the exact "Source Seeds" needed for internet discovery.

### Phase 3: Audit Dashboard
The final phase (currently a transition point in Module 1) receives the defined node list.

*   **Node Hand-off**: The frontend successfully extracts all active node labels from the Ecosystem Map.
*   **Ingestion Hand-shake**: Prepares the parameters required to trigger the deeper MRX Data Ingestion Pipeline (Module 2/Inference Engine), acting as a verified data blueprint.

---

## Notable Recent Optimizations

1.  **Reduced AI Hallucination**: The ecosystem map directly inherits entities from the Research brief rather than inventing broad market categories.
2.  **Token Efficiency**: Truncation logic and conversational window limits ensure API calls to OpenRouter scale efficiently for high-volume engagements.
3.  **Conversational Tone Formatting**: Constraints placed on the AI Intake agent heavily refine questions—forcing brief, jargon-free, one-at-a-time clarifications avoiding overly dense research methodologies.

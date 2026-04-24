**Intent Terminal \- Synthesis**

* 

**Synthesis Layer**

When the Synthesis Layer finishes, it outputs two artifacts: a Human-Readable .md file (for the client to approve) and a Machine-Readable JSON payload (for the ingestion engine).

Here is the structure of the ultimate Outllyr Strategic Brief:

**Artifact 1 : The Outllyr Strategic Research Brief**

**Document Purpose:** This document summarizes our shared understanding of your business challenge. It outlines the exact questions we are setting out to answer, the scope of the digital data we will analyze, and the specific deliverables that will guide your next strategic move.

**Market Context & Trigger (Business Background)**

*What specific event or market shift brought us here?*

* **The Situation:** We are seeing a 14% drop in repeat purchases among Gen-Z users in Tier-1 cities over the last 90 days. This anomaly coincides directly with Competitor A's aggressive price cut and a recent software update to our core app.

**The Strategic Goal (Business Objective)**

*Why are we doing this, and what commercial lever will it help you pull?*

* **The Objective:** This intelligence will dictate our Q4 defensive strategy. Specifically, we need to decide whether to drop our MSRP by 10% to protect market share, or hold our price and reposition our marketing to focus on premium product durability.

**Hypotheses to Stress-Test (Research Objectives)**

*What specific theories is our AI setting out to prove or debunk using internet data?*

* **Theory A (Price):** Users are migrating to Competitor A strictly due to price sensitivity (measuring *Value Elasticity*).

* **Theory B (Product):** The recent software update caused hidden technical friction, leading to silent churn (measuring *Reinforcement Stability*).

* **Theory C (Brand):** Our core message of "Premium Quality" is no longer resonating in organic online discussions (measuring *Demand Gravity*).

**Target Lens (Target Market / Audience)**

*Whose digital footprints are we tracking?*

* **The Cohort:** Upwardly mobile young professionals and tech enthusiasts. We will calibrate our digital scouts to prioritize forums and review sections where this specific demographic gathers to discuss tech organically.

**The Search Perimeter (Scope: Geography, Timeline, Budget)**

*The exact boundaries our system will use to filter out irrelevant internet noise.*

* **Temporal Window:** The trailing 6 months (Oct 1, 2025 – April 1, 2026).

* **Geography:** Pan-India, with a hyper-weighted focus on the top 6 metro PIN codes.

* **Product Scope:** Restricted to the "Pro" series laptops.

**The Threat Matrix (Competitive Context)**

*Who are we benchmarking against?*

* **Visible Rivals:** We will actively track and compare your performance against **\[Competitor A\]** and **\[Competitor B\]**.

* **Invisible Threats:** Outllyr’s discovery engine is authorized to scan e-commerce platforms (like Amazon/Blinkit) to identify any unknown "white-label" or ghost brands currently stealing your "Share of Search."

**Internal Ground Truth (Existing Knowledge)**

*What proprietary data are we using to ground the AI's findings?*

* **Data Integration:** The client will provide weekly unit sales data and NPS scores for the last 6 months. Outllyr will overlay this onto the internet data to correlate digital conversation spikes with real-world revenue impact.

**Action Confidence & Stop-Rules (Action Standards)**

*How we ensure accuracy and know when the research is "done."*

* **Marginal Signal Utility (MSU):** Our system optimizes for truth, not volume. The AI will automatically halt data extraction when the insights stabilize—meaning pulling an additional 5,000 reviews yields less than a 2% change in the final sentiment.

* **Confidence Threshold:** We will only trigger a Go/No-Go recommendation if the convergence of signals (e.g., Reddit complaints aligning with Amazon return trends) hits an 85% confidence score.

**Execution & Alignment (Stakeholder Information)**

*Who is driving the outcome?*

* **Primary Sponsor:** \[CMO / VP of Product\]

* **Alignment:** The data generated here will be used jointly by the Marketing team (for positioning adjustments) and the Product team (if UI/UX rollbacks are required).

**What You Will Receive (Deliverable Requirements)**

*Upon completion of the analysis, Outllyr will deliver:*

1. **The Ecosystem Map:** An interactive, visual graph showing exactly how consumer anxieties, competitor features, and your brand's pricing connect in the real world.

2. **The Strategic Force Scorecard:** A quantified health check measuring your brand's natural pull (*Demand Gravity*) against market friction (*Choice Architecture*).

3. **The Decision Matrix:** A direct, data-backed recommendation on your Strategic Goal (e.g., "Do not drop price; invest in a UI patch").

**Artifact 2: The Category Graph (The "Ecosystem" Visualization)**

**Target Audience:** The Outllyr Strategist and the Client (as an interactive UI element). 

**Purpose:** To provide a visual, nodal map of the "Physics of the Market." It proves to the client that Outllyr isn't just running a generic keyword search, but has mapped out every nuance of their business problem.

**The Anatomy:**

* **The Core (Root Node):** The central Business Anxiety (e.g., *Erosion of Premium Laptops*).

* **The Branches (Subject Nodes):** Generated from the Hypothesis and Scope. Branches out into thematic clusters like *Battery Longevity*, *Resale Value*, *Customer Support Friction*, and *Competitor X's Display*.

* **The Leaves (Abstracted Source Nodes):** Shows the *types* of digital terrain attached to each subject. For example, the *Resale Value* node connects to a "Secondary Marketplaces" leaf. The *Battery Longevity* node connects to a "Technical Subreddits" leaf.

* **The Metadata Layer (The 5 Forces):** The nodes are color-coded based on the 5 Strategic Forces.

* *Blue (Demand Gravity):* Nodes related to organic pull and brand salience.

* *Red (Reinforcement Stability):* Nodes related to post-purchase regret or loyalty.

* *Result:* The client sees a vibrant web of subjects, intuitively grasping how their product's "Value" is directly connected to a "Competitor's Supply Chain."

 **Artifact 3: The Link Farming Manifest (The "Machine" Mandate)**

**Target Audience:** Outllyr’s Data Ingestion Layer (Module 2\) and LLM Inference Pipelines.   
**Purpose:** A pure JSON/YAML payload. This defines the accuracy of the data sources. It is the absolute source of truth for the API scrapers, dictating exactly where to go, what to pull, and when to stop.

This artifact is a pure, machine-readable configuration file. When the Synthesis Layer outputs this JSON, your backend ingestion engine (AWS Lambda, Celery workers, etc.) parses it to trigger the APIs, scrape the data, tag the signals, and halt when the truth is found.

**Sample Study Output:** An Erosion & Competitive Pulse study for the "Amazon Echo Show" facing churn due to "Alexa+ Paywalls" and competition from the "Google Nest Hub."

**\[gemini-code-1777020728403.json\]**

**Discovery Layer**

The **Discovery Module** is our financial and analytical firewall. Its sole job is to take **Artifact 3 (The Link Farming Manifest)** and act as an autonomous "Scout." It doesn't read the whole internet—it reads the *metadata* (titles, snippets, timestamps, engagement metrics), scores it, and only passes high-probability URLs to the deep-ingestion scrapers.

**Step 1: Manifest Ingestion & The Bounding Box (The Setup)**

The workflow begins the millisecond the Synthesis Layer drops Artifact 3 (the JSON payload) into our message broker (e.g., Kafka or RabbitMQ).

* **The Orchestrator:** Our master worker parses the global\_parameters from Artifact 3\.

* **Setting the Bounding Box:** The Orchestrator sets hard variables across all downstream tasks:

* *Time Lock:* publishedAfter: 2025-10-24T00:00:00Z (If an API returns a 4-year-old review, the system instantly drops it).

* *Geo Lock:* Maps geo\_fencing: \["US", "GB", "IN"\] to the specific API parameters (e.g., regionCode for YouTube, or routing through regional proxy IPs for Amazon).

**Step 2: The Query Expansion & API Swarm (The Dispatch)**

Artifact 3 gives us boolean\_nets (e.g., "Echo Show" AND "ads"). We can't just pass that string blindly to every API. The Discovery Module expands and formats these nets into platform-native queries and spins up an asynchronous swarm of workers.

* **Worker A (Search Engine/PAA Scout):** Uses Serper.dev or Google Custom Search API.

* *Task:* Runs queries like intitle:"Echo Show 11" AND "review".

* *Extraction:* Pulls the top 50 Organic URLs, the "People Also Ask" (PAA) question strings, and news metadata.

* **Worker B (YouTube Scout):** Hits the YouTube Data API v3 (/search endpoint).

* *Task:* Queries q="Echo Show 11 review", filtered by categoryId=28 (Tech).

* *Extraction:* Pulls videoId, snippet.title, snippet.description, and statistics.viewCount. (It does *not* pull comments yet—that costs too much).

* **Worker C (Reddit Scout):** Hits the Reddit API or a third-party aggregator.

* *Task:* Searches strictly within the targets defined in Artifact 3: subreddit:smarthome.

* *Extraction:* Pulls thread URLs, \<H1\> titles, upvote counts, and comment counts.

* **Worker D (E-Commerce Scout):** Uses headless browsers (Puppeteer/Playwright) routed through residential proxies to avoid CAPTCHAs.

* *Task:* Hits the specific ASINs (Amazon IDs) provided in the manifest.

**Step 3: A Human-in-the-Loop (HITL) Ranking System,**

**The Objective Math Ranker (Heuristic Normalization)**

Before the AI touches anything, a Python script processes the 10,000+ links and calculates a hard, deterministic **Objective\_Velocity\_Score (0 to 100\)**.

Because every platform has different metrics (a Reddit upvote is not equal to a YouTube view), the script normalizes them using a decay formula:

* **YouTube Logic:** ((Views \* 0.01) \+ (Comments \* 2)) / (Age\_in\_Hours ^ 1.5)

* **Reddit Logic:** ((Upvotes \* 1.5) \+ (Comments \* 3)) / (Age\_in\_Hours ^ 1.5)

* **Search/News Logic:** Domain\_Authority\_Score / (Age\_in\_Days ^ 1.2)

*Result:* Every link now has a mathematically pure score showing its current "Heat" or "Intensity," entirely independent of what the text actually says.

**The Semantic LLM Triage** 

Now, we send the metadata in batches of 50 to a cheap, fast LLM (like Gemini 1.5 Flash). But we **strip out the numbers**. We don't ask the LLM to do math; we only ask it to evaluate relevance.

| System Prompt: Outllyr Triage Assistant You are evaluating search results for a study on: *\[Users churning due to Alexa+ paywall\]*. Evaluate the following 50 Titles/Snippets. For each, output a JSON object containing: semantic\_relevance\_score (0 to 100): How perfectly does this text match the core problem? link\_summary: A 1-sentence summary of what this link is about. extraction\_rationale: Why Outllyr should scrape this. hidden\_signals: The top 2 Signal Tags likely hiding inside. |
| :---- |

**The Composite Ranking & Output**

The Data Engineering pipeline catches the LLM's output and merges it with the Python script's math to create the **Final Triage Rank**.

* **The Formula:** Final\_Rank\_Score \= (Objective\_Velocity\_Score \* 0.4) \+ (Semantic\_Relevance\_Score \* 0.6) *(Weighted slightly toward relevance so a highly viral but irrelevant video doesn't win).*

**Step 4: The Ghost Brand Protocol (The Secondary Loop)**

While the main swarm is running, the Orchestrator checks Artifact 3 for "ghost\_brand\_discovery": {"enabled": true}.

* **The Scout:** Queries site:amazon.in "best sellers" smart displays.

* **The Extraction:** It parses the top 20 ASINs. It cross-references the brand names against the tracked\_competitors list in Artifact 3\.

* **The Action:** If it finds a high-selling brand named "TechView" that wasn't in the brief, it dynamically adds "TechView" to the entity\_anchors and feeds it back into Step 2 to gather data on this invisible threat.

**The Analyst Triage Dashboard (Human-in-the-Loop)**

 **Analyst Interface**

The analyst logs into the dashboard for the specific study (e.g., *Echo Show Erosion*). They do not see raw code; they see a Kanban-style or List-view UI sorted by the Final\_Rank\_Score.

Each link is presented as a **Triage Card** containing:

* **The Score:** e.g., 🔴 96.2 (High Intensity \+ High Relevance)

* **The Metadata:** Platform (Reddit), Age (2 Days), Engagement (342 Comments).

* **The AI Summary:** *"A highly active Reddit thread where users are venting about core features moving behind the new Alexa+ paywall."*

* **The Extraction Rationale:** *"Must Scrape. Matches exact hypothesis on price sensitivity."*

* **Expected Signals:** \[regret\_clusters\], \[value\_criticism\]

**The Analyst's Workflow (The Manual Audit)**

The analyst's job is to rapidly curate the "Hunt List" using the AI's context.

* **Bulk Actions (The Fast Pass):** The analyst can trust the math for the absolute best links. They might click a button: \[Select All Rank \> 90\] which instantly approves the top 50 links for extraction.

* **Spot-Checking (The Middle Tier):** The analyst scrolls through the links ranked 50 to 200\.

* *Scenario:* They see a YouTube video ranked 85\. The AI rationale says: *"Discusses Echo Show unboxing."* The analyst knows unboxings rarely contain churn data. They click **\[Reject\]**.

* *Scenario:* They see a niche forum post ranked 120\. The AI rationale says: *"User explains how to downgrade the firmware to remove ads."* The analyst knows this is a goldmine for 'Choice Architecture' friction. They click **\[Approve\]**.

* **Filter by Signal:** The analyst can filter the dashboard by the AI's predicted hidden\_signals. If the client specifically asked about competitors, the analyst filters by \[switching\_narratives\] and approves the top 20 links in that category.
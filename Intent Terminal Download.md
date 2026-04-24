**Intent Terminal : Interaction Layer** 

**Strategic Interrogation Workflow** 

This workflow ensures the Intake is fast, low-cost, and exhaustive.

The Entry Path Options :

* Path A : User selects a study Template. Agent loads template-specific "Prior Knowledge" and skips general probing.

* Path B : Skips and Begin without Template. Agent initiates the 5-Pillar Interrogation.

* Path C : If Skipped,the system shows user an option to upload an existing brief. 

* If a file is uploaded, the Agent parses it immediately. Agent check if the brief is comprehensive enough and suggests user to fine tune or proceed as is. Ex :  "I’ve ingested your brief. It’s 70% complete. I need to clarify the **Strategic Decision** and the **Rivals** before we build the graph. Shall we proceed with these specific questions?"

**Strategic Interrogation Mechanism**

* **Sub-dimensions:** These are not rigid fields to fill. They are the **Concepts, Keywords, and Targeted Questions** the agent uses to navigate the conversation.

* **Cumulative Scoring (The "Brief-Readiness" Metric):** The score is evaluated continuously based on the aggregate of all answers.

* **0–20 (Vague):** The agent only has a high-level complaint. A brief written now would result in noisy, useless scraper data.

* **40–60 (Developing):** The agent has context but lacks boundaries. A brief written now would be too broad.

* **80–100 (Saturated):** The agent has the optimal, precise data needed to create a highly accurate research brief.

* **Saturation Rule:** The agent stops probing a pillar when its cumulative score hits 80\. At this point, the pillar is "Done."

**Pillar 1: Market Context & Trigger**

**Definition:** What is the business overview, and what triggered the client to conduct this study? Is it a reactionary event (e.g., a PR crisis, sales drop) or a proactive general brand health check?

* **Sub-dimensions (Concepts & Keywords):**

* *Business Baseline:* Current state of the brand in the market.

* *The Catalyst:* The specific event (Competitor launch, viral trend) vs. Routine audit.

* *Urgency:* Why this needs to be mapped now.

* **The Agent's Goal (What to Ask/Extract):** The agent needs to figure out *why* the radar is turned on. It might ask: *"To give me the right context, are we doing a general health check on the brand, or was there a specific event recently that triggered this study?"*

* **System Extraction:** Maps the intent to determine if the scrapers should look for "Spikes/Anomalies" (Event-based) or "Longitudinal Trends" (Health check).

**Pillar 2: Strategic Decision & Goal**

**Definition:** The overarching Business or Research Objective. This is the strategic significance of the study, which the system must decompose further into actionable nodes.

* **Sub-dimensions (Concepts & Keywords):**

* *The Objective:* The ultimate goal (e.g., Market Entry, Repositioning, Pricing alignment).

* *Strategic Significance:* The weight of the decision resting on this data.

* *Decomposition Nodes:* Breaking the big goal into smaller research questions.

* **The Agent's Goal (What to Ask/Extract):** The agent needs to find the "North Star." It might ask: *"What is the ultimate strategic objective of this study? How will this data influence your next big business move?"*

* **System Extraction:** This becomes the "Executive Summary" of the Research Brief. It dictates which Strategic Forces (e.g., Value Elasticity vs. Choice Architecture) will carry the most weight in the final analysis.

**Pillar 3: Target Lens & Hypothesis**

**Definition:** Who is the Target Audience (e.g., GenZ, Tech Enthusiasts, HNIs)? What is the client's internal hypothesis that they want to verify (which often serves as the core problem statement itself)?

* **Sub-dimensions (Concepts & Keywords):**

* *Audience Demographics/Psychographics:* Identifying the exact cohort.

* *The Internal Hypothesis:* The client's "gut feeling" about what is happening.

* *The Problem Statement:* The specific friction point the client suspects.

* **The Agent's Goal (What to Ask/Extract):** The agent needs to define the "Who" and the "Suspected Why." It might ask: *"Who is our primary target audience for this? And going into this, what is your team's current hypothesis or problem statement regarding their behavior?"*

* **System Extraction:** The Target Audience sets the demographic filters for the AI inference pipeline (e.g., filtering YouTube comments for GenZ language). The Hypothesis keywords become the primary **Subject Nodes** in the Ecosystem Map.

**Pillar 4: Scope & Assets**

**Definition:** The exact Scope of Work (SOW) and the available internal data assets from the client that Outllyr can leverage to ground its findings.

* **Sub-dimensions (Concepts & Keywords):**

* *The SOW:* Geographic limits, temporal boundaries (last 6 months vs. last 2 years), specific product lines.

* *Client Data Assets:* CRM data, past surveys, sales figures.

* **The Agent's Goal (What to Ask/Extract):** The agent builds the sandbox. It might ask: *"What is the exact scope of this work in terms of geography or specific products? Also, do you have internal data sets we can leverage to anchor our findings?"*

* **System Extraction:** Creates the hard API parameters for the scrapers (e.g., geo: "IN", timeframe: "90d"). Tells the Analyst Agent to prepare a section in the brief for cross-referencing client data with digital exhaust.

**Pillar 5: Competitive Landscape & Constraints**

**Definition:** The visible or invisible competition in the market. Identifying direct threats, indirect substitutes, and specific constraints on the research.

* **Sub-dimensions (Concepts & Keywords):**

* *Visible Rivals:* The named competitors the client fights daily.

* *Invisible/Ghost Rivals:* White-label sellers or indirect substitutes stealing share.

* *Threats & Constraints:* Specific areas the client is worried about, or areas explicitly out of bounds for the study.

* **The Agent's Goal (What to Ask/Extract):** The agent defines the battlefield. It might ask: *"Who are the visible competitors we need to benchmark against? Are there any 'invisible' threats or specific constraints we should keep in mind?"*

* **System Extraction:** The rivals become the **Benchmark Nodes** in the Ecosystem Map. Knowing the "Invisible" threats commands the system to actively scrape e-commerce platforms for unknown, high-velocity sellers.

**Research Archetypes**

When an archetype is selected, it pre-loads a specific configuration of "Priors" that tells the Intake Agent which coordinates (inputs) to ask for, and tells the downstream engine which digital exhaust (signals) to hunt for.

* **Usage & Attitude (U\&A) / Behavioral Mapping**

* **Primary Forces Measured:** Reinforcement Stability & Demand Gravity

* **The Goal:** To understand how the product fits into the consumer's daily life and routines.

* **Core Signals Mapped:**

* **Brand Discovery:** Signals of a user encountering the brand for the first time or finding a new use case.

* **Ritual Language & Habitual Usage:** Recurrent usage patterns and lifestyle integration mentioned in un-moderated forums.

* **JTBD (Jobs-To-Be-Done) Narratives:** How users describe the actual "job" they hired the product for (often differing from marketing claims).

* **Substitute Workarounds:** Users explaining how they "hack" or modify the product to fit their needs.

* **Brand Health & Equity Audit**

* **Primary Forces Measured:** **Demand Gravity** & **Reinforcement Stability**

* **The Goal:** To measure the organic pull (Mental Availability) and community defense of the brand.

* **Core Signals Mapped:**

* **Brand Salience & Recall Language:** Frequency and ease of unprompted brand recall (*e.g., "Which one was the one with the blue logo? Oh right, \[Brand\]."*).

* **Category Salience:** The strength of the brand-category association (*e.g., "If you want an EV, you naturally think of this brand first."*).

* **Brand Mention Share:** The proportion of organic conversations featuring the brand vs. others.

* **Community Defense / Advocacy:** Instances of users actively defending the brand against critics or recommending it unprompted.

* **Market Entry / Whitespace Scan**

* **Primary Forces Measured:** **Choice Architecture**, **Competitive Energy**, & **Demand Gravity**

* **The Goal:** To find the "Structural Vacuum" where incumbents are failing and demand is unmet.

* **Core Signals Mapped:**

* **Information Gaps:** High-volume search clusters where users are asking questions but only finding poor-quality forum answers.

* **Incumbent OOS (Out-of-Stock) Rates:** Supply chain or availability failures of current market leaders.

* **Ghost Brand Velocity:** High review and sales velocity for white-label or "no-name" sellers filling the gap on e-commerce platforms.

* **Interest & Curiosity Signals:** Signals of active market desire for a solution that doesn't fully exist yet.

* **Competitive Pulse (Displacement Study)**

* **Primary Forces Measured:** **Competitive Energy** & **Choice Architecture**

* **The Goal:** To track migration paths and identify the exact feature/narrative causing consumers to switch brands.

* **Core Signals Mapped:**

* **Switching Narratives & Migration Velocity:** Explicit statements of users abandoning one brand for another.

* **Competitor Complaints & Reliability Issues:** Users venting about a rival's failure or doubting their long-term performance.

* **Category Leadership vs. Underdog Narratives:** Market position signals—whether a brand is seen as the "stagnant giant" or the "disruptive challenger."

* **Brand Positioning Language:** How the brand 'feels' relative to others (*e.g., "This feels like the budget-friendly alternative to the premium brands."*).

* **Erosion Diagnosis (Churn & Trust Collapse)**

* **Primary Forces Measured:** **Reinforcement Stability**, **Value Elasticity**, & **Competitive Energy**

* **The Goal:** To diagnose the "Digital Graveyard" and find out if users are leaving due to product failure, poor service, or better competitor pricing.

* **Core Signals Mapped:**

* **Regret Clusters:** Groupings of post-purchase dissonance, "buyer's remorse," or update-related regret.

* **Resale Velocity & Retainment:** The volume and price-drop percentage of the product on secondary markets (e.g., OLX, Cashify).

* **Narrative of Departure:** The specific reasons cited by users when they declare they are leaving the ecosystem.

* **Competitor Reliability Issues:** Tracking if users are churning to a competitor only to experience failures there as well.

* **Pricing & Value Justification**

* **Primary Forces Measured:** **Value Elasticity Field** & **Choice Architecture**

* **The Goal:** To determine if the brand has the narrative equity to justify its premium or if it is reliant on discounts.

* **Core Signals Mapped:**

* **Competitor Value Criticism:** Asserting the rival is overpriced (*e.g., "The competitor is charging double for basically the same features."*).

* **Price Sensitivity Sentiment:** The outrage velocity related to price hikes or hidden fees.

* **Perceived Indispensability (The Disappearance Test):** Measuring how much pain it would cause the consumer if the brand vanished.

* **Feature-to-Cost Debates:** Granular arguments in forums about whether a specific feature justifies the overall price tag.

* 
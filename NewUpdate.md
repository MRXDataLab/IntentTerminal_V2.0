### **Key Strategic Shifts:**

* **Template Branching:** Switching from generic 5-pillar questioning to "Short-circuit" templates.  
* **Synthesis Layer:** Introducing a "Research Analyst" phase that connects the intake to the live internet before the user even sees a graph.  
* **Semantic Mapping:** Redesigning the Ecosystem Map to be a **Subject-Relationship Web** rather than a Force-Hierarchy.

---

## **2\. Feature Details & Implementation**

### **A. Template-Specific Intake (Agentic Logic)**

**The UX Change:** When a user selects a template (e.g., *Brand Erosion*), the Intake Agent shifts its "System Prompt" to a high-speed diagnostic mode.

* **Logic:** If `Template == "Brand_Health"`, skip general context questions.  
* **Quick-Start Questions:** 1\. "Who is the primary rival stealing your mindshare right now?" 2\. "What was the specific 'Moment of Doubt' or sales data point that triggered this?" 3\. "Which region or product SKU is under the most pressure?"  
* **Outcome:** Reduces total intake time by 60% while increasing intent precision.

### **B. Real-Time Discovery Engine (Internet Connectivity)**

**The Technical Change:** The system is no longer isolated. We are integrating a **Search-Augmented Generation (SAG)** layer.

* **Scout Mode:** During the intake or immediately after, a background "Scout" (using Serper.dev or Google Search API) will:  
  * Find actual e-commerce links (Amazon, Blinkit, Flipkart).  
  * Identify "Ghost Brands" (Sellers with high reviews but no web presence).  
  * Fetch recent news articles (last 30 days) related to the category keywords.  
* **Source Validation:** Every link in the final Audit Dashboard will be a verified, live search result, not a predicted URL.

### **C. The Analyst Synthesis Layer (The .md Brief)**

**The Process Change:** Between Intake and Mapping, we insert the "Synthesis" phase.

1. **Collation:** The AI acts as a Senior Research Analyst.  
2. **External Context:** It merges client answers with the "Scout" search results.  
3. **Deliverable:** Generates a **Research Brief (.md)**.  
   * *Includes:* Intent, Internet-found Rivals, Regulatory Context, and Structural Gaps.  
   * *Downloadable:* The client can finalize and download this as their "Source of Truth."

### **D. Subject-First Ecosystem Map (Relationship Logic)**

**The UI/UX Change:** We are removing "Forces" from the primary graph nodes. Forces are now "Inference Tags" that exist in the background.

* **Graph Root:** The Central Problem Statement.  
* **Branch Level 1:** Key Subjects/Keywords discussed in the chat (e.g., "Battery Longevity," "Home Charging," "Service Center Proximity").  
* **Branch Level 2:** Related Components & Context (e.g., "FAME II Subsidy," "OLX Resale Value," "Blinkit Battery-Swap").  
* **Edges (Links):** Represent **semantic relationships** (e.g., "Battery Longevity" *affects* "Resale Value").  
* **Force Categorization:** Forces (e.g., *Reinforcement Stability*) are only applied as colors or metadata *after* the subjects are mapped, helping the client see the "Force" as an outcome, not a starting point.

---

## **3\. Technical Specification for Engineering**

### **1\. Integration of Search API (Serper.dev)**

We will implement a `DiscoveryAgent` that triggers search queries based on the `Keywords` extracted during the first 3 messages of the chat.

Python  
\# Pseudo-logic for Internet Scout  
def scout\_internet(keywords):  
    results \= serper\_api.search(f"top sellers for {keywords} on Amazon India")  
    news \= serper\_api.search(f"recent news {keywords} category")  
    return {"rivals": results, "news": news}

### **2\. Markdown Generator (Analyst Synthesis)**

A new endpoint `/api/generate-brief` will take the `IntakeHistory` \+ `ScoutResults` and use a high-context LLM (Gemini 1.5 Pro) to produce the `.md` file.

### **3\. Force-Free Graph Rendering**

The `EcosystemMap` component will be updated to:

* Exclude "Force" labels from the primary node data.  
* Use a **Radial Subject Layout**: Problem \-\> Keywords \-\> Signals.  
* Implement `ForceTags` as a toggleable overlay for professional users.

---

## **4\. Updated Data Flow**

1. **Intake Chat:** Simple, template-driven questions.  
2. **Internet Scout (Background):** Finds real products/brands/news.  
3. **Analyst Synthesis:** LLM combines chat \+ scout data into a **Research Brief**.  
4. **Finalize & Download:** User approves the strategy and downloads the `.md`.  
5. **Subject Map:** Renders a keyword-centric web showing real-world relationships.  
6. **Audit:** Directly links to the live search results found in Step 2\.

## **Intelligence Stack: Low-Cost/Free Model Strategy**

To maintain high reasoning at zero to low cost, the system will utilize **OpenRouter’s Free Tier** with a "Task-Specific" routing logic:

* **Intake Agent (Chat):** `google/gemini-2.0-flash-lite-preview:free` (Extremely fast, low latency for conversation).  
* **Analyst Synthesis (Brief Generation):** `google/gemini-pro-1.5-exp:free` (High context window to ingest chat \+ internet search results).  
* **Category Graph Architect:** `mistralai/mistral-7b-instruct:free` (Structured output specialist for JSON mapping).  
* **Internet Discovery (Search):** `Serper.dev` (Free tier provides 2,500 queries—sufficient for POC).

The **Category Graph** is redesigned to show the **Semantics of the Market**, not the hierarchy of a framework.

* **Root Node:** The Problem Statement.  
* **Tier 1 Nodes (Subjects):** Major themes from the Brief (e.g., "Battery Life," "Pricing Sensitivity," "Brand Trust").  
* **Tier 2 Nodes (Components):** Sub-topics and items (e.g., "FAME II Subsidy," "OOS on Blinkit," "Resale Value on OLX").  
* **Tier 3 Nodes (Signals):** The actual keywords and internet sources (e.g., "Reddit thread on charging," "Amazon 'Best Seller' badge").  
* **Visual Logic:**  
  * **Force Categorization (Post-Process):** Nodes are tagged with a "Force" (Demand Gravity, etc.) in their metadata, but the labels are *hidden* unless the user toggles the **"Strategic Overlay"**.  
  * **Relationship Edges:** Lines connect subjects that influence each other (e.g., a "Subsidy Policy" node is linked to the "Value" node).


# **Functional Requirements Document** 

* 

---

##  **Functional Requirements**

### **3.1. Consultative Intake Terminal (The Consultant Agent)**

The system shall provide a conversational interface to crystallize research intent.

* **FR 1.1: Template-Driven Entry:** The system must offer pre-defined study templates (e.g., U\&A, Brand Health, Market Entry, Competitive Pulse, Erosion Study).  
* **FR 1.2: First-Principles Diagnostic:** If no template is selected, the Agent shall execute a 5-pillar probing sequence (Trigger, Decision, Hypothesis, Assets, Constraints).  
* **FR 1.3: Context Ingestion:** The system shall allow users to upload internal data (Sales CSVs, NPS) and secondary reports (Nielsen, Kantar) to establish a baseline.  
* **FR 1.4: Intent Finalization:** The system shall generate a "North Star Intent Statement" with a readiness score $\\ge 80\\%$ before proceeding.

### **3.2. Dynamic Category Graph (Ecosystem Mapping)**

The system shall generate a visual taxonomy of the research domain's "physics."

* **FR 2.1: Exhaustive Node Generation:** The graph must include:  
  * **Structural Nodes:** OOS rates, pricing volatility, logistics friction.  
  * **Talent Nodes:** Migration of key personnel (LinkedIn/Glassdoor signals).  
  * **Secondary Market:** Resale value (OLX/Spinny) and refurbished demand.  
  * **Policy/Macro:** Regulatory subsidies (e.g., FAME II), taxation, and infrastructure density.  
* **FR 2.2: Force Mapping:** Nodes must be categorized under the **5 Strategic Forces** (Demand Gravity, Choice Architecture, Value Elasticity, Reinforcement Stability, Competitive Energy).

### **3.3. Dual-Layer Data Ingestor (Signal Extraction)**

The system shall deploy "Scout Bots" to harvest signals across two distinct layers.

* **FR 3.1: Subjective Voice (The "Why"):** Extraction from Reddit (friction narratives), YouTube/TikTok (visual asset recall/meme reuse), and e-commerce reviews (SKU-level failures).  
* **FR 3.2: Structural Data (The "Physics"):** \* **Inventory:** Real-time OOS rates and restock lead times (Blinkit, Zepto, Amazon).  
  * **Search:** 4-level deep "People Also Ask" (PAA) trees and Google Trends $Z$-scores.  
  * **Location:** Google Maps "Popular Times" (footfall proxy) and showroom density.  
* **FR 3.3: Confidence-Based Router (The Sieve):** \* **Local Match:** 100% confidence via seeds.py.  
  * **LLM Verification:** Unknown entities/associations routed to OpenRouter with batching (10-15 comments per call).


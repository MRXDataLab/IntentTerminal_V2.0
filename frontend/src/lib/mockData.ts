export const MOCK_INTENT = "Understand the drivers behind the consistent Year-over-Year decline of Kellogg's Corn Portfolio in India.";

export const MOCK_BRIEF = `
# Outtlyr Strategic Research Brief

**Research Intent:** The primary research intent is to understand the drivers behind the consistent Year-over-Year decline of Kellogg's Corn Portfolio in India over the last year. This involves diagnosing why robust distribution isn't converting into sustained offtakes and repeat purchases among modern consumers and traditional buyers, specifically addressing perceived category relevance shifts (migration to Muesli/Granola), competitive value erosion (local players like Mohan Cornflakes), the ineffectiveness of the Multigrain proposition, and potential taste/functional disconnects leading to a trial vs. retention paradox, to inform strategies for regaining relevance and reversing the decline amidst high competitive intensity and commoditization.

---

#### 1. Market Context & Trigger (Business Background)
- **The Situation:** Kellogg’s Corn Portfolio in India is experiencing a consistent Year-over-Year (YoY) decline despite Kellogg's masterbrand position and robust distribution. This consistent YoY decline, marked by a struggle to convert robust distribution into sustained offtakes and repeat purchases, serves as the critical catalyst. The urgency is high, as the core portfolio is declining, past interventions have been ineffective, category relevance is diminishing, and competitive intensity challenges premium positioning.

#### 2. The Strategic Goal (Business Objective)
- **The Objective:** The objective is to reverse the declining trend of the Corn Portfolio, improve sustained offtakes and repeats, regain category relevance, and counter competitive challenges. This is of very high significance given its impact on a core portfolio of a masterbrand in India, especially as previous strategic levers have failed. This research aims to unlock data-backed strategies addressing: Category Relevance & Consumer Shift (migration to Muesli/Granola), The Value Squeeze (local players, commoditization), The Innovation Gap (Multigrain Cornflakes not resonating), The Trial vs. Retention Paradox (taste/functional proposition disconnect), and the Ineffectiveness of past interventions.

#### 3. Hypotheses to Stress-Test (Research Objectives)
- **Hypothesis 1:** The Corn Portfolio’s perceived relevance is diminishing among modern consumers, driving migration to alternative breakfast formats such as Muesli and Granola. (Measures: Demand Gravity)
- **Hypothesis 2:** The Multigrain Cornflakes proposition is failing to resonate with current health-focused consumer mindsets, despite extensive marketing investment, indicating a disconnect in its value proposition. (Measures: Choice Architecture & Value Elasticity)
- **Hypothesis 3:** The taste profile or functional proposition of Kellogg's Cornflakes does not meet the evolving expectations of traditional buyers, leading to a trial-to-retention paradox. (Measures: Reinforcement Stability)
- **Hypothesis 4:** Local players, specifically Mohan Cornflakes in the East, are significantly commoditizing the category, thereby eroding the value perception and premium positioning of Kellogg's Corn Portfolio. (Measures: Competitive Energy & Value Elasticity)

#### 4. Target Lens (Target Market / Audience)
- **The Cohort:** The system will prioritize conversations from modern consumers seeking alternative breakfast formats and traditional Cornflakes buyers whose current expectations may not be met by the existing product or proposition.

#### 5. The Search Perimeter (Scope: Geography, Timeline, Budget)
- **Temporal Window:** The last year (specifically focusing on data reflecting the Year-over-Year decline).
- **Geography:** India, with specific attention to insights from the East and other regions where local competition is prominent.
- **Product Scope:** Kellogg's Corn Portfolio, encompassing traditional Cornflakes and Multigrain Cornflakes.

#### 6. The Threat Matrix (Competitive Context)
- **Visible Rivals:** Mohan Cornflakes (local players in the East).
- **Invisible Threats:** Muesli and Granola (alternative breakfast formats consumers are migrating towards). The discovery engine is authorized to scan e-commerce platforms and digital marketplaces for emergent or unknown sellers contributing to category commoditization.

#### 7. Internal Ground Truth (Existing Knowledge)
- **Data Integration:** Internal Kellogg's data, including sales figures (YoY decline, offtakes, repeats), robust distribution data, marketing spend (extensive TVC and digital media budgets for Multigrain), satisfactory initial trial data, and product/pack data (packaging refreshes, varied pack sizes, and new functional claims) will be overlaid onto internet data to ground and validate AI findings.

#### 8. Action Confidence & Stop-Rules
- **MSU (Marginal Signal Utility):** The AI will automatically halt data extraction when insights stabilize — meaning pulling additional data yields less than a 2% change in final sentiment.
- **Confidence Threshold:** Go/No-Go recommendations trigger only at 85% convergence of signals.

#### 9. Execution & Alignment
- The data generated will be used jointly by the Marketing and Product teams for strategic positioning and operational adjustments.

#### 10. What You Will Receive (Deliverable Requirements)
- Upon completion, Outllyr will deliver:
    1. **The Ecosystem Map:** Interactive visual graph showing consumer anxieties, competitor features, and brand positioning.
    2. **The Strategic Force Scorecard:** Quantified health check measuring brand pull against market friction.
    3. **The Decision Matrix:** Direct, data-backed recommendation on the Strategic Goal.
`;

export const MOCK_MANIFEST = {
  "core_topic": "Kellogg's Corn Portfolio Decline in India",
  "search_queries": [
    "Kellogg's corn flakes alternative India",
    "Mohan Cornflakes vs Kellogg's",
    "Muesli health benefits India",
    "Kellogg's multigrain reviews"
  ],
  "target_domains": [
    "amazon.in",
    "flipkart.com",
    "reddit.com/r/india",
    "quora.com"
  ],
  "data_signals": [
    "Year-over-Year sales decline",
    "Mohan Cornflakes market share East India",
    "Sentiment analysis of Multigrain TVC"
  ],
  "boolean_nets": [
    "(\"Kellogg's Cornflakes\" OR \"Kelloggs\") AND (\"Muesli\" OR \"Granola\") AND (\"Switch\" OR \"Alternative\")",
    "(\"Mohan Cornflakes\") AND (\"Price\" OR \"Cheap\" OR \"Value\")",
    "(\"Kellogg's Multigrain\") AND (\"Taste\" OR \"Healthy\" OR \"Review\")"
  ],
  "signal_taxonomy": [
    "Taste Disconnect",
    "Commoditization",
    "Premium Erosion",
    "Health-focused Migration"
  ],
  "entity_anchors": {
    "tracked_competitors": [
      "Mohan Cornflakes",
      "Tata Soulfull",
      "Yogabar Muesli"
    ]
  }
};

export const MOCK_GRAPH = {
  nodes: [
    { id: "root", type: "root", label: "Kellogg's Corn Portfolio Decline" },
    
    // Demand Gravity
    { id: "DG_Sub", type: "subject", label: "Hypothesis 1: Demand Migration", force: "Demand Gravity" },
    { id: "DG_Comp1", type: "component", label: "Muesli/Granola Shift", force: "Demand Gravity", subject: "Hypothesis 1: Demand Migration" },
    { id: "DG_Sig1", "type": "signal", "label": "Modern Consumer Preferences", force: "Demand Gravity", subject: "Hypothesis 1: Demand Migration" },
    { id: "DG_Sig2", "type": "signal", "label": "Search volume for high-protein breakfast", force: "Demand Gravity", subject: "Hypothesis 1: Demand Migration" },

    // Choice Architecture
    { id: "CA_Sub", type: "subject", "label": "Hypothesis 2: Multigrain Disconnect", force: "Choice Architecture" },
    { id: "CA_Comp1", "type": "component", "label": "Multigrain Proposition", force: "Choice Architecture", subject: "Hypothesis 2: Multigrain Disconnect" },
    { id: "CA_Sig1", "type": "signal", "label": "Health-focused Mindset Disconnect", force: "Choice Architecture", subject: "Hypothesis 2: Multigrain Disconnect" },

    // Reinforcement Stability
    { id: "RS_Sub", type: "subject", "label": "Hypothesis 3: Retention Paradox", force: "Reinforcement Stability" },
    { id: "RS_Comp1", "type": "component", "label": "Taste/Functional Disconnect", force: "Reinforcement Stability", subject: "Hypothesis 3: Retention Paradox" },
    { id: "RS_Sig1", "type": "signal", "label": "Traditional Buyer Expectations", force: "Reinforcement Stability", subject: "Hypothesis 3: Retention Paradox" },
    { id: "RS_Sig2", "type": "signal", "label": "One-time trial dropping to 0% repeat", force: "Reinforcement Stability", subject: "Hypothesis 3: Retention Paradox" },

    // Competitive Energy
    { id: "CE_Sub", type: "subject", "label": "Hypothesis 4: Local Commoditization", force: "Competitive Energy" },
    { id: "CE_Comp1", "type": "component", "label": "Mohan Cornflakes", force: "Competitive Energy", subject: "Hypothesis 4: Local Commoditization" },
    { id: "CE_Sig1", "type": "signal", "label": "East India Volume Share", force: "Competitive Energy", subject: "Hypothesis 4: Local Commoditization" },
    { id: "CE_Sig2", "type": "signal", "label": "Distribution dominance in Tier 2/3", force: "Competitive Energy", subject: "Hypothesis 4: Local Commoditization" },

    // Value Elasticity
    { id: "VE_Sub", "type": "subject", "label": "Hypothesis 5: Value Squeeze", force: "Value Elasticity" },
    { id: "VE_Comp1", "type": "component", "label": "Premium Positioning Erosion", force: "Value Elasticity", subject: "Hypothesis 5: Value Squeeze" },
    { id: "VE_Sig1", "type": "signal", "label": "Price sensitivity mentions on E-commerce", force: "Value Elasticity", subject: "Hypothesis 5: Value Squeeze" }
  ],
  links: [
    { source: "root", target: "DG_Sub" },
    { source: "DG_Sub", "target": "DG_Comp1" },
    { source: "DG_Comp1", "target": "DG_Sig1" },
    { source: "DG_Comp1", "target": "DG_Sig2" },

    { source: "root", "target": "CA_Sub" },
    { source: "CA_Sub", "target": "CA_Comp1" },
    { source: "CA_Comp1", "target": "CA_Sig1" },

    { source: "root", "target": "RS_Sub" },
    { source: "RS_Sub", "target": "RS_Comp1" },
    { source: "RS_Comp1", "target": "RS_Sig1" },
    { source: "RS_Comp1", "target": "RS_Sig2" },

    { source: "root", "target": "CE_Sub" },
    { source: "CE_Sub", "target": "CE_Comp1" },
    { source: "CE_Comp1", "target": "CE_Sig1" },
    { source: "CE_Comp1", "target": "CE_Sig2" },

    { source: "root", "target": "VE_Sub" },
    { source: "VE_Sub", "target": "VE_Comp1" },
    { source: "VE_Comp1", "target": "VE_Sig1" }
  ]
};

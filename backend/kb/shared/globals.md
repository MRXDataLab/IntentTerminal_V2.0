# Outllyr — Shared Knowledge Base Definitions

## The 5 Strategic Forces Framework

Every node, hypothesis, and signal in the Outllyr system is tagged with one of five Strategic Forces that represent the "physics" of a market:

| Force | What It Measures | Signal Direction |
|-------|-----------------|-----------------|
| **Demand Gravity** | Organic brand pull, mental availability, category salience | High = strong pull; Low = brand is invisible |
| **Choice Architecture** | How decisions are structured in the category — defaults, nudges, switching costs | High = favorable structure; Low = disadvantaged position |
| **Value Elasticity** | Price sensitivity, value justification, willingness-to-pay narratives | High = strong value equity; Low = discount-dependent |
| **Reinforcement Stability** | Habit strength, retention loops, ritual language, repeat usage | High = locked-in habits; Low = churn-prone |
| **Competitive Energy** | Switching narratives, displacement velocity, migration patterns | High = active displacement; Low = stable competitive landscape |

## Study Archetypes

| Archetype | Primary Forces | Core Question |
|-----------|---------------|---------------|
| U&A (Usage & Attitudes) | Reinforcement Stability, Demand Gravity | How does the product fit into the consumer's daily life? |
| Brand Health | Demand Gravity, Reinforcement Stability | Does the brand have organic pull and community defense? |
| Market Entry | Choice Architecture, Competitive Energy, Demand Gravity | Where are incumbents failing and demand is unmet? |
| Competitive Pulse | Competitive Energy, Choice Architecture | What feature/narrative is causing brand switching? |
| Erosion Diagnosis | Reinforcement Stability, Value Elasticity, Competitive Energy | Why are users leaving — product failure, service, or pricing? |
| Pricing & Value | Value Elasticity, Choice Architecture | Does the brand have narrative equity to justify its premium? |

## MSU (Marginal Signal Utility) Stop Rule

The system monitors ingestion batches. When a new batch yields < 5% unique new signals, the system declares "Signal Saturation" and halts ingestion. This prevents over-extraction and wasted compute.

## IU (Investigation Unit) Economy

Each study session starts with 5,000 IUs. Emergent hypothesis nodes (AI-discovered) cost 50-100 IUs to unlock for investigation. This gates exploration depth and creates resource-allocation decisions for the researcher.

## Confidence Threshold

The system targets 85% confidence convergence. Go/No-Go recommendations only trigger when signal variance has stabilized to this level.

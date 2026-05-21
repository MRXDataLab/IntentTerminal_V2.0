"""
force_taxonomy.py — Canonical reference for the 5 Strategic Forces and their signal tags.
Source of truth: Outllyr-Force-SignalTag.csv

This module is the ONLY place forces and signal definitions live.
All other modules import from here.
"""

FORCES = {
    "Demand Gravity": {
        "color": "#f59e0b",
        "description": "The natural pull of a brand within a category — independent of paid push.",
        "signal_groups": [
            "awareness_salience_signals", "brand_salience", "category_salience",
            "brand_discovery", "brand_recall_language", "brand_mention_share",
            "interest_curiosity_signals", "product_curiosity", "feature_curiosity",
            "product_exploration", "research_behaviour",
            "consideration_signals", "product_consideration", "shortlisting_signals", "evaluation_initiation",
            "purchase_signals", "purchase_intent", "trial_intent", "first_time_purchase_intent",
            "upgrade_replacement_signals", "upgrade_intent", "replacement_intent", "product_lifecycle_signals",
            "demand_momentum_signals", "product_launch_interest", "topic_emergence", "feature_trend_signals",
        ]
    },
    "Choice Architecture Pressure": {
        "color": "#8b5cf6",
        "description": "How decision-making trade-offs resolve in a competitive environment.",
        "signal_groups": [
            "decision_complexity_signals", "choice_overload", "decision_paralysis", "option_abundance_language",
            "information_gap_signals", "information_seeking", "clarification_requests", "feature_understanding_questions",
            "advice_seeking_signals", "recommendation_requests", "peer_advice_seeking", "community_consultation",
            "decision_confidence_signals", "decision_uncertainty", "risk_concerns", "reliability_concerns",
            "evaluation_structure_signals", "pros_vs_cons_eval", "trade_off_discussion", "feature_importance_discussion",
            "decision_timing_signals", "purchase_delay_signals", "research_stage_signals",
        ]
    },
    "Value Elasticity Field": {
        "color": "#14b8a6",
        "description": "How price interacts with perceived utility — the price-to-value relationship.",
        "signal_groups": [
            "price_perception_signals", "price_perception", "price_sensitivity", "price_shock",
            "price_resistance", "price_acceptance",
            "value_evaluation_signals", "value_for_money", "feature_value_perception",
            "innovation_value", "performance_value",
            "cost_benefit_signals", "cost_justification", "roi_perception", "ownership_cost_discussion",
            "promotion_sensitivity_signals", "discount_expectation", "deal_sensitivity", "bundle_value_perception",
            "upgrade_value_signals", "upgrade_worthiness", "incremental_value_perception",
        ]
    },
    "Reinforcement Stability": {
        "color": "#f43f5e",
        "description": "Whether buyers strengthen or weaken brand equity post-purchase.",
        "signal_groups": [
            "satisfaction_signals", "experience_satisfaction", "delight_signals", "positive_experience_narratives",
            "product_reliability",
            "advocacy_signals", "brand_advocacy", "word_of_mouth_promotion", "brand_recommendation", "referral_behaviour",
            "brand_defense_signals", "brand_defense", "counter_argument_signals", "brand_justification",
            "habit_signals", "habitual_usage", "ecosystem_lock_in", "brand_routine_behaviour",
            "identity_signals", "community_identity", "brand_belonging", "tribe_language",
            "retention_signals", "repurchase_intent", "upgrade_loyalty", "long_term_ownership_narratives",
        ]
    },
    "Competitive Energy Field": {
        "color": "#0ea5e9",
        "description": "How external brands and structural shifts change evaluation dynamics.",
        "signal_groups": [
            "competitive_comparison_signals", "brand_comparison", "feature_comparison",
            "price_comparison", "ecosystem_comparison", "performance_comparison",
            "competitive_benchmark_signals", "market_leader_benchmarking", "category_standard_references",
            "switching_signals", "brand_switching_narratives", "migration_signals", "competitor_trial_signals",
            "competitive_advantage_signals", "feature_superiority_claims", "performance_superiority", "ecosystem_advantage",
            "competitive_weakness_signals", "competitor_complaints", "competitor_reliability_issues", "competitor_value_criticism",
            "market_position_signals", "category_leadership_signals", "underdog_narratives", "brand_positioning_language",
        ]
    },
}

FORCE_NAMES = list(FORCES.keys())
FORCE_COLORS = {name: f["color"] for name, f in FORCES.items()}

def get_all_signal_tags() -> list:
    """Return a flat list of all signal tags across all forces."""
    tags = []
    for force in FORCES.values():
        tags.extend(force["signal_groups"])
    return tags

def get_force_for_signal(tag: str) -> str | None:
    """Given a signal tag, return which force it belongs to."""
    for force_name, force_data in FORCES.items():
        if tag in force_data["signal_groups"]:
            return force_name
    return None


# ---------------------------------------------------------------------------
# Force slug mapping
# ---------------------------------------------------------------------------
# The five Strategic Forces use Title Case keys throughout the codebase
# (e.g. "Value Elasticity Field"), but downstream JSON artifacts (notably the
# Hypothesis Manifest) use snake_case slugs as stable identifiers. The mapping
# below provides bidirectional conversion. Keep `FORCE_SLUGS` in sync with the
# `FORCES` dict above.

FORCE_SLUGS: dict[str, str] = {
    "Demand Gravity":               "demand_gravity",
    "Choice Architecture Pressure": "choice_architecture_pressure",
    "Value Elasticity Field":       "value_elasticity_field",
    "Reinforcement Stability":      "reinforcement_stability",
    "Competitive Energy Field":     "competitive_energy_field",
}

SLUG_TO_FORCE: dict[str, str] = {slug: label for label, slug in FORCE_SLUGS.items()}


def force_label(slug: str) -> str:
    """Return the Title Case force label for a snake_case slug.

    Falls back to returning the slug unchanged when it is not a known force,
    so callers using this for human-readable display never crash on unexpected
    input. Use `SLUG_TO_FORCE` directly when strict lookup is required.
    """
    return SLUG_TO_FORCE.get(slug, slug)

"""
seeds.py — Known Entity Dictionary for the Confidence Sieve
This acts as a fast-path lookup for commonly known brands, platforms,
regulatory terms, and location signals. Any signal that matches here
gets 100% confidence without needing LLM verification.
"""

SEEDS: dict[str, dict] = {
    # Indian EV Brands
    "ola": {"label": "Ola Electric", "category": "EV Brand", "confidence": 1.0},
    "ola s1": {"label": "Ola S1 Scooter", "category": "EV Product", "confidence": 1.0},
    "ather": {"label": "Ather Energy", "category": "EV Brand", "confidence": 1.0},
    "ather 450x": {"label": "Ather 450X", "category": "EV Product", "confidence": 1.0},
    "tvs iqube": {"label": "TVS iQube", "category": "EV Product", "confidence": 1.0},
    "hero vida": {"label": "Hero Vida V1", "category": "EV Product", "confidence": 1.0},
    "bajaj chetak": {"label": "Bajaj Chetak", "category": "EV Product", "confidence": 1.0},
    "tata nexon ev": {"label": "Tata Nexon EV", "category": "EV Product", "confidence": 1.0},
    "ola futurefactory": {"label": "Ola FutureFactory", "category": "EV Infrastructure", "confidence": 1.0},

    # Delivery / Quick Commerce Platforms
    "blinkit": {"label": "Blinkit (Q-Commerce)", "category": "Quick Commerce", "confidence": 1.0},
    "zepto": {"label": "Zepto", "category": "Quick Commerce", "confidence": 1.0},
    "swiggy instamart": {"label": "Swiggy Instamart", "category": "Quick Commerce", "confidence": 1.0},
    "bigbasket": {"label": "BigBasket", "category": "E-Commerce", "confidence": 1.0},
    "amazon": {"label": "Amazon India", "category": "E-Commerce", "confidence": 1.0},
    "flipkart": {"label": "Flipkart", "category": "E-Commerce", "confidence": 1.0},

    # Automotive Research Platforms
    "team-bhp": {"label": "Team-BHP Forum", "category": "Auto Research Platform", "confidence": 1.0},
    "carwale": {"label": "CarWale", "category": "Auto Platform", "confidence": 1.0},
    "bikewale": {"label": "BikeWale", "category": "Auto Platform", "confidence": 1.0},
    "cardekho": {"label": "CarDekho", "category": "Auto Platform", "confidence": 1.0},

    # Resale / Secondary Market
    "olx": {"label": "OLX India", "category": "Resale Platform", "confidence": 1.0},
    "spinny": {"label": "Spinny", "category": "Used Car Platform", "confidence": 1.0},
    "cars24": {"label": "Cars24", "category": "Used Car Platform", "confidence": 1.0},

    # Policy / Regulatory
    "fame ii": {"label": "FAME II Scheme", "category": "Government Policy", "confidence": 1.0},
    "pli scheme": {"label": "PLI Scheme (Auto Sector)", "category": "Government Policy", "confidence": 1.0},
    "ev policy": {"label": "EV Policy India", "category": "Regulatory", "confidence": 1.0},
    "cem": {"label": "Clean Energy Ministerial", "category": "International Policy", "confidence": 1.0},

    # Social / Research Platforms
    "reddit": {"label": "Reddit", "category": "Social Platform", "confidence": 1.0},
    "youtube": {"label": "YouTube", "category": "Video Platform", "confidence": 1.0},
    "twitter": {"label": "X (Twitter)", "category": "Social Platform", "confidence": 1.0},
    "linkedin": {"label": "LinkedIn", "category": "Professional Network", "confidence": 1.0},
    "glassdoor": {"label": "Glassdoor", "category": "Talent Signal Platform", "confidence": 1.0},

    # Data & Research Agencies
    "nielsen": {"label": "Nielsen", "category": "Market Research Agency", "confidence": 1.0},
    "kantar": {"label": "Kantar", "category": "Market Research Agency", "confidence": 1.0},
    "statista": {"label": "Statista", "category": "Data Platform", "confidence": 1.0},
    "vahan": {"label": "VAHAN (Vehicle Registration DB)", "category": "Government Data", "confidence": 1.0},
    "google trends": {"label": "Google Trends", "category": "Search Platform", "confidence": 1.0},

    # Cities / Geographies
    "bengaluru": {"label": "Bengaluru", "category": "City", "confidence": 1.0},
    "bangalore": {"label": "Bengaluru", "category": "City", "confidence": 1.0},
    "mumbai": {"label": "Mumbai", "category": "City", "confidence": 1.0},
    "delhi": {"label": "Delhi NCR", "category": "City", "confidence": 1.0},
    "hyderabad": {"label": "Hyderabad", "category": "City", "confidence": 1.0},
    "pune": {"label": "Pune", "category": "City", "confidence": 1.0},
    "tier 1": {"label": "Tier 1 Cities", "category": "Market Segment", "confidence": 1.0},
    "tier 2": {"label": "Tier 2 Cities", "category": "Market Segment", "confidence": 1.0},
}

def lookup(signal_text: str) -> dict | None:
    """
    Fast-path lookup for known entities.
    Returns seed data if found (case-insensitive), else None.
    """
    key = signal_text.strip().lower()
    return SEEDS.get(key, None)

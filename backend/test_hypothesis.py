import sys
import json
from services.hypothesis_engine import generate_hypothesis_manifest

def run_test():
    intent = "I want to understand the adoption of EV cars in India, specifically looking at range anxiety."
    print(f"--- Running Hypothesis Engine for intent: {intent} ---")
    
    try:
        manifest = generate_hypothesis_manifest(
            intent=intent,
            pillar_extractions={
                "market_context": {"urgency": "High"},
                "target_lens": {"audience": "Indian middle class"}
            },
            pillar_scores=[{"label": "Market Context", "score": 90}]
        )
        print("\n=== HYPOTHESIS ENGINE OUTPUT ===")
        print(json.dumps(manifest, indent=2))
        
        if manifest.get("metadata", {}).get("validation_errors"):
            print("\nWARNING: Validation errors occurred!")
            
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    run_test()

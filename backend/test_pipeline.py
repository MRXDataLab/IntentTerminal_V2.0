import os
from api.intake import process_intake_chat, Message
from services.crawler import SourceOracle
from api.risk_detection import RiskDetector

def run_tests():
    print("--- Testing Intake ---")
    messages = [Message(role="user", content="I want to understand the adoption of EV cars in India, specifically looking at range anxiety.")]
    response = process_intake_chat(messages, fast_track=False)
    print("Agent Response:", response.response)
    print("Parameters:", [f"{p.label}: {p.score}" for p in response.parameters])
    print("Is Finalized:", response.is_finalized)
    
    print("\n--- Testing Crawler (SourceOracle) ---")
    nodes = ["Tesla Superchargers", "Tata Nexon EV", "Battery Swapping Startups"]
    oracle = SourceOracle()
    sources = oracle.discover_sources(nodes)
    print("Found Sources:")
    for s in sources:
        print(f"Node: {s.get('node')} | Platform: {s.get('platform')}")
        print(f"Strategy: {s.get('search_strategy')}")
        
    print("\n--- Testing Risk Detection ---")
    rd = RiskDetector()
    risks = rd.detect_blind_spots(nodes, sources)
    print("Identified Risks:")
    for r in risks:
        print(f"Type: {r.get('type')} | Severity: {r.get('severity')}")
        print(f"Desc: {r.get('description')}")
        print(f"Suggestion: {r.get('suggestion')}")

if __name__ == "__main__":
    run_tests()

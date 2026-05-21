from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from services.crawler import SourceOracle

router = APIRouter()
oracle = SourceOracle()

class CrawlPayload(BaseModel):
    graph_nodes: List[str]

@router.post("/discover")
def discover_and_audit(payload: CrawlPayload):
    # Step 4: Discover
    raw_sources = oracle.discover_sources(payload.graph_nodes)
    
    # Step 5: Audit 
    audited_sources = [oracle.audit_source(src) for src in raw_sources]
    
    # Sort by highest signal score
    ranked_sources = sorted(audited_sources, key=lambda x: x["signal_score"], reverse=True)
    
    # Step 6: Data Estimation (Metric Quantification)
    # Aggregate extractable data points
    total_extractable = sum([src["metrics"]["engagement_density"] for src in ranked_sources if src["status"] == "APPROVED"])
    
    return {
        "status": "success",
        "total_sources_found": len(raw_sources),
        "approved_sources": len([s for s in ranked_sources if s["status"] == "APPROVED"]),
        "scale_estimate": {
            "extractable_data_points": total_extractable,
            "estimated_time_to_ingest": f"~{min(total_extractable // 50, 60)} minutes"
        },
        "sources": ranked_sources[:20]  # Return top 20 for UI
    }

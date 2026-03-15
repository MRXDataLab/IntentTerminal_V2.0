from typing import List, Dict, Any

class MarginalSignalUtilityEngine:
    """
    Step 7: The Stop Rule (MSU)
    Detects Signal Saturation based on the < 5% new unique signals rule.
    """
    def __init__(self):
        self.total_signals_seen = set()
        self.batch_history = []
        
    def process_batch(self, batch_id: str, new_signals: List[str]) -> Dict[str, Any]:
        """
        Processes a batch of scraped signals (e.g., 200 comments).
        Returns whether the framework should Stop (Saturation Reached).
        """
        unique_in_batch = 0
        
        for sig in new_signals:
            if sig not in self.total_signals_seen:
                unique_in_batch += 1
                self.total_signals_seen.add(sig)
                
        # Calculate MSU
        total_in_batch = len(new_signals)
        msu_percentage = (unique_in_batch / total_in_batch) * 100 if total_in_batch > 0 else 0
        
        # The Stop Rule: If a new batch provides < 5% new unique signals, declare Saturation.
        is_saturated = msu_percentage < 5.0
        
        result = {
            "batch_id": batch_id,
            "total_processed": total_in_batch,
            "unique_found": unique_in_batch,
            "msu_percentage": round(msu_percentage, 2),
            "is_saturated": is_saturated,
            "action": "STOP_INGESTION" if is_saturated else "CONTINUE_INGESTION"
        }
        
        self.batch_history.append(result)
        return result

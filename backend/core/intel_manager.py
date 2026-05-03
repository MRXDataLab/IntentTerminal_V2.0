"""
Intel Manager — Session-scoped economy for the Outtlyr Intelligence Map.

Tracks Intel Unit (IU) balance per study session. Default: 5000 IUs.
Suggested hypotheses cost Intel Units to unlock for deeper investigation.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any


class IntelManager:
    def __init__(self, starting_balance: int = 5000):
        self._balance: int = starting_balance
        self._starting: int = starting_balance
        self._ledger: List[Dict[str, Any]] = []

    @property
    def balance(self) -> int:
        return self._balance

    def get_balance(self) -> Dict[str, Any]:
        return {
            "balance": self._balance,
            "starting_balance": self._starting,
            "spent": self._starting - self._balance,
            "allocations": len([e for e in self._ledger if e["type"] == "spend"]),
        }

    def spend(self, node_id: str, cost: int, reason: str = "") -> Dict[str, Any]:
        if cost <= 0:
            return {"success": False, "error": "Invalid cost", "balance": self._balance}
        if self._balance < cost:
            return {"success": False, "error": f"Insufficient Intel Units. Need {cost}, have {self._balance}.", "balance": self._balance}

        self._balance -= cost
        entry = {
            "type": "spend",
            "node_id": node_id,
            "cost": cost,
            "reason": reason,
            "balance_after": self._balance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._ledger.append(entry)
        return {"success": True, "deducted": cost, "balance": self._balance}

    def add(self, amount: int) -> Dict[str, Any]:
        if amount <= 0:
            return {"success": False, "error": "Amount must be positive"}
        self._balance += amount
        self._ledger.append({"type": "topup", "amount": amount, "balance_after": self._balance, "timestamp": datetime.now(timezone.utc).isoformat()})
        return {"success": True, "added": amount, "balance": self._balance}

    def get_ledger(self) -> List[Dict[str, Any]]:
        return list(self._ledger)


_session: IntelManager | None = None

def get_intel_manager(starting: int = 5000) -> IntelManager:
    global _session
    if _session is None:
        _session = IntelManager(starting)
    return _session

def reset_intel_manager(starting: int = 5000) -> IntelManager:
    global _session
    _session = IntelManager(starting)
    return _session

"""
IU (Investigation Unit) Manager — Session-scoped economy for the Living Truth Map.

Tracks IU balance per study session. Default starting balance: 5000 IUs.
Emergent nodes cost IUs to unlock for deeper investigation.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any


class IUManager:
    """Manages Investigation Unit balance and allocation ledger for a study session."""

    def __init__(self, starting_balance: int = 5000):
        self._balance: int = starting_balance
        self._starting_balance: int = starting_balance
        self._ledger: List[Dict[str, Any]] = []

    @property
    def balance(self) -> int:
        return self._balance

    def get_balance(self) -> Dict[str, Any]:
        """Return current IU state."""
        return {
            "balance": self._balance,
            "starting_balance": self._starting_balance,
            "total_spent": self._starting_balance - self._balance + sum(
                entry["amount"] for entry in self._ledger if entry["type"] == "topup"
            ),
            "total_allocations": len([e for e in self._ledger if e["type"] == "allocation"]),
        }

    def allocate(self, node_id: str, cost: int) -> Dict[str, Any]:
        """
        Deduct IUs for unlocking an emergent node.
        Returns success status and updated balance.
        """
        if cost <= 0:
            return {"success": False, "error": "Invalid cost", "balance": self._balance}

        if self._balance < cost:
            return {
                "success": False,
                "error": f"Insufficient IUs. Need {cost}, have {self._balance}.",
                "balance": self._balance,
            }

        self._balance -= cost
        entry = {
            "type": "allocation",
            "node_id": node_id,
            "amount": cost,
            "balance_after": self._balance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._ledger.append(entry)

        return {
            "success": True,
            "deducted": cost,
            "balance": self._balance,
            "allocation": entry,
        }

    def add_units(self, amount: int) -> Dict[str, Any]:
        """Add more IUs to the session balance."""
        if amount <= 0:
            return {"success": False, "error": "Amount must be positive", "balance": self._balance}

        self._balance += amount
        entry = {
            "type": "topup",
            "amount": amount,
            "balance_after": self._balance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._ledger.append(entry)

        return {
            "success": True,
            "added": amount,
            "balance": self._balance,
        }

    def get_ledger(self) -> List[Dict[str, Any]]:
        """Return the full allocation/topup history."""
        return list(self._ledger)


# ── Session-scoped singleton ──────────────────────────────────────────────────
# In Module 1 (single-user, no auth), we use a module-level instance.
# Module 3 would replace this with a database-backed per-user store.

_session_manager: IUManager | None = None


def get_iu_manager(starting_balance: int = 5000) -> IUManager:
    """Get or create the session-scoped IU manager."""
    global _session_manager
    if _session_manager is None:
        _session_manager = IUManager(starting_balance=starting_balance)
    return _session_manager


def reset_iu_manager(starting_balance: int = 5000) -> IUManager:
    """Reset the IU manager (e.g., for a new study)."""
    global _session_manager
    _session_manager = IUManager(starting_balance=starting_balance)
    return _session_manager

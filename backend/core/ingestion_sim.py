"""
Ingestion Simulator — Simulates live data ingestion for the Living Truth Map.

In Module 1 (no real scrapers), this drives per-node state transitions
and convergence tracking to power the frontend's live animations.
Convergence target: 85% confidence (matching manifest stop_rules).
"""

import time
import random
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional


# Node lifecycle states
NODE_STATES = ["pending", "deploying", "ingesting", "converging", "converged"]

# Tooltip messages that cycle during ingestion
INGESTION_TOOLTIPS = [
    "Deploying scrapers to target platforms...",
    "Ingesting Reddit threads...",
    "Scanning YouTube comment clusters...",
    "Parsing Amazon review sentiment...",
    "Cross-correlating source signals...",
    "Correlating YouTube Sentiment...",
    "Detecting emergent switching narratives...",
    "Mapping competitive energy vectors...",
    "Analyzing regret cluster density...",
    "Variance stabilizing across sources...",
    "Validating hypothesis confidence...",
    "Variance stabilized. Hypothesis Validated.",
]


class NodeState:
    """Tracks the ingestion state of a single node."""

    def __init__(self, node_id: str, node_label: str, node_type: str):
        self.node_id = node_id
        self.node_label = node_label
        self.node_type = node_type
        self.state = "pending"
        self.progress = 0.0  # 0.0 to 1.0
        self.sentiment_score: Optional[float] = None  # -1.0 to 1.0, None if not yet ingested
        self.signal_density: int = 0  # count of signals found
        self.last_updated = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "node_label": self.node_label,
            "node_type": self.node_type,
            "state": self.state,
            "progress": round(self.progress, 2),
            "sentiment_score": round(self.sentiment_score, 2) if self.sentiment_score is not None else None,
            "signal_density": self.signal_density,
            "last_updated": self.last_updated,
        }


class IngestionSimulator:
    """
    Simulates the live ingestion pipeline for Module 1.
    Transitions nodes through states over time, tracking convergence toward 85%.
    """

    def __init__(self, confidence_threshold: float = 0.85):
        self._nodes: Dict[str, NodeState] = {}
        self._confidence_threshold = confidence_threshold
        self._convergence: float = 0.0
        self._tooltip_index: int = 0
        self._started = False
        self._lock = threading.Lock()

    def initialize(self, topology_nodes: List[Dict[str, Any]]) -> None:
        """Load nodes from the truth map topology."""
        with self._lock:
            self._nodes.clear()
            self._convergence = 0.0
            self._tooltip_index = 0
            for node in topology_nodes:
                node_id = node.get("id", "")
                node_type = node.get("type", "")
                # Source terrain nodes start ingesting immediately
                # Explicit hypotheses start after a delay
                # Emergent nodes stay pending until unlocked
                ns = NodeState(
                    node_id=node_id,
                    node_label=node.get("label", node_id),
                    node_type=node_type,
                )
                if node_type == "source_terrain":
                    ns.state = "ingesting"
                elif node_type == "explicit_hypothesis":
                    ns.state = "deploying"
                elif node_type == "suggested_hypothesis":
                    ns.state = "pending"  # Stays pending until IU unlock
                else:
                    ns.state = "deploying"
                self._nodes[node_id] = ns

    def tick(self) -> Dict[str, Any]:
        """
        Advance the simulation by one tick. Call this periodically (e.g., every 3s).
        Returns the current convergence state.
        """
        with self._lock:
            active_count = 0
            converged_count = 0

            for ns in self._nodes.values():
                if ns.state == "converged":
                    converged_count += 1
                    active_count += 1
                    continue

                if ns.state == "pending":
                    continue  # Locked emergent nodes don't progress

                active_count += 1

                if ns.state == "deploying":
                    # Transition to ingesting after a simulated deploy
                    ns.state = "ingesting"
                    ns.progress = 0.05
                    ns.last_updated = datetime.now(timezone.utc).isoformat()

                elif ns.state == "ingesting":
                    # Progress increases with some randomness
                    increment = random.uniform(0.08, 0.20)
                    ns.progress = min(ns.progress + increment, 1.0)
                    ns.signal_density += random.randint(5, 25)

                    # Assign sentiment as signals come in
                    if ns.sentiment_score is None:
                        ns.sentiment_score = random.uniform(-0.8, 0.3)
                    else:
                        # Sentiment refines over time
                        ns.sentiment_score += random.uniform(-0.05, 0.05)
                        ns.sentiment_score = max(-1.0, min(1.0, ns.sentiment_score))

                    if ns.progress >= 0.75:
                        ns.state = "converging"

                    ns.last_updated = datetime.now(timezone.utc).isoformat()

                elif ns.state == "converging":
                    increment = random.uniform(0.03, 0.10)
                    ns.progress = min(ns.progress + increment, 1.0)
                    ns.signal_density += random.randint(1, 8)

                    if ns.progress >= 1.0:
                        ns.state = "converged"
                        ns.progress = 1.0

                    ns.last_updated = datetime.now(timezone.utc).isoformat()

            # Calculate overall convergence
            if active_count > 0:
                self._convergence = min(
                    (converged_count / active_count) * self._confidence_threshold + 
                    sum(ns.progress for ns in self._nodes.values() if ns.state != "pending") / max(active_count, 1) * 0.15,
                    self._confidence_threshold
                )
            else:
                self._convergence = 0.0

            # Cycle tooltip
            self._tooltip_index = (self._tooltip_index + 1) % len(INGESTION_TOOLTIPS)

            return self._get_convergence_state_unlocked()

    def unlock_node(self, node_id: str) -> bool:
        """Transition an emergent node from pending to deploying (after IU payment)."""
        with self._lock:
            ns = self._nodes.get(node_id)
            if ns and ns.state == "pending":
                ns.state = "deploying"
                ns.last_updated = datetime.now(timezone.utc).isoformat()
                return True
            return False

    def get_node_state(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Get the current state of a specific node."""
        with self._lock:
            ns = self._nodes.get(node_id)
            return ns.to_dict() if ns else None

    def get_all_states(self) -> Dict[str, Dict[str, Any]]:
        """Get states for all nodes."""
        with self._lock:
            return {nid: ns.to_dict() for nid, ns in self._nodes.items()}

    def _get_convergence_state_unlocked(self) -> Dict[str, Any]:
        """Internal: Return convergence state without acquiring lock (caller must hold lock)."""
        convergence_pct = int(self._convergence * 100)
        return {
            "convergence_pct": min(convergence_pct, 85),
            "confidence_threshold": int(self._confidence_threshold * 100),
            "active_tooltip": INGESTION_TOOLTIPS[self._tooltip_index],
            "node_states": {nid: ns.to_dict() for nid, ns in self._nodes.items()},
            "summary": {
                "total": len(self._nodes),
                "pending": sum(1 for ns in self._nodes.values() if ns.state == "pending"),
                "ingesting": sum(1 for ns in self._nodes.values() if ns.state in ("deploying", "ingesting")),
                "converging": sum(1 for ns in self._nodes.values() if ns.state == "converging"),
                "converged": sum(1 for ns in self._nodes.values() if ns.state == "converged"),
            },
        }

    def get_convergence_state(self) -> Dict[str, Any]:
        """Return the overall convergence state for the frontend."""
        with self._lock:
            return self._get_convergence_state_unlocked()


# ── Session-scoped singleton ──────────────────────────────────────────────────

_session_simulator: IngestionSimulator | None = None


def get_ingestion_simulator() -> IngestionSimulator:
    """Get or create the session-scoped ingestion simulator."""
    global _session_simulator
    if _session_simulator is None:
        _session_simulator = IngestionSimulator(confidence_threshold=0.85)
    return _session_simulator


def reset_ingestion_simulator() -> IngestionSimulator:
    """Reset the simulator (e.g., for a new study)."""
    global _session_simulator
    _session_simulator = IngestionSimulator(confidence_threshold=0.85)
    return _session_simulator

"""
kb_loader.py — Knowledge Base Document Loader

Loads agent instruction documents from the kb/ directory.
Documents are cached in memory after first read (cold-start fetch).
Cache is invalidated if the file's mtime changes (hot-reload support).

Usage:
    from kb.kb_loader import load_kb
    prompt = load_kb("agents/intake_agent.md")
"""

import os
import pathlib
from typing import Dict, Tuple

# In-memory cache: filepath -> (mtime, content)
_cache: Dict[str, Tuple[float, str]] = {}

# Root directory for KB files (same level as this file)
_KB_ROOT = pathlib.Path(__file__).parent


def load_kb(relative_path: str) -> str:
    """
    Load a KB document by its path relative to the kb/ directory.
    
    Examples:
        load_kb("agents/intake_agent.md")
        load_kb("agents/intake_archetypes/brand_health.md")
        load_kb("shared/globals.md")
    
    Returns:
        The full text content of the KB document.
    
    Raises:
        FileNotFoundError: If the KB document does not exist.
    """
    full_path = _KB_ROOT / relative_path
    
    if not full_path.exists():
        raise FileNotFoundError(
            f"KB document not found: {relative_path} "
            f"(looked in {full_path})"
        )
    
    abs_path = str(full_path.resolve())
    current_mtime = full_path.stat().st_mtime
    
    # Check cache: return cached version if file hasn't changed
    if abs_path in _cache:
        cached_mtime, cached_content = _cache[abs_path]
        if cached_mtime == current_mtime:
            return cached_content
    
    # Read and cache
    content = full_path.read_text(encoding="utf-8")
    _cache[abs_path] = (current_mtime, content)
    
    return content


def invalidate_cache(relative_path: str = None) -> None:
    """
    Invalidate the KB cache.
    
    Args:
        relative_path: If provided, only invalidate this specific document.
                       If None, invalidate the entire cache.
    """
    global _cache
    if relative_path is None:
        _cache.clear()
    else:
        full_path = str((_KB_ROOT / relative_path).resolve())
        _cache.pop(full_path, None)


def get_kb_version(relative_path: str) -> str:
    """
    Get a version identifier for a KB document (based on mtime).
    Useful for audit trail stamping.
    """
    full_path = _KB_ROOT / relative_path
    if not full_path.exists():
        return "not_found"
    return str(full_path.stat().st_mtime)

from __future__ import annotations


def escape_like(s: str) -> str:
    """Escapa wildcards SQL (\\, %, _) pra busca literal."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


__all__ = ["escape_like"]

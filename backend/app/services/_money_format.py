"""Money/date formatting helpers for the invoice PDF (plan §4).

Decimal-only money formatting — ``float`` is never used so binary rounding
artifacts cannot leak into a financial document. All amounts are quantized to
2 decimal places with ``ROUND_HALF_UP`` and rendered with a thousands
separator, e.g. ``format_usd(Decimal("1234.5")) -> "$1,234.50"``.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

_TWO_PLACES = Decimal("0.01")


def _quantize(value: Decimal | int | str) -> Decimal:
    """Coerce to ``Decimal`` and quantize to 2dp (ROUND_HALF_UP)."""
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:  # pragma: no cover
        raise ValueError(f"not a valid money value: {value!r}") from exc
    return dec.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def format_usd(value: Decimal | int | str) -> str:
    """Format a Decimal USD amount as ``"$1,234.56"``.

    Args:
        value: The amount. ``Decimal`` is preferred; ``int``/``str`` are coerced
            via ``Decimal(str(...))``. ``float`` is intentionally NOT accepted as
            a first-class input — pass Decimals only.

    Returns:
        The amount with a leading ``$``, thousands separators, exactly 2 decimal
        places, and a leading ``-`` before the ``$`` for negative values
        (e.g. ``"-$44.00"``).
    """
    amount = _quantize(value)
    sign = "-" if amount < 0 else ""
    # Format the absolute integer cents to avoid float; `,` adds grouping.
    abs_amount = -amount if amount < 0 else amount
    return f"{sign}${abs_amount:,.2f}"


def format_qty(value: Decimal | int | str) -> str:
    """Format a quantity, trimming trailing zeros (e.g. ``1`` not ``1.0000``)."""
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:  # pragma: no cover
        raise ValueError(f"not a valid quantity: {value!r}") from exc
    normalized = dec.normalize()
    # `normalize()` can yield scientific notation for integers (e.g. 1E+1);
    # fall back to a fixed-point string in that case.
    text = format(normalized, "f")
    return text


def format_percent(value: Decimal | int | str) -> str:
    """Format a tax-rate percentage, trimming trailing zeros (``10`` / ``7.5``)."""
    return format_qty(value)


def format_date(value: date | str | None) -> str:
    """Format a date as ``"Jan 09, 2026"``; empty string for ``None``."""
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value)
        except ValueError:
            return value
    return value.strftime("%b %d, %Y")


__all__ = ["format_usd", "format_qty", "format_percent", "format_date"]

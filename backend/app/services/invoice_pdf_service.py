"""Invoice PDF rendering (plan §4).

Renders the commercial invoice to a PDF from the invoice's FROZEN snapshots
(``issuer_snapshot_json`` / ``customer_snapshot_json``) — never from a live join
— and persists it under ``{UPLOAD_DIR}/invoices/{YYYY}/{MM}/{uuid4hex}.pdf``.

Graceful-degrade seam (plan §4): the caller ``invoice_service.issue()`` invokes
``render_and_persist`` inside ``try/except (ImportError, NotImplementedError,
OSError)`` and still commits the issued invoice with ``pdf_path=NULL`` on
failure. Two consequences are load-bearing here:

  * Importing this module must NEVER import WeasyPrint (its native cairo/pango
    libs are absent on dev macOS and raise ``OSError`` at import). WeasyPrint is
    therefore imported lazily inside ``render_and_persist``.
  * ``render_and_persist`` must RAISE (not swallow) ``ImportError``/``OSError``
    when the libs are unavailable, so the seam can degrade. Only the actual
    persistence path runs when WeasyPrint is importable (validated in Docker).

Security hardening (plan §4 / §7): Jinja2 ``autoescape`` is on (no ``|safe``)
and WeasyPrint's ``url_fetcher`` is locked to a no-op that refuses every URL —
closing SSRF and local-file disclosure (the document is fully self-contained;
it references no external/remote/``file://`` resources).
"""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Invoice
from app.schemas.invoice import CustomerSnapshot, IssuerSnapshot
from app.services import file_storage
from app.services._money_format import (
    format_date,
    format_percent,
    format_qty,
    format_usd,
)

# Resolve the templates dir relative to THIS module (never CWD): app/templates.
_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

# Module-level Jinja2 environment. autoescape is mandatory — every dynamic
# value in the template is HTML-escaped; the template never uses ``|safe``.
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _net_n_label(issue_date: date | None, due_date: date | None) -> str:
    """Best-effort "Net N" terms label derived from issue/due dates."""
    if issue_date is None or due_date is None:
        return "Due on receipt"
    days = (due_date - issue_date).days
    if days <= 0:
        return "Due on receipt"
    return f"Net {days}"


def _service_period(start: date | str | None, end: date | str | None) -> str:
    s = format_date(start)
    e = format_date(end)
    if s and e:
        return f"{s} – {e}"
    return s or e


def _has_intermediary(issuer: IssuerSnapshot) -> bool:
    """Intermediary block is shown only when a US correspondent is configured.

    Mirrors the issuer-profile guard: a usable intermediary requires at least a
    bank name + SWIFT/BIC.
    """
    return bool(issuer.intermediary_bank_name and issuer.intermediary_swift_bic)


def build_context(invoice: Invoice) -> dict[str, Any]:
    """Build the fully pre-formatted template context from frozen snapshots.

    ALL money is rendered to ``"$..."`` strings here via ``format_usd`` (the
    template performs no arithmetic and no formatting). Reads exclusively from
    ``issuer_snapshot_json`` / ``customer_snapshot_json`` — the PDF is a faithful
    reproduction of the document as issued, immune to later profile/customer
    edits (plan §2.4).
    """
    issuer = IssuerSnapshot.model_validate(invoice.issuer_snapshot_json or {})
    customer = CustomerSnapshot.model_validate(invoice.customer_snapshot_json or {})

    # snapshot_version branch point (plan §4 "Branch on snapshot_version"). v1 is
    # the only schema today; future versions map their shape here.
    if issuer.snapshot_version != 1 or customer.snapshot_version != 1:  # pragma: no cover
        raise ValueError(
            f"unsupported snapshot_version "
            f"(issuer={issuer.snapshot_version}, customer={customer.snapshot_version})"
        )

    # ── Line items (sorted by stored position; money pre-formatted) ──────────
    line_items_ctx: list[dict[str, str]] = []
    for li in sorted(invoice.line_items, key=lambda x: x.position):
        line_total = Decimal(li.line_subtotal) + Decimal(li.line_tax)
        line_items_ctx.append(
            {
                "description": li.description,
                "quantity": format_qty(li.quantity),
                "unit_price": format_usd(li.unit_price),
                "tax_label": f"{format_percent(li.tax_rate)}%",
                "line_total": format_usd(line_total),
            }
        )

    # ── Totals (Decimal in DB → "$..." strings) ──────────────────────────────
    discount_total = Decimal(invoice.discount_total)
    totals_ctx = {
        "subtotal": format_usd(invoice.subtotal),
        "discount_total": format_usd(discount_total),
        "has_discount": discount_total > 0,
        "tax_total": format_usd(invoice.tax_total),
        "total": format_usd(invoice.total),
    }

    # ── Contract block (from the customer snapshot) ──────────────────────────
    contract_ctx: dict[str, Any] | None = None
    if customer.contract is not None:
        contract_ctx = {
            "reference": customer.contract.reference,
            "title": customer.contract.title,
            "contract_date": format_date(customer.contract.contract_date),
            "scope_description": customer.contract.scope_description,
        }

    # Service period: prefer the contract's, fall back to the invoice's own.
    if customer.contract is not None and (
        customer.contract.service_period_start or customer.contract.service_period_end
    ):
        service_period = _service_period(
            customer.contract.service_period_start,
            customer.contract.service_period_end,
        )
    else:
        service_period = _service_period(
            invoice.service_period_start, invoice.service_period_end
        )

    # ── Intermediary (conditional US correspondent) ──────────────────────────
    intermediary_ctx: dict[str, Any] | None = None
    if _has_intermediary(issuer):
        intermediary_ctx = {
            "bank_name": issuer.intermediary_bank_name,
            "swift_bic": issuer.intermediary_swift_bic,
            "account_number": issuer.intermediary_account_number,
            "bank_country": issuer.intermediary_bank_country or "US",
        }

    return {
        "number": invoice.number,
        "issue_date": format_date(invoice.issue_date),
        "due_date": format_date(invoice.due_date),
        "terms_label": _net_n_label(invoice.issue_date, invoice.due_date),
        "service_period": service_period,
        "po_number": invoice.po_number,
        "notes": invoice.notes,
        "terms_text": invoice.terms,
        "issuer": issuer,
        "customer": customer,
        "contract": contract_ctx,
        "line_items": line_items_ctx,
        "totals": totals_ctx,
        "intermediary": intermediary_ctx,
        "tax_status_note": issuer.tax_status_note,
    }


def render_html(invoice: Invoice) -> str:
    """Render the invoice template to an HTML string (no PDF / native libs)."""
    template = _env.get_template("invoice.html")
    return template.render(build_context(invoice))


def _locked_url_fetcher(url: str, *args: Any, **kwargs: Any):
    """Refuse every URL. The document is self-contained — no remote fetch, no
    ``file://`` read. Closes SSRF + local-file disclosure (plan §4 / §7)."""
    raise ValueError(f"external resource fetching is disabled (refused: {url})")


def render_and_persist(db: Session, invoice_id: int) -> None:
    """Render the invoice PDF and persist ``pdf_path``/``pdf_sha256``/
    ``pdf_generated_at`` on the invoice, then ``db.flush()`` (the caller
    ``issue()`` owns the commit).

    Raises ``ImportError``/``OSError`` when WeasyPrint or its native libs are
    unavailable so the issue() seam degrades to ``pdf_path=NULL`` (plan §4).
    """
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise ValueError(f"invoice {invoice_id} not found")

    html = render_html(invoice)

    # Lazy import: keeps this module importable where the native libs are absent
    # (dev macOS). The OSError raised here is exactly what issue() catches.
    import weasyprint  # noqa: PLC0415

    document = weasyprint.HTML(
        string=html,
        base_url=str(_TEMPLATES_DIR),
        url_fetcher=_locked_url_fetcher,
    )
    pdf_bytes: bytes = document.write_pdf()

    issue_date = invoice.issue_date or date.today()
    rel_path, _mime, _size = file_storage.save_invoice_pdf_bytes(
        pdf_bytes, settings.UPLOAD_DIR, issue_date
    )

    invoice.pdf_path = rel_path
    invoice.pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    invoice.pdf_generated_at = datetime.now(UTC)
    db.flush()


__all__ = ["render_and_persist", "render_html", "build_context"]

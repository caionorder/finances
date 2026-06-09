from __future__ import annotations

import base64
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Contract,
    Customer,
    Invoice,
    InvoiceLineItem,
    InvoiceNumberSequence,
    IssuerProfile,
    Receivable,
    User,
)
from app.models.enums import InvoiceStatus
from app.schemas.common import CursorPage
from app.schemas.invoice import (
    CustomerContractSnapshot,
    CustomerSnapshot,
    InvoiceAgingBucket,
    InvoiceCreate,
    InvoiceFromContractRequest,
    InvoiceLineItemCreate,
    InvoiceLineItemOut,
    InvoiceOut,
    InvoiceOutstandingSummary,
    InvoiceStatusFilter,
    InvoiceUpdate,
    IssuerSnapshot,
)
from app.services import audit_service, issuer_profile_service, receivable_service

logger = logging.getLogger(__name__)

_TWO_PLACES = Decimal("0.01")
# Max number-allocation attempts on a uq_invoices_number collision (H2).
_ISSUE_MAX_ATTEMPTS = 2


def _today_utc() -> date:
    """UTC calendar date — keeps aging/overdue aligned with UTC lifecycle stamps (M4)."""
    return datetime.now(UTC).date()

# Header fields a client may set on create. Server-assigned fields (number,
# status, totals, issued_at, snapshots, pdf_*) are NEVER in this list (H4).
_HEADER_FIELDS = (
    "customer_id",
    "contract_id",
    "category_id",
    "issue_date",
    "due_date",
    "service_period_start",
    "service_period_end",
    "po_number",
    "terms",
    "notes",
)


def _round2(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Cursor helpers
# ---------------------------------------------------------------------------


def _encode_cursor(value: int) -> str:
    return base64.urlsafe_b64encode(str(value).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        return int(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------


def _compute_line(item: InvoiceLineItem) -> tuple[Decimal, Decimal]:
    line_subtotal = _round2(Decimal(item.quantity) * Decimal(item.unit_price))
    line_tax = _round2(line_subtotal * Decimal(item.tax_rate) / Decimal("100"))
    return line_subtotal, line_tax


def _compute_totals(
    line_items: list[InvoiceLineItem], discount_total: Decimal
) -> dict[str, Decimal]:
    """Decimal totals, ROUND_HALF_UP at 2dp (plan §3.5). Server-authoritative."""
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for item in line_items:
        line_subtotal, line_tax = _compute_line(item)
        item.line_subtotal = line_subtotal
        item.line_tax = line_tax
        subtotal += line_subtotal
        tax_total += line_tax

    subtotal = _round2(subtotal)
    tax_total = _round2(tax_total)
    discount = _round2(Decimal(discount_total))
    if discount > subtotal:
        discount = subtotal
    total = _round2(subtotal - discount + tax_total)
    return {
        "subtotal": subtotal,
        "tax_total": tax_total,
        "discount_total": discount,
        "total": total,
    }


def _apply_totals(invoice: Invoice) -> None:
    """Recompute and store totals on a (draft) invoice from its line items."""
    totals = _compute_totals(invoice.line_items, invoice.discount_total)
    invoice.subtotal = totals["subtotal"]
    invoice.tax_total = totals["tax_total"]
    invoice.discount_total = totals["discount_total"]
    invoice.total = totals["total"]


# ---------------------------------------------------------------------------
# Output mapping
# ---------------------------------------------------------------------------


def _is_overdue(
    invoice: Invoice,
    db: Session | None = None,
    received_map: dict[int, date | None] | None = None,
) -> bool:
    if invoice.status not in (InvoiceStatus.issued, InvoiceStatus.sent):
        return False
    if invoice.due_date >= _today_utc():
        return False
    # Unsettled if no linked receivable, or the linked receivable is unsettled.
    if invoice.receivable_id is None:
        return True
    # Prefer the batch-loaded map (list path, avoids N+1); fall back to a direct
    # fetch for single-object callers.
    if received_map is not None:
        return received_map.get(invoice.receivable_id) is None
    if db is not None:
        receivable = db.get(Receivable, invoice.receivable_id)
        if receivable is not None and receivable.received_at is not None:
            return False
    return True


def to_out(
    invoice: Invoice,
    db: Session | None = None,
    received_map: dict[int, date | None] | None = None,
) -> InvoiceOut:
    net_amount = _round2(Decimal(invoice.total) - Decimal(invoice.bank_fee_amount))
    line_items = [
        InvoiceLineItemOut.model_validate(li)
        for li in sorted(invoice.line_items, key=lambda x: x.position)
    ]
    return InvoiceOut(
        id=invoice.id,
        number=invoice.number,
        status=invoice.status,
        overdue=_is_overdue(invoice, db, received_map),
        customer_id=invoice.customer_id,
        contract_id=invoice.contract_id,
        category_id=invoice.category_id,
        receivable_id=invoice.receivable_id,
        currency_code=invoice.currency_code,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        service_period_start=invoice.service_period_start,
        service_period_end=invoice.service_period_end,
        subtotal=invoice.subtotal,
        discount_total=invoice.discount_total,
        tax_total=invoice.tax_total,
        total=invoice.total,
        bank_fee_amount=invoice.bank_fee_amount,
        net_amount=net_amount,
        po_number=invoice.po_number,
        terms=invoice.terms,
        notes=invoice.notes,
        void_reason=invoice.void_reason,
        pdf_path=invoice.pdf_path,
        pdf_generated_at=invoice.pdf_generated_at,
        issued_at=invoice.issued_at,
        sent_at=invoice.sent_at,
        voided_at=invoice.voided_at,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        line_items=line_items,
    )


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def _assert_can(invoice: Invoice, action: str) -> None:
    """Centralize lifecycle guards. Violations → 409."""
    s = invoice.status
    if action in ("update", "delete"):
        if s != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"invoice can only be {action}d while in 'draft' status",
            )
    elif action == "issue":
        if s != InvoiceStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="only draft invoices can be issued",
            )
    elif action == "mark_sent":
        if s not in (InvoiceStatus.issued, InvoiceStatus.sent):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="only issued invoices can be marked sent",
            )
    elif action == "mark_received":
        if s not in (InvoiceStatus.issued, InvoiceStatus.sent):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="only issued/sent invoices can be marked received",
            )
    elif action == "unmark_received":
        if s != InvoiceStatus.paid:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="only paid invoices can be unmarked",
            )
    elif action == "void":
        if s not in (InvoiceStatus.issued, InvoiceStatus.sent):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="only issued/sent invoices can be voided (unmark a paid invoice first)",
            )


# ---------------------------------------------------------------------------
# List / get
# ---------------------------------------------------------------------------


def list_invoices(
    db: Session,
    user: User,
    status_filter: InvoiceStatusFilter | None = None,
    customer_id: int | None = None,
    from_due_date: date | None = None,
    to_due_date: date | None = None,
    search: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> CursorPage[InvoiceOut]:
    """List invoices. Globally visible to any authenticated user (decision #6)."""
    # selectinload(line_items) avoids the per-row lazy load (H1).
    stmt = select(Invoice).options(selectinload(Invoice.line_items))

    today = _today_utc()
    if status_filter == "overdue":
        stmt = stmt.where(
            Invoice.status.in_([InvoiceStatus.issued, InvoiceStatus.sent]),
            Invoice.due_date < today,
        )
    elif status_filter is not None:
        stmt = stmt.where(Invoice.status == InvoiceStatus(status_filter))

    if customer_id is not None:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if from_due_date is not None:
        stmt = stmt.where(Invoice.due_date >= from_due_date)
    if to_due_date is not None:
        stmt = stmt.where(Invoice.due_date <= to_due_date)
    if search:
        stmt = stmt.where(Invoice.number.ilike(f"%{search}%"))

    if cursor is not None:
        stmt = stmt.where(Invoice.id < _decode_cursor(cursor))

    stmt = stmt.order_by(Invoice.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    # Batch-load the linked receivables' received_at in one IN(...) query so
    # `overdue` derivation in to_out does not fire a query per row (H1).
    received_map = _load_received_map(db, items)

    return CursorPage[InvoiceOut](
        items=[to_out(inv, db, received_map) for inv in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def _load_received_map(
    db: Session, invoices: list[Invoice]
) -> dict[int, date | None]:
    """Map ``receivable_id -> received_at`` for the page's linked receivables."""
    ids = [inv.receivable_id for inv in invoices if inv.receivable_id is not None]
    if not ids:
        return {}
    rows = db.execute(
        select(Receivable.id, Receivable.received_at).where(Receivable.id.in_(ids))
    ).all()
    return {rid: received_at for rid, received_at in rows}


def get(db: Session, user: User, invoice_id: int) -> Invoice:
    """Fetch an invoice. Globally readable (any authenticated user)."""
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invoice not found")
    return invoice


# ---------------------------------------------------------------------------
# Draft create / update / delete
# ---------------------------------------------------------------------------


def _ensure_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer not found")
    return customer


def _build_line_items(items: list[InvoiceLineItemCreate]) -> list[InvoiceLineItem]:
    rows: list[InvoiceLineItem] = []
    for position, src in enumerate(items):
        line = InvoiceLineItem(
            position=position,
            description=src.description,
            quantity=src.quantity,
            unit_price=src.unit_price,
            tax_rate=src.tax_rate,
            line_subtotal=Decimal("0"),
            line_tax=Decimal("0"),
        )
        rows.append(line)
    return rows


def create_draft(db: Session, payload: InvoiceCreate, user: User) -> Invoice:
    _ensure_customer(db, payload.customer_id)
    if payload.contract_id is not None and db.get(Contract, payload.contract_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="contract not found")

    invoice = Invoice(
        status=InvoiceStatus.draft,
        customer_id=payload.customer_id,
        contract_id=payload.contract_id,
        category_id=payload.category_id,
        currency_code="USD",
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        service_period_start=payload.service_period_start,
        service_period_end=payload.service_period_end,
        discount_total=_round2(payload.discount_total),
        po_number=payload.po_number,
        terms=payload.terms,
        notes=payload.notes,
        bank_fee_amount=Decimal("0"),
        created_by_user_id=user.id,
    )
    invoice.line_items = _build_line_items(payload.line_items)
    _apply_totals(invoice)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_from_contract(db: Session, payload: InvoiceFromContractRequest, user: User) -> Invoice:
    contract = db.get(Contract, payload.contract_id)
    if contract is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="contract not found")
    if not contract.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="contract is not active",
        )

    due_date = payload.due_date or (_today_utc() + _days(contract.payment_terms_days))

    line_desc = contract.scope_description or contract.title
    # A contract may have no agreed_rate yet; seed 0 so the user can fill it in.
    # Issuing a $0-total invoice is blocked at issue() (would yield a negative
    # net receivable, M3).
    unit_price = contract.agreed_rate if contract.agreed_rate is not None else Decimal("0")

    invoice = Invoice(
        status=InvoiceStatus.draft,
        customer_id=contract.customer_id,
        contract_id=contract.id,
        category_id=None,
        currency_code="USD",
        issue_date=None,
        due_date=due_date,
        service_period_start=contract.service_period_start,
        service_period_end=contract.service_period_end,
        discount_total=_round2(contract.default_discount),
        bank_fee_amount=Decimal("0"),
        created_by_user_id=user.id,
    )
    invoice.line_items = [
        InvoiceLineItem(
            position=0,
            description=line_desc[:500],
            quantity=Decimal("1"),
            unit_price=unit_price,
            tax_rate=contract.default_tax_rate,
            line_subtotal=Decimal("0"),
            line_tax=Decimal("0"),
        )
    ]
    _apply_totals(invoice)
    db.add(invoice)

    # Advance the contract's next period cursor by the covered span (decision §3.4).
    if contract.next_period_start is not None:
        contract.next_period_start = _advance_period(
            contract.next_period_start,
            contract.service_period_start,
            contract.service_period_end,
        )

    db.commit()
    db.refresh(invoice)
    return invoice


def _days(n: int) -> timedelta:
    return timedelta(days=n)


def _advance_period(next_start: date, period_start: date | None, period_end: date | None):
    """Advance ``next_period_start`` by the configured period length (best-effort)."""
    if period_start is not None and period_end is not None:
        span = (period_end - period_start).days + 1
        return next_start + _days(span)
    # Default: advance by ~one month (30 days) when no explicit span.
    return next_start + _days(30)


def update_draft(db: Session, invoice: Invoice, payload: InvoiceUpdate, user: User) -> Invoice:
    _assert_can(invoice, "update")
    data = payload.model_dump(exclude_unset=True)

    if "customer_id" in data and data["customer_id"] is not None:
        _ensure_customer(db, data["customer_id"])
    if "contract_id" in data and data["contract_id"] is not None:
        if db.get(Contract, data["contract_id"]) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="contract not found"
            )

    for field in _HEADER_FIELDS:
        if field in data:
            setattr(invoice, field, data[field])
    if "discount_total" in data and data["discount_total"] is not None:
        invoice.discount_total = _round2(data["discount_total"])

    if data.get("line_items") is not None:
        invoice.line_items = _build_line_items(payload.line_items)

    _apply_totals(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_draft(db: Session, invoice: Invoice, user: User) -> None:
    _assert_can(invoice, "delete")
    db.delete(invoice)
    db.commit()


# ---------------------------------------------------------------------------
# Issue (central transition)
# ---------------------------------------------------------------------------


def _allocate_number(db: Session) -> str:
    """Allocate the next invoice number under SELECT ... FOR UPDATE.

    Lazy-inits the single-row counter (id=1, last_number=100) if absent so the
    first number is INV-000101.
    """
    seq = db.execute(
        select(InvoiceNumberSequence).where(InvoiceNumberSequence.id == 1).with_for_update()
    ).scalar_one_or_none()
    if seq is None:
        seq = InvoiceNumberSequence(id=1, prefix="INV", last_number=100)
        db.add(seq)
        db.flush()
        seq = db.execute(
            select(InvoiceNumberSequence).where(InvoiceNumberSequence.id == 1).with_for_update()
        ).scalar_one()
    seq.last_number += 1
    return f"{seq.prefix}-{seq.last_number:06d}"


def _assert_issuer_wire_complete(profile: IssuerProfile) -> None:
    """Enforce wire-completeness at issue time, before freezing the snapshot (H3/H4).

    Mirrors the invariants the ``IssuerProfileUpsert`` validator encodes, but at
    the service boundary so an internally-mutated/incomplete profile cannot
    freeze a snapshot with no payable wire destination.
    """
    if not profile.swift_bic:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer profile has no SWIFT/BIC",
        )
    if not (profile.account_number or profile.iban):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer profile must have at least one of account_number or iban",
        )
    intermediary_set = any(
        v is not None
        for v in (
            profile.intermediary_bank_name,
            profile.intermediary_swift_bic,
            profile.intermediary_account_number,
        )
    )
    if intermediary_set and not (
        profile.intermediary_bank_name and profile.intermediary_swift_bic
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "issuer intermediary bank requires both intermediary_bank_name "
                "and intermediary_swift_bic"
            ),
        )


def _build_issuer_snapshot(profile: IssuerProfile) -> dict:
    return IssuerSnapshot.model_validate(profile).model_dump(mode="json")


def _build_customer_snapshot(customer: Customer, contract: Contract | None) -> dict:
    snapshot = CustomerSnapshot.model_validate(customer)
    if contract is not None:
        snapshot.contract = CustomerContractSnapshot(
            reference=contract.reference,
            title=contract.title,
            contract_date=contract.contract_date,
            service_period_start=contract.service_period_start,
            service_period_end=contract.service_period_end,
            scope_description=contract.scope_description,
        )
    return snapshot.model_dump(mode="json")


def issue(db: Session, invoice: Invoice, user: User) -> Invoice:
    """Issue a draft invoice (plan §3.3).

    Validates the draft + issuer wire completeness, then (under a bounded retry
    on the uq_invoices_number backstop) freezes totals/snapshots, allocates a
    number, creates the net Receivable, commits atomically, and finally renders
    the PDF best-effort (graceful-degrade — never fails the issue).
    """
    _assert_can(invoice, "issue")

    if not invoice.line_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invoice must have at least one line item to be issued",
        )

    profile = issuer_profile_service.get_or_none(db)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer profile is not configured",
        )
    if profile.receiving_account_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer profile has no receiving_account_id configured",
        )
    receiving_account = receivable_service._check_account_read(  # noqa: SLF001
        db, user, profile.receiving_account_id
    )
    if receiving_account.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer receiving account is archived",
        )
    if receiving_account.currency_code != "USD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="issuer receiving account must be a USD account",
        )

    # Wire-completeness guard before freezing the snapshot (H3/H4).
    _assert_issuer_wire_complete(profile)

    customer = db.get(Customer, invoice.customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invoice customer not found",
        )
    contract = db.get(Contract, invoice.contract_id) if invoice.contract_id is not None else None

    # Freeze totals + bank fee snapshot up front and reject a non-positive net
    # receivable (e.g. a $0-total from-contract draft with no agreed_rate; M3).
    _apply_totals(invoice)
    invoice.bank_fee_amount = _round2(Decimal(profile.bank_receiving_fee))
    net_amount = _round2(Decimal(invoice.total) - Decimal(invoice.bank_fee_amount))
    if invoice.total <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invoice total must be greater than 0 to issue",
        )
    if net_amount < Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invoice net amount (total - bank fee) must be >= 0 to issue",
        )

    invoice_id = invoice.id

    # Single-shot bounded retry on the uq_invoices_number backstop (H2): each
    # attempt re-allocates the number ONLY, on a fresh transaction. No unbounded
    # recursion, no duplicated receivable/audit side effects.
    last_error: IntegrityError | None = None
    for _attempt in range(_ISSUE_MAX_ATTEMPTS):
        try:
            _issue_once(db, invoice, profile, customer, contract, net_amount, user)
            db.commit()
            break
        except IntegrityError as exc:
            db.rollback()
            last_error = exc
            # Re-fetch the (still-draft) invoice into the fresh transaction.
            invoice = db.get(Invoice, invoice_id)
            if invoice is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="invoice not found"
                ) from exc
    else:
        # Exhausted attempts on a persistent collision — fail cleanly (no 500-loop).
        logger.error("issue: invoice number allocation kept colliding (id=%s)", invoice_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="could not allocate a unique invoice number; please retry",
        ) from last_error

    # Render PDF best-effort AFTER the durable commit (graceful-degrade, plan §4 +
    # C2). A PDF failure must NEVER fail the issue or surface as a 5xx.
    _try_render_pdf(db, invoice.id)
    db.refresh(invoice)
    return invoice


def _issue_once(
    db: Session,
    invoice: Invoice,
    profile: IssuerProfile,
    customer: Customer,
    contract: Contract | None,
    net_amount: Decimal,
    user: User,
) -> None:
    """One issue attempt: allocate number, freeze snapshots, create the net
    Receivable, flip status, write audit — all flushed (NOT committed) so the
    caller owns a single atomic commit. Re-applies totals/fee in case a prior
    attempt was rolled back."""
    _apply_totals(invoice)
    invoice.bank_fee_amount = _round2(Decimal(profile.bank_receiving_fee))

    # 1. Allocate number (SELECT ... FOR UPDATE).
    invoice.number = _allocate_number(db)

    # 2. Freeze snapshots.
    invoice.issuer_snapshot_json = _build_issuer_snapshot(profile)
    invoice.customer_snapshot_json = _build_customer_snapshot(customer, contract)

    # 3. Create the net-amount pending Receivable (direct model insert, §2.5).
    receivable = Receivable(
        description=f"Invoice {invoice.number} — {customer.legal_name}"[:500],
        amount=net_amount,
        currency_code="USD",
        due_date=invoice.due_date,
        account_id=profile.receiving_account_id,
        category_id=invoice.category_id or profile.default_income_category_id,
        created_by_user_id=user.id,
    )
    db.add(receivable)
    db.flush()
    invoice.receivable_id = receivable.id

    # 4. Flip status + issued_at.
    invoice.status = InvoiceStatus.issued
    invoice.issued_at = datetime.now(UTC)
    if invoice.issue_date is None:
        invoice.issue_date = _today_utc()

    audit_service.log_action(
        db,
        user.id,
        "issue",
        "Invoice",
        invoice.id,
        {
            "number": invoice.number,
            "total": str(invoice.total),
            "receivable_id": receivable.id,
        },
    )

    # Surface a uq_invoices_number collision now so the caller's retry loop can
    # re-allocate within a fresh transaction.
    db.flush()


def _try_render_pdf(db: Session, invoice_id: int) -> None:
    """Best-effort PDF render (post-commit). On ANY failure leave pdf_path=NULL —
    the invoice is already issued/committed, so a render error must never fail
    the issue or 500 (plan §4 graceful-degrade seam; C2)."""
    try:
        from app.services import invoice_pdf_service

        invoice_pdf_service.render_and_persist(db, invoice_id)
    except Exception:  # noqa: BLE001 — PDF is non-critical; never fail the issue.
        # Discard any partial work from the failed render; the issued invoice
        # is already durable from the prior commit.
        db.rollback()
        logger.warning(
            "issue: PDF render failed for invoice id=%s; left pdf_path=NULL",
            invoice_id,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# Mark sent / received / unmark received
# ---------------------------------------------------------------------------


def mark_sent(db: Session, invoice: Invoice, user: User) -> Invoice:
    _assert_can(invoice, "mark_sent")
    invoice.status = InvoiceStatus.sent
    invoice.sent_at = datetime.now(UTC)
    audit_service.log_action(db, user.id, "mark_sent", "Invoice", invoice.id, None)
    db.commit()
    db.refresh(invoice)
    return invoice


def _linked_receivable(db: Session, invoice: Invoice) -> Receivable:
    if invoice.receivable_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="invoice has no linked receivable",
        )
    receivable = db.get(Receivable, invoice.receivable_id)
    if receivable is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="linked receivable no longer exists",
        )
    return receivable


def mark_received(db: Session, invoice: Invoice, received_at: date | None, user: User) -> Invoice:
    """Settle the linked receivable and flip the invoice to ``paid`` atomically.

    The invoice status + audit are written to the session FIRST, then
    ``receivable_service.mark_as_received`` books the income transaction and
    issues the single ``commit()`` that covers BOTH changes. Its internal
    rollback-on-error therefore also reverts the invoice flip — no split-commit
    window where money is booked but the invoice stays unpaid (C1).
    """
    _assert_can(invoice, "mark_received")
    receivable = _linked_receivable(db, invoice)

    invoice.status = InvoiceStatus.paid
    audit_service.log_action(
        db,
        user.id,
        "mark_received",
        "Invoice",
        invoice.id,
        {"receivable_id": receivable.id},
    )
    # Books the net income transaction on the receiving account (ACL write-check
    # inside) and commits the whole unit of work — including the flip above.
    receivable_service.mark_as_received(db, receivable, received_at, None, user)
    db.refresh(invoice)
    return invoice


def unmark_received(db: Session, invoice: Invoice, user: User) -> Invoice:
    """Reverse settlement and revert the invoice status atomically.

    Same single-commit discipline as ``mark_received``: the status revert + audit
    are staged before ``receivable_service.unmark_as_received`` issues the lone
    commit covering both the transaction removal and the invoice revert (C1).
    """
    _assert_can(invoice, "unmark_received")
    receivable = _linked_receivable(db, invoice)

    # Back to sent if it was ever sent, else issued.
    invoice.status = InvoiceStatus.sent if invoice.sent_at is not None else InvoiceStatus.issued
    audit_service.log_action(
        db,
        user.id,
        "unmark_received",
        "Invoice",
        invoice.id,
        {"receivable_id": receivable.id},
    )
    receivable_service.unmark_as_received(db, receivable, user)
    db.refresh(invoice)
    return invoice


# ---------------------------------------------------------------------------
# Void
# ---------------------------------------------------------------------------


def void(db: Session, invoice: Invoice, void_reason: str, user: User) -> Invoice:
    """Void an issued/sent invoice (plan §3.2). Cancels an unsettled receivable."""
    _assert_can(invoice, "void")

    if invoice.receivable_id is not None:
        receivable = db.get(Receivable, invoice.receivable_id)
        if receivable is not None:
            if receivable.received_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="linked receivable is already received; unmark it first",
                )
            db.delete(receivable)
            invoice.receivable_id = None

    invoice.status = InvoiceStatus.void
    invoice.voided_at = datetime.now(UTC)
    invoice.void_reason = void_reason
    audit_service.log_action(
        db, user.id, "void", "Invoice", invoice.id, {"void_reason": void_reason}
    )
    db.commit()
    db.refresh(invoice)
    return invoice


# ---------------------------------------------------------------------------
# Outstanding summary (aging buckets from linked receivables)
# ---------------------------------------------------------------------------


def outstanding_summary(db: Session, user: User) -> InvoiceOutstandingSummary:
    """Aging buckets derived from receivables linked to issued/sent invoices."""
    today = _today_utc()
    stmt = (
        select(Invoice, Receivable)
        .join(Receivable, Receivable.id == Invoice.receivable_id)
        .where(
            Invoice.status.in_([InvoiceStatus.issued, InvoiceStatus.sent]),
            Receivable.received_at.is_(None),
        )
    )
    rows = db.execute(stmt).all()

    buckets: dict[str, dict[str, Decimal | int]] = {
        "current": {"count": 0, "total": Decimal("0")},
        "due_today": {"count": 0, "total": Decimal("0")},
        "overdue": {"count": 0, "total": Decimal("0")},
    }
    grand_total = Decimal("0")
    grand_count = 0
    for _invoice, receivable in rows:
        if receivable.due_date < today:
            key = "overdue"
        elif receivable.due_date == today:
            key = "due_today"
        else:
            key = "current"
        amount = Decimal(receivable.amount)
        buckets[key]["count"] = int(buckets[key]["count"]) + 1
        buckets[key]["total"] = Decimal(buckets[key]["total"]) + amount
        grand_total += amount
        grand_count += 1

    return InvoiceOutstandingSummary(
        currency_code="USD",
        total=grand_total,
        count=grand_count,
        by_bucket={
            key: InvoiceAgingBucket(count=int(val["count"]), total=Decimal(val["total"]))
            for key, val in buckets.items()
        },
    )


__all__ = [
    "list_invoices",
    "get",
    "create_draft",
    "create_from_contract",
    "update_draft",
    "delete_draft",
    "issue",
    "mark_sent",
    "mark_received",
    "unmark_received",
    "void",
    "outstanding_summary",
    "to_out",
]

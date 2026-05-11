"""Service layer for Payable operations, including partial-payment support."""
from __future__ import annotations

import base64
import logging
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    AccountAcl,
    Category,
    Payable,
    PayablePayment,
    Recurrence,
    Transaction,
    User,
)
from app.models.enums import (
    AclPermission,
    CategoryKind,
    RecurrenceKind,
    TransactionKind,
    UserRole,
)
from app.schemas.common import CursorPage
from app.schemas.payable import (
    OutstandingStatusGroup,
    PayableCreate,
    PayableOut,
    PayableOutstandingSummary,
    PayableUpdate,
    PaymentOut,
)
from app.services import recurrence_service

logger = logging.getLogger(__name__)


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
# Status computation
# ---------------------------------------------------------------------------


def _compute_status(p: Payable) -> str:
    """Compute the display status of a Payable.

    Returns:
        "paid" if fully paid, "partially_paid" if partially paid,
        "overdue" if unpaid and past due date, "pending" otherwise.
    """
    if p.paid_amount >= p.amount:
        return "paid"
    if p.paid_amount > Decimal("0"):
        return "partially_paid"
    if p.due_date < date.today():
        return "overdue"
    return "pending"


def _remaining_amount(p: Payable) -> Decimal:
    remaining = p.amount - p.paid_amount
    return max(Decimal("0"), remaining)


# ---------------------------------------------------------------------------
# Output serialisation
# ---------------------------------------------------------------------------


def _payment_to_out(pp: PayablePayment) -> PaymentOut:
    return PaymentOut(
        id=pp.id,
        transaction_id=pp.transaction_id,
        amount=pp.amount,
        paid_at=pp.paid_at,
        created_at=pp.created_at,
    )


def _to_out(p: Payable) -> PayableOut:
    return PayableOut(
        id=p.id,
        description=p.description,
        amount=p.amount,
        currency_code=p.currency_code,
        due_date=p.due_date,
        account_id=p.account_id,
        category_id=p.category_id,
        notes=p.notes,
        paid_at=p.paid_at,
        paid_amount=p.paid_amount,
        remaining_amount=_remaining_amount(p),
        recurrence_id=p.recurrence_id,
        transaction_id=p.transaction_id,
        created_at=p.created_at,
        updated_at=p.updated_at,
        status=_compute_status(p),  # type: ignore[arg-type]
        payments=[_payment_to_out(pp) for pp in p.payments],
    )


# ---------------------------------------------------------------------------
# Account access helpers
# ---------------------------------------------------------------------------


def _check_account_write(db: Session, user: User, account_id: int) -> Account:
    acc = db.get(Account, account_id)
    if acc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="account not found"
        )
    if acc.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="account is archived"
        )
    if user.role != UserRole.admin:
        acl = db.get(AccountAcl, (acc.id, user.id))
        if acl is None or acl.permission != AclPermission.write:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no write access to this account",
            )
    return acc


def _check_account_read(db: Session, user: User, account_id: int) -> Account:
    acc = db.get(Account, account_id)
    if acc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="account not found"
        )
    if user.role != UserRole.admin:
        acl = db.get(AccountAcl, (acc.id, user.id))
        if acl is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no access to this account",
            )
    return acc


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def _load_with_payments(db: Session, payable_id: int) -> Payable | None:
    """Load a Payable with its payments eagerly to avoid lazy-load issues."""
    stmt = (
        select(Payable)
        .where(Payable.id == payable_id)
        .options(selectinload(Payable.payments))
    )
    return db.execute(stmt).scalar_one_or_none()


def _visible_account_ids(db: Session, user: User) -> list[int]:
    """Return list of account ids the user has any ACL on (read or write).

    Only relevant for non-admin users. Returns empty list if user has no ACLs.
    """
    rows = db.execute(
        select(AccountAcl.account_id).where(AccountAcl.user_id == user.id)
    ).all()
    return [r[0] for r in rows]


def apply_visibility_filter(db: Session, user: User, stmt):
    """Apply visibility predicate to a Payable select statement for non-admin users.

    Visible payables = created by the user OR linked to an account the user has ACL on.
    Admin callers should not invoke this helper; the caller already guards on role.
    """
    visible = _visible_account_ids(db, user)
    if visible:
        return stmt.where(
            or_(
                Payable.created_by_user_id == user.id,
                Payable.account_id.in_(visible),
            )
        )
    return stmt.where(Payable.created_by_user_id == user.id)


def list_payables(
    db: Session,
    user: User,
    status_filter: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    currency_code: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> CursorPage[PayableOut]:
    """List payables with optional filters and cursor-based pagination."""
    stmt = select(Payable).options(selectinload(Payable.payments))

    if user.role != UserRole.admin:
        stmt = apply_visibility_filter(db, user, stmt)

    if account_id is not None:
        stmt = stmt.where(Payable.account_id == account_id)
    if category_id is not None:
        stmt = stmt.where(Payable.category_id == category_id)
    if currency_code is not None:
        stmt = stmt.where(Payable.currency_code == currency_code)
    if from_date is not None:
        stmt = stmt.where(Payable.due_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Payable.due_date <= to_date)

    today = date.today()
    if status_filter == "paid":
        stmt = stmt.where(Payable.paid_amount >= Payable.amount, Payable.amount > 0)
    elif status_filter == "partially_paid":
        stmt = stmt.where(
            Payable.paid_amount > 0, Payable.paid_amount < Payable.amount
        )
    elif status_filter == "pending":
        stmt = stmt.where(Payable.paid_amount == 0, Payable.due_date >= today)
    elif status_filter == "overdue":
        stmt = stmt.where(Payable.paid_amount == 0, Payable.due_date < today)

    if cursor is not None:
        stmt = stmt.where(Payable.id < _decode_cursor(cursor))

    stmt = stmt.order_by(Payable.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[PayableOut](
        items=[_to_out(p) for p in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def _validate_category(db: Session, category_id: int | None) -> None:
    if category_id is None:
        return
    cat = db.get(Category, category_id)
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="category not found"
        )
    if cat.kind != CategoryKind.expense:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payable category must be of kind 'expense'",
        )


def create(db: Session, payload: PayableCreate, user: User) -> Payable:
    """Create a new Payable, optionally with a recurrence rule."""
    _validate_category(db, payload.category_id)
    if payload.account_id is not None:
        acc = _check_account_read(db, user, payload.account_id)
        if acc.currency_code != payload.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payable currency must match account currency",
            )

    recurrence_id: int | None = None
    if payload.recurrence is not None:
        rule = payload.recurrence.model_dump(exclude_none=True)
        if rule.get("until") is not None:
            rule["until"] = rule["until"].isoformat()
        template = {
            "description": payload.description,
            "amount": str(payload.amount),
            "currency_code": payload.currency_code,
            "account_id": payload.account_id,
            "category_id": payload.category_id,
            "notes": payload.notes,
            "created_by_user_id": user.id,
        }
        rec = Recurrence(
            kind=RecurrenceKind.payable,
            rule_json=rule,
            template_json=template,
            next_run_date=recurrence_service.compute_next_run_date(
                rule, payload.due_date
            ),
            is_active=True,
        )
        db.add(rec)
        db.flush()
        recurrence_id = rec.id

    payable = Payable(
        description=payload.description,
        amount=payload.amount,
        currency_code=payload.currency_code,
        due_date=payload.due_date,
        account_id=payload.account_id,
        category_id=payload.category_id,
        notes=payload.notes,
        recurrence_id=recurrence_id,
        created_by_user_id=user.id,
    )
    db.add(payable)
    db.commit()
    db.refresh(payable)
    logger.info("Created payable id=%s description=%r", payable.id, payable.description)
    # Reload with payments eagerly to ensure _to_out works correctly
    loaded = _load_with_payments(db, payable.id)
    assert loaded is not None
    return loaded


def get(db: Session, user: User, payable_id: int) -> Payable:
    """Fetch a Payable by id, checking ownership.

    Args:
        db: Database session.
        user: Authenticated user.
        payable_id: Primary key of the Payable.

    Returns:
        The Payable ORM instance with payments eagerly loaded.

    Raises:
        HTTPException: 404 if not found, 403 if unauthorized.
    """
    p = _load_with_payments(db, payable_id)
    if p is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="payable not found"
        )
    if user.role != UserRole.admin and p.created_by_user_id != user.id:
        if p.account_id is None or db.get(AccountAcl, (p.account_id, user.id)) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no access to this payable",
            )
    return p


def update(db: Session, payable: Payable, payload: PayableUpdate, user: User) -> Payable:
    """Update mutable fields of a Payable."""
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        _validate_category(db, data["category_id"])
    if data.get("account_id") is not None:
        new_account_id = data["account_id"]
        if (
            payable.account_id is not None
            and payable.account_id != new_account_id
        ):
            _check_account_read(db, user, payable.account_id)
        acc = _check_account_read(db, user, new_account_id)
        if acc.currency_code != payable.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payable currency must match account currency",
            )
    for field in (
        "description",
        "amount",
        "due_date",
        "account_id",
        "category_id",
        "notes",
    ):
        if field in data:
            setattr(payable, field, data[field])
    db.commit()
    loaded = _load_with_payments(db, payable.id)
    assert loaded is not None
    return loaded


def delete(db: Session, payable: Payable) -> None:
    """Delete a Payable and its associated payments (cascade handles DB rows)."""
    db.delete(payable)
    db.commit()


# ---------------------------------------------------------------------------
# Payment operations
# ---------------------------------------------------------------------------


def mark_as_paid(
    db: Session,
    payable: Payable,
    paid_at: date | None,
    account_id: int | None,
    user: User,
    amount: Decimal | None = None,
) -> Payable:
    """Record a full or partial payment against a Payable.

    Args:
        db: Database session.
        payable: The Payable to pay.
        paid_at: Payment date; defaults to today if None.
        account_id: Account to debit; falls back to payable.account_id.
        user: Authenticated user performing the action.
        amount: Amount to pay. If None, pays the full remaining balance.

    Returns:
        Updated Payable with refreshed payments list.

    Raises:
        HTTPException 400: If already fully paid, amount is invalid, or
            the payment exceeds the remaining balance.
    """
    remaining = payable.amount - payable.paid_amount
    if remaining <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payable already fully paid",
        )

    payment_amount = amount if amount is not None else remaining
    if payment_amount <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment amount must be > 0",
        )
    if payment_amount > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"payment amount exceeds remaining balance ({remaining})",
        )

    actual_paid_at = paid_at or date.today()
    target_account_id = account_id if account_id is not None else payable.account_id

    try:
        tx_id: int | None = None
        if target_account_id is not None:
            acc = _check_account_write(db, user, target_account_id)
            if acc.currency_code != payable.currency_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="account currency must match payable currency",
                )
            signed_amount = -Decimal(payment_amount)
            tx = Transaction(
                account_id=acc.id,
                currency_code=acc.currency_code,
                amount=signed_amount,
                kind=TransactionKind.expense,
                category_id=payable.category_id,
                date=actual_paid_at,
                description=f"Pagamento: {payable.description}"[:500],
                transfer_pair_id=None,
                created_by_user_id=user.id,
            )
            db.add(tx)
            db.flush()
            tx_id = tx.id

        payment = PayablePayment(
            payable_id=payable.id,
            transaction_id=tx_id,
            amount=payment_amount,
            paid_at=actual_paid_at,
            created_by_user_id=user.id,
        )
        db.add(payment)

        new_paid_amount = payable.paid_amount + payment_amount
        # Guard against floating-point drift: cap at payable.amount
        if new_paid_amount >= payable.amount:
            payable.paid_amount = payable.amount
            payable.paid_at = actual_paid_at
            logger.info(
                "Payable id=%s fully paid (paid_amount=%s)",
                payable.id,
                payable.paid_amount,
            )
        else:
            payable.paid_amount = new_paid_amount
            logger.info(
                "Payable id=%s partially paid (paid_amount=%s remaining=%s)",
                payable.id,
                new_paid_amount,
                payable.amount - new_paid_amount,
            )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    # Reload with payments to return accurate state
    refreshed = _load_with_payments(db, payable.id)
    assert refreshed is not None
    return refreshed


def unmark_as_paid(db: Session, payable: Payable, user: User) -> Payable:
    """Revert all payments for a Payable, deleting associated transactions.

    Iterates every PayablePayment, deletes the linked Transaction (if the
    user has write access to that account), then deletes the payment record.
    Finally resets ``paid_amount``, ``paid_at``, and ``transaction_id`` to
    their unpaid defaults.

    Args:
        db: Database session.
        payable: The Payable to revert.
        user: Authenticated user.

    Returns:
        Updated Payable with empty payments list.

    Raises:
        HTTPException 400: If the payable has no payments to revert.
        HTTPException 403: If the user lacks write access to an account
            linked to one of the payments.
    """
    if not payable.payments and payable.paid_amount == Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="payable is not paid"
        )

    try:
        for payment in list(payable.payments):
            if payment.transaction_id is not None:
                tx = db.get(Transaction, payment.transaction_id)
                if tx is not None:
                    _check_account_write(db, user, tx.account_id)
                    db.delete(tx)
            db.delete(payment)

        payable.paid_amount = Decimal("0")
        payable.paid_at = None
        payable.transaction_id = None
        db.commit()
        logger.info("Payable id=%s unmarked as paid (all payments reverted)", payable.id)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    refreshed = _load_with_payments(db, payable.id)
    assert refreshed is not None
    return refreshed


def to_out(p: Payable) -> PayableOut:
    """Public alias for _to_out used by API layer."""
    return _to_out(p)


# ---------------------------------------------------------------------------
# Outstanding summary
# ---------------------------------------------------------------------------


def outstanding_summary(
    db: Session,
    user: User,
    currency_code: str | None = None,
) -> PayableOutstandingSummary:
    """Aggregate outstanding payables (paid_amount < amount) by status bucket.

    Buckets:
      - overdue:        paid_amount == 0 AND due_date < today
      - due_today:      paid_amount == 0 AND due_date == today
      - pending:        paid_amount == 0 AND due_date > today
      - partially_paid: paid_amount > 0  AND paid_amount < amount

    SUM uses (amount - paid_amount) so partial payments contribute only the
    remaining balance. Currency isolation is enforced when ``currency_code``
    is provided; admins see all rows, others see only payables they created
    or that live on an account they have ACL on.
    """
    today = date.today()
    remaining = Payable.amount - Payable.paid_amount

    bucket_expr = case(
        (
            (Payable.paid_amount == 0) & (Payable.due_date < today),
            "overdue",
        ),
        (
            (Payable.paid_amount == 0) & (Payable.due_date == today),
            "due_today",
        ),
        (
            (Payable.paid_amount == 0) & (Payable.due_date > today),
            "pending",
        ),
        else_="partially_paid",
    ).label("bucket")

    stmt = (
        select(
            bucket_expr,
            func.count().label("count"),
            func.coalesce(func.sum(remaining), 0).label("total_remaining"),
        )
        .where(Payable.paid_amount < Payable.amount)
        .group_by(bucket_expr)
    )

    if user.role != UserRole.admin:
        stmt = apply_visibility_filter(db, user, stmt)
    if currency_code is not None:
        stmt = stmt.where(Payable.currency_code == currency_code)

    rows = db.execute(stmt).all()

    by_status: dict[str, OutstandingStatusGroup] = {
        "overdue": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
        "due_today": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
        "pending": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
        "partially_paid": OutstandingStatusGroup(
            count=0, total_remaining=Decimal("0")
        ),
    }
    grand_total = Decimal("0")
    grand_count = 0
    for row in rows:
        total = Decimal(row.total_remaining or 0)
        count = int(row.count or 0)
        bucket = str(row.bucket)
        if bucket in by_status:
            by_status[bucket] = OutstandingStatusGroup(
                count=count, total_remaining=total
            )
        grand_total += total
        grand_count += count

    return PayableOutstandingSummary(
        currency_code=currency_code,
        total_remaining=grand_total,
        count=grand_count,
        by_status=by_status,
    )


__all__ = [
    "list_payables",
    "create",
    "get",
    "update",
    "delete",
    "mark_as_paid",
    "unmark_as_paid",
    "to_out",
    "outstanding_summary",
    "apply_visibility_filter",
]

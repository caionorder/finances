from __future__ import annotations

import base64
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountAcl,
    Category,
    Receivable,
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
from app.schemas.receivable import (
    OutstandingStatusGroup,
    ReceivableCreate,
    ReceivableOut,
    ReceivableOutstandingSummary,
    ReceivableUpdate,
)
from app.services import recurrence_service


def _encode_cursor(value: int) -> str:
    return base64.urlsafe_b64encode(str(value).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        return int(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


def _compute_status(r: Receivable) -> str:
    if r.received_at is not None:
        return "received"
    if r.due_date < date.today():
        return "overdue"
    return "pending"


def _to_out(r: Receivable) -> ReceivableOut:
    return ReceivableOut(
        id=r.id,
        description=r.description,
        amount=r.amount,
        currency_code=r.currency_code,
        due_date=r.due_date,
        account_id=r.account_id,
        category_id=r.category_id,
        notes=r.notes,
        received_at=r.received_at,
        recurrence_id=r.recurrence_id,
        transaction_id=r.transaction_id,
        created_at=r.created_at,
        updated_at=r.updated_at,
        status=_compute_status(r),  # type: ignore[arg-type]
    )


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


def _visible_account_ids(db: Session, user: User) -> list[int]:
    rows = db.execute(
        select(AccountAcl.account_id).where(AccountAcl.user_id == user.id)
    ).all()
    return [r[0] for r in rows]


def apply_visibility_filter(db: Session, user: User, stmt):
    """Apply Receivable visibility predicate for non-admin callers.

    Visible = created by the user OR linked to an account the user has ACL on.
    """
    visible = _visible_account_ids(db, user)
    if visible:
        return stmt.where(
            or_(
                Receivable.created_by_user_id == user.id,
                Receivable.account_id.in_(visible),
            )
        )
    return stmt.where(Receivable.created_by_user_id == user.id)


def list_receivables(
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
) -> CursorPage[ReceivableOut]:
    stmt = select(Receivable)

    if user.role != UserRole.admin:
        stmt = apply_visibility_filter(db, user, stmt)

    if account_id is not None:
        stmt = stmt.where(Receivable.account_id == account_id)
    if category_id is not None:
        stmt = stmt.where(Receivable.category_id == category_id)
    if currency_code is not None:
        stmt = stmt.where(Receivable.currency_code == currency_code)
    if from_date is not None:
        stmt = stmt.where(Receivable.due_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Receivable.due_date <= to_date)

    today = date.today()
    if status_filter == "received":
        stmt = stmt.where(Receivable.received_at.isnot(None))
    elif status_filter == "pending":
        stmt = stmt.where(
            Receivable.received_at.is_(None), Receivable.due_date >= today
        )
    elif status_filter == "overdue":
        stmt = stmt.where(
            Receivable.received_at.is_(None), Receivable.due_date < today
        )

    if cursor is not None:
        stmt = stmt.where(Receivable.id < _decode_cursor(cursor))

    stmt = stmt.order_by(Receivable.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[ReceivableOut](
        items=[_to_out(r) for r in items],
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
    if cat.kind != CategoryKind.income:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="receivable category must be of kind 'income'",
        )


def create(db: Session, payload: ReceivableCreate, user: User) -> Receivable:
    _validate_category(db, payload.category_id)
    if payload.account_id is not None:
        acc = _check_account_read(db, user, payload.account_id)
        if acc.currency_code != payload.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="receivable currency must match account currency",
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
            kind=RecurrenceKind.receivable,
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

    receivable = Receivable(
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
    db.add(receivable)
    db.commit()
    db.refresh(receivable)
    return receivable


def get(db: Session, user: User, receivable_id: int) -> Receivable:
    r = db.get(Receivable, receivable_id)
    if r is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="receivable not found"
        )
    if user.role != UserRole.admin and r.created_by_user_id != user.id:
        if r.account_id is None or db.get(AccountAcl, (r.account_id, user.id)) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no access to this receivable",
            )
    return r


def update(
    db: Session, receivable: Receivable, payload: ReceivableUpdate, user: User
) -> Receivable:
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        _validate_category(db, data["category_id"])
    if data.get("account_id") is not None:
        new_account_id = data["account_id"]
        if (
            receivable.account_id is not None
            and receivable.account_id != new_account_id
        ):
            _check_account_read(db, user, receivable.account_id)
        acc = _check_account_read(db, user, new_account_id)
        if acc.currency_code != receivable.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="receivable currency must match account currency",
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
            setattr(receivable, field, data[field])
    db.commit()
    db.refresh(receivable)
    return receivable


def delete(db: Session, receivable: Receivable) -> None:
    db.delete(receivable)
    db.commit()


def mark_as_received(
    db: Session,
    receivable: Receivable,
    received_at: date | None,
    account_id: int | None,
    user: User,
) -> Receivable:
    if receivable.received_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="receivable already received"
        )
    actual_received_at = received_at or date.today()
    target_account_id = (
        account_id if account_id is not None else receivable.account_id
    )

    try:
        if target_account_id is not None:
            acc = _check_account_write(db, user, target_account_id)
            if acc.currency_code != receivable.currency_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="account currency must match receivable currency",
                )
            signed_amount = Decimal(receivable.amount)
            tx = Transaction(
                account_id=acc.id,
                currency_code=acc.currency_code,
                amount=signed_amount,
                kind=TransactionKind.income,
                category_id=receivable.category_id,
                date=actual_received_at,
                description=f"Recebimento: {receivable.description}"[:500],
                transfer_pair_id=None,
                created_by_user_id=user.id,
            )
            db.add(tx)
            db.flush()
            receivable.transaction_id = tx.id

        receivable.received_at = actual_received_at
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(receivable)
    return receivable


def unmark_as_received(db: Session, receivable: Receivable, user: User) -> Receivable:
    if receivable.received_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="receivable is not received"
        )
    if receivable.transaction_id is not None:
        tx = db.get(Transaction, receivable.transaction_id)
        if tx is not None:
            _check_account_write(db, user, tx.account_id)
            db.delete(tx)
        receivable.transaction_id = None
    receivable.received_at = None
    db.commit()
    db.refresh(receivable)
    return receivable


def to_out(r: Receivable) -> ReceivableOut:
    return _to_out(r)


# ---------------------------------------------------------------------------
# Outstanding summary
# ---------------------------------------------------------------------------


def outstanding_summary(
    db: Session,
    user: User,
    currency_code: str | None = None,
) -> ReceivableOutstandingSummary:
    """Aggregate outstanding receivables (received_at IS NULL) by status bucket.

    Receivables are binary (no partial), so total_remaining = SUM(amount).
    Buckets:
      - overdue:   due_date < today
      - due_today: due_date == today
      - pending:   due_date > today

    Visibility: admins see all; others see what they created or what lives on
    an account they have ACL on.
    """
    today = date.today()

    bucket_expr = case(
        (Receivable.due_date < today, "overdue"),
        (Receivable.due_date == today, "due_today"),
        else_="pending",
    ).label("bucket")

    stmt = (
        select(
            bucket_expr,
            func.count().label("count"),
            func.coalesce(func.sum(Receivable.amount), 0).label("total_remaining"),
        )
        .where(Receivable.received_at.is_(None))
        .group_by(bucket_expr)
    )

    if user.role != UserRole.admin:
        stmt = apply_visibility_filter(db, user, stmt)
    if currency_code is not None:
        stmt = stmt.where(Receivable.currency_code == currency_code)

    rows = db.execute(stmt).all()

    by_status: dict[str, OutstandingStatusGroup] = {
        "overdue": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
        "due_today": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
        "pending": OutstandingStatusGroup(count=0, total_remaining=Decimal("0")),
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

    return ReceivableOutstandingSummary(
        currency_code=currency_code,
        total_remaining=grand_total,
        count=grand_count,
        by_status=by_status,
    )


__all__ = [
    "list_receivables",
    "create",
    "get",
    "update",
    "delete",
    "mark_as_received",
    "unmark_as_received",
    "to_out",
    "outstanding_summary",
    "apply_visibility_filter",
]

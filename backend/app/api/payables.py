from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user, get_db
from app.models import Payable, User
from app.models.enums import UserRole
from app.schemas.common import CursorPage
from app.schemas.payable import (
    MarkAsPaidRequest,
    PayableCreate,
    PayableOut,
    PayableOutstandingSummary,
    PayableUpdate,
)
from app.services import payable_service

router = APIRouter(prefix="/payables", tags=["payables"])


@router.get("", response_model=CursorPage[PayableOut])
def list_payables(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_: str | None = Query(None, alias="status", pattern="^(paid|partially_paid|pending|overdue)$"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    account_id: int | None = None,
    category_id: int | None = None,
    currency_code: str | None = Query(None, min_length=3, max_length=10),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> CursorPage[PayableOut]:
    return payable_service.list_payables(
        db,
        user,
        status_filter=status_,
        from_date=from_date,
        to_date=to_date,
        account_id=account_id,
        category_id=category_id,
        currency_code=currency_code,
        cursor=cursor,
        limit=limit,
    )


@router.post(
    "",
    response_model=PayableOut,
    status_code=status.HTTP_201_CREATED,
)
def create_payable(
    payload: PayableCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.create(db, payload, user)
    return payable_service.to_out(p)


@router.get("/outstanding-summary", response_model=PayableOutstandingSummary)
def outstanding_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str | None = Query(None, min_length=3, max_length=10),
) -> PayableOutstandingSummary:
    """Return aggregate outstanding payables grouped by status bucket."""
    return payable_service.outstanding_summary(db, user, currency_code=currency_code)


@router.get("/upcoming", response_model=list[PayableOut])
def list_upcoming(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    days: int = Query(7, ge=1, le=90),
) -> list[PayableOut]:
    """Return unpaid payables due within the next `days` days (inclusive of today).

    Ordered by due_date ascending. Admin sees all payables; non-admin sees
    only payables they created.
    """
    today = date.today()
    end_date = today + timedelta(days=days)
    stmt = (
        select(Payable)
        .options(selectinload(Payable.payments))
        .where(
            Payable.due_date >= today,
            Payable.due_date <= end_date,
            Payable.paid_amount < Payable.amount,
        )
    )
    if user.role != UserRole.admin:
        stmt = payable_service.apply_visibility_filter(db, user, stmt)
    stmt = stmt.order_by(Payable.due_date.asc())
    items = list(db.execute(stmt).scalars().all())
    return [payable_service.to_out(p) for p in items]


@router.get("/{payable_id}", response_model=PayableOut)
def get_payable(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    return payable_service.to_out(p)


@router.patch("/{payable_id}", response_model=PayableOut)
def update_payable(
    payable_id: int,
    payload: PayableUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    updated = payable_service.update(db, p, payload, user)
    return payable_service.to_out(updated)


@router.delete("/{payable_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payable(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    p = payable_service.get(db, user, payable_id)
    payable_service.delete(db, p)


@router.post("/{payable_id}/mark-as-paid", response_model=PayableOut)
def mark_as_paid(
    payable_id: int,
    payload: MarkAsPaidRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    updated = payable_service.mark_as_paid(
        db, p, payload.paid_at, payload.account_id, user, payload.amount
    )
    return payable_service.to_out(updated)


@router.post("/{payable_id}/unmark-as-paid", response_model=PayableOut)
def unmark_as_paid(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    updated = payable_service.unmark_as_paid(db, p, user)
    return payable_service.to_out(updated)

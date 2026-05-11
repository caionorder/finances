from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import User
from app.schemas.common import CursorPage
from app.schemas.receivable import (
    MarkAsReceivedRequest,
    ReceivableCreate,
    ReceivableOut,
    ReceivableOutstandingSummary,
    ReceivableUpdate,
)
from app.services import receivable_service

router = APIRouter(prefix="/receivables", tags=["receivables"])


@router.get("", response_model=CursorPage[ReceivableOut])
def list_receivables(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_: str | None = Query(
        None, alias="status", pattern="^(received|pending|overdue)$"
    ),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    account_id: int | None = None,
    category_id: int | None = None,
    currency_code: str | None = Query(None, min_length=3, max_length=10),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> CursorPage[ReceivableOut]:
    return receivable_service.list_receivables(
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


@router.get("/outstanding-summary", response_model=ReceivableOutstandingSummary)
def outstanding_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str | None = Query(None, min_length=3, max_length=10),
) -> ReceivableOutstandingSummary:
    """Return aggregate outstanding receivables grouped by status bucket."""
    return receivable_service.outstanding_summary(
        db, user, currency_code=currency_code
    )


@router.post(
    "",
    response_model=ReceivableOut,
    status_code=status.HTTP_201_CREATED,
)
def create_receivable(
    payload: ReceivableCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.create(db, payload, user)
    return receivable_service.to_out(r)


@router.get("/{receivable_id}", response_model=ReceivableOut)
def get_receivable(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    return receivable_service.to_out(r)


@router.patch("/{receivable_id}", response_model=ReceivableOut)
def update_receivable(
    receivable_id: int,
    payload: ReceivableUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    updated = receivable_service.update(db, r, payload, user)
    return receivable_service.to_out(updated)


@router.delete("/{receivable_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_receivable(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    r = receivable_service.get(db, user, receivable_id)
    receivable_service.delete(db, r)


@router.post("/{receivable_id}/mark-as-received", response_model=ReceivableOut)
def mark_as_received(
    receivable_id: int,
    payload: MarkAsReceivedRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    updated = receivable_service.mark_as_received(
        db, r, payload.received_at, payload.account_id, user
    )
    return receivable_service.to_out(updated)


@router.post("/{receivable_id}/unmark-as-received", response_model=ReceivableOut)
def unmark_as_received(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    updated = receivable_service.unmark_as_received(db, r, user)
    return receivable_service.to_out(updated)

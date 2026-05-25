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


@router.get(
    "",
    response_model=CursorPage[ReceivableOut],
    summary="List receivables (cursor-paginated)",
    description=(
        "Lists money expected to be received, optionally filtered by status bucket, expected "
        "date range, account, category and currency.\n\n"
        "**Status buckets**:\n\n"
        "* `pending` — not yet received and not yet overdue.\n"
        "* `received` — settled (a transaction was booked against the destination account).\n"
        "* `overdue` — past expected date, still pending.\n\n"
        "**Visibility**: admins see everything; non-admins see only receivables they created.\n\n"
        "**Pagination**: pass the previous response's `next_cursor` back as `?cursor=...`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (invalid status enum, malformed date, ...)."},
    },
)
def list_receivables(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_: str | None = Query(
        None,
        alias="status",
        pattern="^(received|pending|overdue)$",
        description="Restrict to a single status bucket: `pending`, `received`, or `overdue`.",
    ),
    from_date: date | None = Query(
        None,
        alias="from",
        description="Inclusive lower bound on `expected_date` (ISO YYYY-MM-DD).",
    ),
    to_date: date | None = Query(
        None,
        alias="to",
        description="Inclusive upper bound on `expected_date` (ISO YYYY-MM-DD).",
    ),
    account_id: int | None = Query(
        None,
        description="Restrict to receivables targeting a specific account.",
    ),
    category_id: int | None = Query(
        None,
        description="Restrict to a specific category id.",
    ),
    currency_code: str | None = Query(
        None,
        min_length=3,
        max_length=10,
        description="Restrict to a single currency (e.g. `BRL`, `USD`, `PYG`).",
    ),
    cursor: str | None = Query(
        None,
        description="Opaque cursor returned by the previous page's `next_cursor`.",
    ),
    limit: int = Query(50, ge=1, le=200, description="Max items per page (1-200)."),
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


@router.get(
    "/outstanding-summary",
    response_model=ReceivableOutstandingSummary,
    summary="Aggregate outstanding receivables grouped by status bucket",
    description=(
        "Returns total outstanding receivable amounts split into the `pending` and `overdue` "
        "buckets, plus a grand total of money still to come in.\n\n"
        "Pass `currency_code` to restrict the aggregation to a single currency — recommended, "
        "because the sums are **not** FX-normalized."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def outstanding_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str | None = Query(
        None,
        min_length=3,
        max_length=10,
        description="Restrict the aggregation to a single currency (recommended).",
    ),
) -> ReceivableOutstandingSummary:
    return receivable_service.outstanding_summary(
        db, user, currency_code=currency_code
    )


@router.post(
    "",
    response_model=ReceivableOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a receivable (money expected to come in)",
    description=(
        "Creates a new entry representing money the caller expects to receive. Receivables "
        "remain `pending` until settled via `mark-as-received`, which posts an `income` "
        "transaction on the destination account.\n\n"
        "Optionally link a recurrence template to auto-generate future instances."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (non-positive amount, invalid currency, ...)."},
    },
)
def create_receivable(
    payload: ReceivableCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.create(db, payload, user)
    return receivable_service.to_out(r)


@router.get(
    "/{receivable_id}",
    response_model=ReceivableOut,
    summary="Get a single receivable by id",
    description=(
        "Returns the full receivable record with its derived status bucket. Non-admins can "
        "only fetch receivables they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this receivable."},
        404: {"description": "Receivable not found."},
    },
)
def get_receivable(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    return receivable_service.to_out(r)


@router.patch(
    "/{receivable_id}",
    response_model=ReceivableOut,
    summary="Update mutable fields of a receivable",
    description=(
        "Updates `amount`, `description`, `expected_date`, `category_id`, etc. Once the "
        "receivable has been marked received, the linked transaction is preserved — only the "
        "metadata changes here.\n\n"
        "Non-admins can only update receivables they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this receivable."},
        404: {"description": "Receivable not found."},
        422: {"description": "Validation error."},
    },
)
def update_receivable(
    receivable_id: int,
    payload: ReceivableUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    updated = receivable_service.update(db, r, payload, user)
    return receivable_service.to_out(updated)


@router.delete(
    "/{receivable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a receivable",
    description=(
        "Permanently removes a receivable. Any settlement transaction posted via "
        "`mark-as-received` remains on the destination account — only the receivable record "
        "itself is removed.\n\n"
        "Non-admins can only delete receivables they created."
    ),
    responses={
        204: {"description": "Receivable deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this receivable."},
        404: {"description": "Receivable not found."},
    },
)
def delete_receivable(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    r = receivable_service.get(db, user, receivable_id)
    receivable_service.delete(db, r)


@router.post(
    "/{receivable_id}/mark-as-received",
    response_model=ReceivableOut,
    summary="Settle a receivable by booking an income transaction",
    description=(
        "Settles the receivable in full. Side-effects:\n\n"
        "1. Creates an `income` transaction on the destination account.\n"
        "2. Promotes the receivable status to `received`.\n\n"
        "**Currency rule**: the destination account must share the same `currency_code` as "
        "the receivable.\n\n"
        "**ACL**: caller needs `write` permission on the destination account."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own the receivable or lacks write access on the destination account."},
        404: {"description": "Receivable or destination account not found."},
        422: {"description": "Validation error (currency mismatch, ...)."},
    },
)
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


@router.post(
    "/{receivable_id}/unmark-as-received",
    response_model=ReceivableOut,
    summary="Reverse the settlement of a receivable",
    description=(
        "Rolls back the income transaction created by `mark-as-received` and returns the "
        "receivable to the `pending` (or `overdue`, if past expected_date) bucket.\n\n"
        "**ACL**: caller needs ownership of the receivable plus write access on the destination "
        "account."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own the receivable or lacks write access on the destination account."},
        404: {"description": "Receivable not found."},
    },
)
def unmark_as_received(
    receivable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReceivableOut:
    r = receivable_service.get(db, user, receivable_id)
    updated = receivable_service.unmark_as_received(db, r, user)
    return receivable_service.to_out(updated)

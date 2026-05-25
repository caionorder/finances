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


@router.get(
    "",
    response_model=CursorPage[PayableOut],
    summary="List payables (cursor-paginated)",
    description=(
        "Lists bills the caller has visibility on, optionally filtered by status bucket, "
        "due-date range, account, category and currency.\n\n"
        "**Status buckets**:\n\n"
        "* `pending` — unpaid and not yet overdue (`due_date >= today`).\n"
        "* `partially_paid` — at least one payment recorded but `paid_amount < amount`.\n"
        "* `paid` — fully paid (`paid_amount >= amount`).\n"
        "* `overdue` — unpaid and past due (`due_date < today`).\n\n"
        "**Visibility**: admins see everything; non-admins see only payables they created.\n\n"
        "**Pagination**: pass the previous response's `next_cursor` back as `?cursor=...`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (invalid status enum, malformed date, ...)."},
    },
)
def list_payables(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_: str | None = Query(
        None,
        alias="status",
        pattern="^(paid|partially_paid|pending|overdue)$",
        description="Restrict to a single status bucket: `paid`, `partially_paid`, `pending`, or `overdue`.",
    ),
    from_date: date | None = Query(
        None,
        alias="from",
        description="Inclusive lower bound on `due_date` (ISO YYYY-MM-DD).",
    ),
    to_date: date | None = Query(
        None,
        alias="to",
        description="Inclusive upper bound on `due_date` (ISO YYYY-MM-DD).",
    ),
    account_id: int | None = Query(
        None,
        description="Restrict to payables targeting a specific account.",
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
    summary="Create a payable (bill to pay)",
    description=(
        "Creates a new bill the caller owes. Payables are open until either:\n\n"
        "* `paid_amount` reaches `amount` (via `mark-as-paid` calls), or\n"
        "* the payable is deleted.\n\n"
        "Optionally link a recurrence template to auto-generate future instances.\n\n"
        "Currency is set on the payable and is independent from the account that ultimately "
        "settles it — at payment time, the settling account must share the same currency."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (non-positive amount, invalid currency, ...)."},
    },
)
def create_payable(
    payload: PayableCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.create(db, payload, user)
    return payable_service.to_out(p)


@router.get(
    "/outstanding-summary",
    response_model=PayableOutstandingSummary,
    summary="Aggregate outstanding payables grouped by status bucket",
    description=(
        "Returns total outstanding amounts split into the `pending`, `partially_paid` and "
        "`overdue` buckets, plus a grand total of unpaid value. Useful to drive dashboard "
        "tiles without loading the full payable list.\n\n"
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
) -> PayableOutstandingSummary:
    return payable_service.outstanding_summary(db, user, currency_code=currency_code)


@router.get(
    "/upcoming",
    response_model=list[PayableOut],
    summary="List unpaid payables due within the next N days",
    description=(
        "Returns payables with `due_date` between today and `today + days` (inclusive on "
        "both ends) that still have outstanding balance (`paid_amount < amount`). Results are "
        "ordered by `due_date ASC` and not paginated — capped implicitly by the `days` window.\n\n"
        "Drives the **\"Próximas Contas\"** widget on the dashboard.\n\n"
        "**Visibility**: admins see everything; non-admins see only payables they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_upcoming(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    days: int = Query(
        7,
        ge=1,
        le=90,
        description="Look-ahead window in days (1-90). Defaults to 7.",
    ),
) -> list[PayableOut]:
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


@router.get(
    "/{payable_id}",
    response_model=PayableOut,
    summary="Get a single payable by id",
    description=(
        "Returns the full payable record with its derived status bucket and payment history. "
        "Non-admins can only fetch payables they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this payable."},
        404: {"description": "Payable not found."},
    },
)
def get_payable(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    return payable_service.to_out(p)


@router.patch(
    "/{payable_id}",
    response_model=PayableOut,
    summary="Update mutable fields of a payable",
    description=(
        "Updates `amount`, `description`, `due_date`, `category_id`, etc. Cannot change the "
        "currency once payments have been recorded.\n\n"
        "Non-admins can only update payables they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this payable."},
        404: {"description": "Payable not found."},
        422: {"description": "Validation error."},
    },
)
def update_payable(
    payable_id: int,
    payload: PayableUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    updated = payable_service.update(db, p, payload, user)
    return payable_service.to_out(updated)


@router.delete(
    "/{payable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a payable",
    description=(
        "Permanently removes a payable. Any linked payment transactions remain on the "
        "settling account — only the payable record itself is removed.\n\n"
        "Non-admins can only delete payables they created."
    ),
    responses={
        204: {"description": "Payable deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this payable."},
        404: {"description": "Payable not found."},
    },
)
def delete_payable(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    p = payable_service.get(db, user, payable_id)
    payable_service.delete(db, p)


@router.post(
    "/{payable_id}/mark-as-paid",
    response_model=PayableOut,
    summary="Record a payment against a payable (full or partial)",
    description=(
        "Books a payment of `amount` (defaults to the remaining balance) settled by `account_id` "
        "on `paid_at`. Side-effects:\n\n"
        "1. Creates an `expense` transaction on the settling account.\n"
        "2. Increments the payable's `paid_amount`.\n"
        "3. Promotes the payable to `partially_paid` or `paid` depending on the new balance.\n\n"
        "**Currency rule**: the settling account must share the same `currency_code` as the "
        "payable.\n\n"
        "**ACL**: caller needs `write` permission on the settling account."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own the payable, or lacks write access on the settling account."},
        404: {"description": "Payable or settling account not found."},
        422: {"description": "Validation error (overpayment, currency mismatch, ...)."},
    },
)
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


@router.post(
    "/{payable_id}/unmark-as-paid",
    response_model=PayableOut,
    summary="Reverse all payments on a payable",
    description=(
        "Rolls back every payment recorded against this payable: the corresponding settlement "
        "transactions are deleted from their accounts and `paid_amount` is reset to zero. The "
        "payable returns to the `pending` (or `overdue`, if past due_date) bucket.\n\n"
        "**ACL**: caller needs ownership of the payable plus write access on each affected "
        "settling account."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own the payable or lacks write access on a settling account."},
        404: {"description": "Payable not found."},
    },
)
def unmark_as_paid(
    payable_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PayableOut:
    p = payable_service.get(db, user, payable_id)
    updated = payable_service.unmark_as_paid(db, p, user)
    return payable_service.to_out(updated)

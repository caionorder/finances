from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import Investment, InvestmentMovement, User
from app.models.enums import UserRole
from app.schemas.investment import (
    InvestmentCreate,
    InvestmentOut,
    InvestmentUpdate,
    InvestmentWithPosition,
    MovementCreate,
    MovementOut,
    PositionResponse,
    ProjectionResponse,
)
from app.services import investment_service

router = APIRouter(prefix="/investments", tags=["investments"])


def _resolve_inv_for_user(db: Session, inv_id: int, user: User) -> Investment:
    inv = db.get(Investment, inv_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "investment not found")
    if user.role != UserRole.admin and inv.created_by_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no access to this investment")
    return inv


@router.get(
    "",
    response_model=list[InvestmentWithPosition],
    summary="List investments visible to the caller, with live positions",
    description=(
        "Returns every investment the caller owns (or, if admin, every investment in the "
        "system), enriched with the current position: invested amount, current value, "
        "profit/loss and yield-to-date.\n\n"
        "**Visibility**: admins see everything; non-admins see only investments they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_investments(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    include_archived: bool = Query(
        False,
        description="Include archived investments in the response (default: false).",
    ),
) -> list:
    return investment_service.list_investments(db, user, include_archived)


@router.post(
    "",
    response_model=InvestmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new investment position",
    description=(
        "Registers a new investment (fixed income, equities, crypto, ...) pinned to a single "
        "currency. The investment starts with zero movements — register contributions and "
        "withdrawals via `POST /investments/{inv_id}/movements`.\n\n"
        "Fields such as `expected_yield_rate` and `maturity_date` are used by the projection "
        "endpoint."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (invalid currency, malformed yield rate, ...)."},
    },
)
def create_investment(
    payload: InvestmentCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    return investment_service.create(db, payload, user)


@router.get(
    "/{inv_id}",
    response_model=InvestmentOut,
    summary="Get a single investment by id",
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
    },
)
def get_investment(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    return _resolve_inv_for_user(db, inv_id, user)


@router.patch(
    "/{inv_id}",
    response_model=InvestmentOut,
    summary="Update mutable fields of an investment",
    description=(
        "Updates fields like `name`, `expected_yield_rate`, `maturity_date`, `notes`. The "
        "currency is immutable — archive and recreate to change it."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
        422: {"description": "Validation error."},
    },
)
def update_investment(
    inv_id: int,
    payload: InvestmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.update(db, inv, payload, user)


@router.delete(
    "/{inv_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Archive an investment (soft-delete)",
    description=(
        "Soft-deletes the investment by archiving it. Historical movements remain queryable "
        "and the investment is hidden from default listings unless "
        "`include_archived=true` is passed to `GET /investments`."
    ),
    responses={
        204: {"description": "Investment archived."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
    },
)
def archive_investment(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    inv = _resolve_inv_for_user(db, inv_id, user)
    investment_service.archive(db, inv, user)


@router.get(
    "/{inv_id}/position",
    response_model=PositionResponse,
    summary="Compute the position of an investment as of a date",
    description=(
        "Walks the movement history up to `as_of` and returns the invested principal, "
        "accrued value, profit/loss and yield. Use this to drive the investment detail page."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
    },
)
def get_position(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    as_of: date | None = Query(
        None,
        description="Snapshot date (ISO YYYY-MM-DD). Defaults to today.",
    ),
) -> dict:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.compute_position(db, inv, as_of or date.today())


@router.get(
    "/{inv_id}/projection",
    response_model=ProjectionResponse,
    summary="Project the future value of an investment up to a date",
    description=(
        "Returns one point per period (typically monthly) projecting the investment value "
        "forward to `until`, based on the current position and the configured "
        "`expected_yield_rate`. Used by the projection chart and runway planning."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
        422: {"description": "Validation error (e.g. `until` not in the future)."},
    },
)
def get_projection(
    inv_id: int,
    until: Annotated[date, Query(description="Projection horizon (ISO YYYY-MM-DD), should be in the future.")],
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    inv = _resolve_inv_for_user(db, inv_id, user)
    points = investment_service.compute_projection(db, inv, until)
    return {"investment_id": inv.id, "until": until, "points": points}


@router.get(
    "/{inv_id}/movements",
    response_model=list[MovementOut],
    summary="List all cash movements registered against an investment",
    description=(
        "Returns the full timeline of contributions, withdrawals and yield events booked "
        "against this investment, ordered by date."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
    },
)
def list_movements(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[InvestmentMovement]:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.list_movements(db, inv)


@router.post(
    "/{inv_id}/movements",
    response_model=MovementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a movement (contribution / withdrawal / yield) on an investment",
    description=(
        "Books a new movement against the investment. Movement kinds:\n\n"
        "* `contribution` — money added to the position.\n"
        "* `withdrawal` — money taken out.\n"
        "* `yield` — interest or dividends recognized.\n\n"
        "The position and projection are recomputed live on every read — there is no "
        "denormalized snapshot to refresh."
    ),
    responses={
        201: {"description": "Movement created."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment not found."},
        422: {"description": "Validation error (negative amount, unknown kind, ...)."},
    },
)
def create_movement(
    inv_id: int,
    payload: MovementCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvestmentMovement:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.add_movement(db, inv, payload, user)


@router.delete(
    "/{inv_id}/movements/{mv_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a single movement from an investment",
    description=(
        "Permanently removes a single movement from the investment's history. The position "
        "is recomputed live on the next read.\n\n"
        "Returns 404 if the movement does not belong to the given investment id."
    ),
    responses={
        204: {"description": "Movement deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this investment."},
        404: {"description": "Investment or movement not found."},
    },
)
def delete_movement(
    inv_id: int,
    mv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    inv = _resolve_inv_for_user(db, inv_id, user)
    mv = db.get(InvestmentMovement, mv_id)
    if not mv or mv.investment_id != inv.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "movement not found")
    investment_service.delete_movement(db, mv, user)

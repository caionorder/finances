from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import User
from app.models.enums import RecurrenceKind
from app.schemas.recurrence import RecurrenceOut, RecurrenceUpdate
from app.services import recurrence_service

router = APIRouter(prefix="/recurrences", tags=["recurrences"])


@router.get(
    "",
    response_model=list[RecurrenceOut],
    summary="List recurrence templates",
    description=(
        "Returns every recurrence template the caller has visibility on. A recurrence template "
        "is a blueprint that auto-generates payable/receivable instances on a schedule "
        "(`monthly`, `weekly`, `yearly`, ...).\n\n"
        "Each recurrence is tied to a `kind` (`payable` or `receivable`) and a `cadence`. The "
        "background scheduler materializes the next instance when due.\n\n"
        "**Visibility**: admins see everything; non-admins see only recurrences they created."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_recurrences(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    kind: RecurrenceKind | None = Query(
        None,
        description="Restrict to a single kind (`payable` or `receivable`).",
    ),
    is_active: bool | None = Query(
        None,
        description="Filter by active flag. `false` returns deactivated/exhausted templates only.",
    ),
) -> list[RecurrenceOut]:
    return recurrence_service.list_recurrences(db, user, kind=kind, is_active=is_active)


@router.get(
    "/{recurrence_id}",
    response_model=RecurrenceOut,
    summary="Get a single recurrence template by id",
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this recurrence."},
        404: {"description": "Recurrence not found."},
    },
)
def get_recurrence(
    recurrence_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> RecurrenceOut:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    return RecurrenceOut.model_validate(rec)


@router.patch(
    "/{recurrence_id}",
    response_model=RecurrenceOut,
    summary="Update mutable fields of a recurrence template",
    description=(
        "Updates fields such as `amount`, `description`, `cadence`, `next_run_date`, "
        "`is_active`. The `kind` (`payable` vs `receivable`) is immutable — deactivate and "
        "create a new one to change kind.\n\n"
        "Changes apply to **future** auto-generated instances only; already-materialized "
        "payables/receivables are untouched."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this recurrence."},
        404: {"description": "Recurrence not found."},
        422: {"description": "Validation error (invalid cadence, past next_run_date, ...)."},
    },
)
def update_recurrence(
    recurrence_id: int,
    payload: RecurrenceUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> RecurrenceOut:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    updated = recurrence_service.update_recurrence(db, rec, payload)
    return RecurrenceOut.model_validate(updated)


@router.delete(
    "/{recurrence_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate a recurrence template (soft-stop)",
    description=(
        "Soft-stops the recurrence by setting `is_active = false`. The template is preserved "
        "in the database but the scheduler stops generating new instances. Already-generated "
        "payables/receivables remain unaffected.\n\n"
        "To re-enable, `PATCH` the recurrence with `is_active = true`."
    ),
    responses={
        204: {"description": "Recurrence deactivated."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this recurrence."},
        404: {"description": "Recurrence not found."},
    },
)
def deactivate_recurrence(
    recurrence_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    recurrence_service.deactivate(db, rec)


@router.post(
    "/{recurrence_id}/generate-next",
    summary="Force-generate the next instance from a recurrence (manual)",
    description=(
        "Bypasses the scheduler and immediately materializes the next payable/receivable "
        "instance from this template. Useful for testing or for catching up a recurrence that "
        "was paused.\n\n"
        "Returns `{generated: false, id: null}` when no new instance was due (template "
        "exhausted, inactive, or already-current). Otherwise returns the new entity's id and "
        "kind."
    ),
    responses={
        200: {"description": "Either a new instance was generated (`generated: true`) or the call was a no-op."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller does not own this recurrence."},
        404: {"description": "Recurrence not found."},
    },
)
def generate_next(
    recurrence_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    entity = recurrence_service.generate_next_manual(db, rec)
    if entity is None:
        return {"generated": False, "id": None}
    return {"generated": True, "id": entity.id, "kind": rec.kind.value}

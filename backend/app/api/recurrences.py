from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import User
from app.models.enums import RecurrenceKind
from app.schemas.recurrence import RecurrenceOut, RecurrenceUpdate
from app.services import recurrence_service

router = APIRouter(prefix="/recurrences", tags=["recurrences"])


@router.get("", response_model=list[RecurrenceOut])
def list_recurrences(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    kind: RecurrenceKind | None = None,
    is_active: bool | None = None,
) -> list[RecurrenceOut]:
    return recurrence_service.list_recurrences(db, user, kind=kind, is_active=is_active)


@router.get("/{recurrence_id}", response_model=RecurrenceOut)
def get_recurrence(
    recurrence_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> RecurrenceOut:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    return RecurrenceOut.model_validate(rec)


@router.patch("/{recurrence_id}", response_model=RecurrenceOut)
def update_recurrence(
    recurrence_id: int,
    payload: RecurrenceUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> RecurrenceOut:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    updated = recurrence_service.update_recurrence(db, rec, payload)
    return RecurrenceOut.model_validate(updated)


@router.delete("/{recurrence_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_recurrence(
    recurrence_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    rec = recurrence_service.get_recurrence(db, user, recurrence_id)
    recurrence_service.deactivate(db, rec)


@router.post("/{recurrence_id}/generate-next")
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

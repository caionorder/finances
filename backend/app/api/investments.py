from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.get("", response_model=list[InvestmentWithPosition])
def list_investments(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    include_archived: bool = False,
) -> list:
    return investment_service.list_investments(db, user, include_archived)


@router.post("", response_model=InvestmentOut, status_code=status.HTTP_201_CREATED)
def create_investment(
    payload: InvestmentCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    return investment_service.create(db, payload, user)


@router.get("/{inv_id}", response_model=InvestmentOut)
def get_investment(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    return _resolve_inv_for_user(db, inv_id, user)


@router.patch("/{inv_id}", response_model=InvestmentOut)
def update_investment(
    inv_id: int,
    payload: InvestmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Investment:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.update(db, inv, payload, user)


@router.delete("/{inv_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_investment(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    inv = _resolve_inv_for_user(db, inv_id, user)
    investment_service.archive(db, inv, user)


@router.get("/{inv_id}/position", response_model=PositionResponse)
def get_position(
    inv_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    as_of: date | None = None,
) -> dict:
    inv = _resolve_inv_for_user(db, inv_id, user)
    return investment_service.compute_position(db, inv, as_of or date.today())


@router.get("/{inv_id}/projection", response_model=ProjectionResponse)
def get_projection(
    inv_id: int,
    until: date,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    inv = _resolve_inv_for_user(db, inv_id, user)
    points = investment_service.compute_projection(db, inv, until)
    return {"investment_id": inv.id, "until": until, "points": points}


@router.get("/{inv_id}/movements", response_model=list[MovementOut])
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

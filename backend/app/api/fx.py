from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.fx import FxRateOut, RefreshResult
from app.services import fx_service

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/rates", response_model=list[FxRateOut])
def list_rates(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    return fx_service.list_latest_rates(db)


@router.post(
    "/refresh",
    response_model=RefreshResult,
    dependencies=[Depends(require_role(UserRole.admin))],
)
def refresh(db: Annotated[Session, Depends(get_db)]) -> dict:
    return fx_service.refresh_rates(db)

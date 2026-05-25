from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.fx import FxRateOut, RefreshResult
from app.services import fx_service

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get(
    "/rates",
    response_model=list[FxRateOut],
    summary="List the most recent FX rate per supported currency",
    description=(
        "Returns the **latest known** FX rate for every currency the system tracks. Each "
        "entry includes `from_currency`, `to_currency`, the decimal `rate` (as a string for "
        "precision), the rate timestamp and the provider name.\n\n"
        "Rates are sourced from an external provider and cached. Trigger a refresh via "
        "`POST /fx/refresh` (admin only)."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_rates(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    return fx_service.list_latest_rates(db)


@router.post(
    "/refresh",
    response_model=RefreshResult,
    dependencies=[Depends(require_role(UserRole.admin))],
    summary="Refresh FX rates from the upstream provider (admin only)",
    description=(
        "Synchronously calls the upstream FX provider, persists the latest rates, and returns "
        "a summary of how many pairs were updated.\n\n"
        "Idempotent — calling multiple times in quick succession only refreshes what changed.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        502: {"description": "Upstream FX provider unreachable or returned an unexpected payload."},
    },
)
def refresh(db: Annotated[Session, Depends(get_db)]) -> dict:
    return fx_service.refresh_rates(db)

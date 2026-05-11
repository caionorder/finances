from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_scope
from app.core.rate_limit import limiter
from app.models import Account, ApiKey, User
from app.schemas.account import AccountCreate, AccountOut
from app.schemas.transaction import TransactionCreate, TransactionOut
from app.services import account_service, report_service, transaction_service

router = APIRouter(prefix="/v1/external", tags=["external"])


def _resolve_user(db: Session, api_key: ApiKey) -> User:
    if api_key.created_by_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="api key has no owner; please re-issue",
        )
    user = db.get(User, api_key.created_by_user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="api key owner is inactive",
        )
    return user


@router.post(
    "/transactions",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("60/minute")
def external_create_transaction(
    request: Request,
    payload: TransactionCreate,
    db: Annotated[Session, Depends(get_db)],
    api_key: Annotated[ApiKey, Depends(require_scope("transactions:write"))],
) -> TransactionOut:
    user = _resolve_user(db, api_key)
    account = db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="account not found"
        )
    tx = transaction_service.create_single(db, account, payload, user)
    return TransactionOut.model_validate(tx)


@router.post(
    "/accounts",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("60/minute")
def external_create_account(
    request: Request,
    payload: AccountCreate,
    db: Annotated[Session, Depends(get_db)],
    api_key: Annotated[ApiKey, Depends(require_scope("accounts:write"))],
) -> AccountOut:
    user = _resolve_user(db, api_key)
    account = account_service.create(db, payload, user)
    return AccountOut.model_validate(account)


@router.get("/reports/cashflow")
@limiter.limit("60/minute")
def external_cashflow(
    request: Request,
    currency: str,
    from_date: str,
    to_date: str,
    db: Annotated[Session, Depends(get_db)],
    api_key: Annotated[ApiKey, Depends(require_scope("reports:read"))],
    group_by: str = "month",
):
    user = _resolve_user(db, api_key)
    try:
        d_from = date.fromisoformat(from_date)
        d_to = date.fromisoformat(to_date)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date and to_date must be ISO dates (YYYY-MM-DD)",
        ) from exc
    if group_by not in {"day", "week", "month"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_by must be one of: day, week, month",
        )
    return report_service.cashflow(db, user, currency, d_from, d_to, group_by)


__all__ = ["router"]

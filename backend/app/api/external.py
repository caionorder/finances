from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
    summary="External: create a transaction via API key",
    description=(
        "Books a new transaction on behalf of the API key's owning user. Intended for "
        "machine-to-machine integrations (agents, automations, ETL jobs).\n\n"
        "**Authentication**: pass the API key via the `X-API-Key` header (NOT a JWT). The "
        "key must carry the `transactions:write` scope.\n\n"
        "**Rate limit**: 60 requests/minute per source IP."
    ),
    responses={
        201: {"description": "Transaction created."},
        401: {"description": "Missing/invalid API key, or key owner is inactive."},
        403: {"description": "API key lacks the `transactions:write` scope."},
        404: {"description": "Target account not found."},
        422: {"description": "Validation error."},
        429: {"description": "Rate limit exceeded (60/minute)."},
    },
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
    summary="External: create an account via API key",
    description=(
        "Creates a new account on behalf of the API key's owning user.\n\n"
        "**Authentication**: pass the API key via the `X-API-Key` header. The key must "
        "carry the `accounts:write` scope.\n\n"
        "**Rate limit**: 60 requests/minute per source IP."
    ),
    responses={
        201: {"description": "Account created."},
        401: {"description": "Missing/invalid API key, or key owner is inactive."},
        403: {"description": "API key lacks the `accounts:write` scope."},
        422: {"description": "Validation error."},
        429: {"description": "Rate limit exceeded (60/minute)."},
    },
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


@router.get(
    "/reports/cashflow",
    summary="External: cashflow report via API key",
    description=(
        "Returns the same cashflow report as `GET /reports/cashflow`, but authenticated via "
        "an API key. Returns income/expense/net totals bucketed by `day`, `week` or `month`.\n\n"
        "**Authentication**: pass the API key via the `X-API-Key` header. The key must "
        "carry the `reports:read` scope.\n\n"
        "**Rate limit**: 60 requests/minute per source IP."
    ),
    responses={
        200: {"description": "Cashflow series returned."},
        400: {"description": "Invalid date format or unsupported `group_by`."},
        401: {"description": "Missing/invalid API key, or key owner is inactive."},
        403: {"description": "API key lacks the `reports:read` scope."},
        429: {"description": "Rate limit exceeded (60/minute)."},
    },
)
@limiter.limit("60/minute")
def external_cashflow(
    request: Request,
    currency: Annotated[str, Query(description="ISO 3-letter currency code (e.g. `BRL`, `USD`, `PYG`).")],
    from_date: Annotated[str, Query(description="Inclusive lower bound (ISO YYYY-MM-DD).")],
    to_date: Annotated[str, Query(description="Inclusive upper bound (ISO YYYY-MM-DD).")],
    db: Annotated[Session, Depends(get_db)],
    api_key: Annotated[ApiKey, Depends(require_scope("reports:read"))],
    group_by: Annotated[str, Query(description="Bucket: `day`, `week` or `month` (default).")] = "month",
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

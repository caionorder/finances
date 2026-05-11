from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import Account, AccountAcl, Transaction, User
from app.models.enums import AclPermission, TransactionKind, UserRole
from app.schemas.common import CursorPage
from app.schemas.transaction import (
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
    TransferCreate,
    TransferOut,
)
from app.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _check_account_perm(
    db: Session,
    user: User,
    account_id: int,
    permission: AclPermission,
) -> None:
    if user.role == UserRole.admin:
        return
    acl = db.get(AccountAcl, (account_id, user.id))
    if acl is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="no access to this account"
        )
    if permission == AclPermission.write and acl.permission != AclPermission.write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="read-only access"
        )


@router.get(
    "",
    response_model=CursorPage[TransactionOut],
    summary="List transactions (cursor-paginated)",
    description=(
        "Returns transactions visible to the caller, optionally filtered by "
        "account, kind, category, date range or free-text on the description.\n\n"
        "**Pagination**: pass the `next_cursor` value from the previous response back "
        "as `?cursor=...` to get the next page. The response is empty when there are "
        "no more results.\n\n"
        "**ACL**: only transactions belonging to accounts the caller can `read` are "
        "returned. Admins see everything."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
    },
)
def list_transactions(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    account_id: int | None = Query(None, description="Restrict to a single account."),
    kind: TransactionKind | None = Query(None, description="Filter by income/expense/transfer."),
    category_id: int | None = Query(None, description="Filter by category id."),
    date_from: date | None = Query(None, description="Inclusive lower bound (YYYY-MM-DD)."),
    date_to: date | None = Query(None, description="Inclusive upper bound (YYYY-MM-DD)."),
    search: str | None = Query(None, description="Substring match on description (case-insensitive)."),
    cursor: str | None = Query(None, description="Opaque cursor from the previous page's `next_cursor`."),
    limit: int = Query(50, ge=1, le=200, description="Max items per page (1-200)."),
) -> CursorPage[TransactionOut]:
    return transaction_service.list_transactions(
        db,
        user,
        filters={
            "account_id": account_id,
            "kind": kind,
            "category_id": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
        },
        cursor=cursor,
        limit=limit,
    )


@router.post(
    "",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a single transaction on an account",
    description=(
        "Books an `income`, `expense` or `transfer` transaction against an existing "
        "account.\n\n"
        "* `amount` must be **positive** — the `kind` determines the balance effect "
        "(income → +, expense → -).\n"
        "* `currency_code` is **inherited** from the parent account; do not send it.\n"
        "* For transfers between two of *your* accounts, use `POST /transactions/transfer` "
        "instead so both legs are linked via `transfer_pair_id`.\n\n"
        "**ACL**: caller needs `write` permission on `account_id` (or admin)."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller has no write access to the target account."},
        404: {"description": "Account not found."},
        422: {"description": "Validation error (negative amount, invalid date, unknown category, ...)."},
    },
)
def create_transaction(
    payload: TransactionCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Transaction:
    account = db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    _check_account_perm(db, user, payload.account_id, AclPermission.write)
    return transaction_service.create_single(db, account, payload, user)


@router.post(
    "/transfer",
    response_model=TransferOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a linked transfer between two accounts",
    description=(
        "Atomically creates **two paired transactions** (one outgoing, one incoming) "
        "linked via `transfer_pair_id`. Both accounts must share the same currency.\n\n"
        "**ACL**: caller needs `write` permission on both source and destination accounts."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on one of the accounts."},
        404: {"description": "Source or destination account not found."},
        422: {"description": "Validation error (currency mismatch, same account on both sides, ...)."},
    },
)
def create_transfer(
    payload: TransferCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TransferOut:
    src = db.get(Account, payload.source_account_id)
    if src is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="source account not found"
        )
    dst = db.get(Account, payload.destination_account_id)
    if dst is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="destination account not found"
        )
    _check_account_perm(db, user, src.id, AclPermission.write)
    _check_account_perm(db, user, dst.id, AclPermission.write)

    out, inb = transaction_service.create_transfer(db, src, dst, payload, user)
    return TransferOut(
        source_transaction=TransactionOut.model_validate(out),
        destination_transaction=TransactionOut.model_validate(inb),
    )


@router.get(
    "/{transaction_id}",
    response_model=TransactionOut,
    summary="Get a single transaction by id",
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller has no read access to the transaction's account."},
        404: {"description": "Transaction not found."},
    },
)
def get_transaction(
    transaction_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Transaction:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction not found")
    _check_account_perm(db, user, tx.account_id, AclPermission.read)
    return tx


@router.patch(
    "/{transaction_id}",
    response_model=TransactionOut,
    summary="Update mutable fields of a transaction",
    description=(
        "Updates `amount`, `category_id`, `date` or `description`. The `kind` and "
        "`account_id` cannot be changed — delete and recreate instead.\n\n"
        "**ACL**: caller needs `write` permission on the account."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on the account."},
        404: {"description": "Transaction not found."},
    },
)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Transaction:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction not found")
    _check_account_perm(db, user, tx.account_id, AclPermission.write)
    return transaction_service.update(db, tx, payload)


@router.delete(
    "/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a transaction",
    description=(
        "Deletes a transaction. If the transaction is part of a transfer pair, the "
        "paired leg is **also deleted** to keep balances consistent.\n\n"
        "**ACL**: caller needs `write` permission on the account."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on the account."},
        404: {"description": "Transaction not found."},
    },
)
def delete_transaction(
    transaction_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction not found")
    _check_account_perm(db, user, tx.account_id, AclPermission.write)
    transaction_service.delete(db, tx)

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.core.deps import (
    get_current_user,
    get_db,
    require_account_access,
    require_role,
)
from app.models import Account, User
from app.models.enums import AclPermission, UserRole
from app.schemas.account import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    AccountWithBalance,
    AclEntryOut,
    AclSetRequest,
    BalanceResponse,
)
from app.services import account_service

router = APIRouter(prefix="/accounts", tags=["accounts"])
require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=list[AccountWithBalance],
    summary="List accounts visible to the caller, with live balances",
    description=(
        "Returns every account the caller can `read` on, augmented with the **current balance** "
        "(sum of income/expense/transfer transactions to date).\n\n"
        "* Admins see all accounts.\n"
        "* Non-admins only see accounts where they have an `AccountAcl` entry.\n\n"
        "Each item carries its own `currency_code` — clients should not assume a single "
        "currency across the response."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_accounts(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    include_archived: bool = Query(
        False,
        description="Include archived accounts in the response (default: false).",
    ),
) -> list[AccountWithBalance]:
    return account_service.list_visible_with_balance(db, user, include_archived=include_archived)


@router.post(
    "",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    summary="Create a new account (admin only)",
    description=(
        "Creates an account (`checking`, `savings`, `cash`, `investment`, ...) pinned to a "
        "**single currency** (`BRL`, `USD`, `PYG`, ...). Currency is immutable once set; "
        "transactions on the account inherit it.\n\n"
        "After creation, grant individual users read/write access via "
        "`PUT /accounts/{account_id}/acls`.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        201: {"description": "Account created."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        422: {"description": "Validation error (unknown account type, invalid currency, ...)."},
    },
)
def create_account(
    payload: AccountCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Account:
    return account_service.create(db, payload, user)


@router.get(
    "/{account_id}",
    response_model=AccountOut,
    summary="Get a single account by id",
    description=(
        "Returns the full account record. The caller needs `read` permission on the account "
        "(or admin role)."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has no read access to this account."},
        404: {"description": "Account not found."},
    },
)
def get_account(
    account: Annotated[Account, Depends(require_account_access(AclPermission.read))],
) -> Account:
    return account


@router.patch(
    "/{account_id}",
    response_model=AccountOut,
    summary="Update mutable fields of an account",
    description=(
        "Updates `name`, `type`, `archived` flag, or other mutable metadata. The "
        "`currency_code` is **immutable** — to change currency, archive and recreate the "
        "account.\n\n"
        "**ACL**: caller needs `write` permission on the account (or admin)."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller lacks write access on this account."},
        404: {"description": "Account not found."},
        422: {"description": "Validation error."},
    },
)
def update_account(
    payload: AccountUpdate,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_account_access(AclPermission.write))],
    user: Annotated[User, Depends(get_current_user)],
) -> Account:
    return account_service.update(db, account, payload, user)


@router.delete(
    "/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    summary="Archive an account (admin only — soft-delete)",
    description=(
        "Marks the account as archived. Archived accounts are hidden from default listings "
        "(`GET /accounts` returns only `is_archived = false` unless `include_archived=true`) "
        "but historical transactions remain queryable.\n\n"
        "Archiving is **soft**: the row is preserved for audit and reporting. There is no hard "
        "delete endpoint by design.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        204: {"description": "Account archived."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "Account not found."},
    },
)
def archive_account(
    account_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    account_service.archive(db, account, user)


@router.get(
    "/{account_id}/balance",
    response_model=BalanceResponse,
    summary="Get an account's balance as of a date",
    description=(
        "Computes the balance of the account up to (and including) the supplied `as_of` date. "
        "If `as_of` is omitted, today's date is used.\n\n"
        "The balance is calculated as the signed sum of all transactions on the account "
        "(income +, expense -, transfer ± depending on direction).\n\n"
        "**ACL**: caller needs `read` permission on the account (or admin)."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has no read access to this account."},
        404: {"description": "Account not found."},
    },
)
def get_balance(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_account_access(AclPermission.read))],
    as_of: date | None = Query(
        None,
        description="Compute the balance up to this date inclusive (ISO YYYY-MM-DD). Defaults to today.",
    ),
) -> BalanceResponse:
    return account_service.get_balance(db, account, as_of or date.today())


@router.get(
    "/{account_id}/acls",
    response_model=list[AclEntryOut],
    dependencies=[Depends(require_admin)],
    summary="List ACL entries for an account (admin only)",
    description=(
        "Returns the per-user access list for this account — one entry per user with their "
        "`read` or `write` permission level. Admins implicitly bypass this list.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "Account not found."},
    },
)
def list_acls(
    account_id: Annotated[int, Path(description="Target account id.")],
    db: Annotated[Session, Depends(get_db)],
) -> list[AclEntryOut]:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    return account_service.list_acls(db, account)


@router.put(
    "/{account_id}/acls",
    response_model=list[AclEntryOut],
    dependencies=[Depends(require_admin)],
    summary="Replace the full ACL list for an account (admin only)",
    description=(
        "**Idempotent replacement** of the account's ACL list — any user not in the supplied "
        "`acls` array loses access. Use this to bulk-set permissions in a single call.\n\n"
        "* To add a single user without disturbing the rest, fetch the current list, append, "
        "and PUT the union back.\n"
        "* To remove a single user, prefer `DELETE /accounts/{id}/acls/{user_id}` for clarity.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "Account not found, or one of the user ids is unknown."},
        422: {"description": "Validation error (invalid permission enum, duplicate user ids, ...)."},
    },
)
def set_acls(
    account_id: Annotated[int, Path(description="Target account id.")],
    payload: AclSetRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[AclEntryOut]:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    return account_service.set_acls(db, account, payload.acls, user)


@router.delete(
    "/{account_id}/acls/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    summary="Remove a single user's access to an account (admin only)",
    description=(
        "Deletes the ACL entry for `user_id` on this account. The user immediately loses "
        "access to the account and its transactions (unless they are an admin).\n\n"
        "Idempotent: removing an absent ACL is a no-op and still returns 204.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        204: {"description": "ACL entry removed (or was already absent)."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "Account not found."},
    },
)
def remove_acl(
    account_id: Annotated[int, Path(description="Target account id.")],
    user_id: Annotated[int, Path(description="User whose access should be revoked.")],
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    account_service.remove_acl(db, account, user_id, current)

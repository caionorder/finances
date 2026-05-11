from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.get("", response_model=list[AccountWithBalance])
def list_accounts(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    include_archived: bool = False,
) -> list[AccountWithBalance]:
    return account_service.list_visible_with_balance(db, user, include_archived=include_archived)


@router.post(
    "",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_account(
    payload: AccountCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Account:
    return account_service.create(db, payload, user)


@router.get("/{account_id}", response_model=AccountOut)
def get_account(
    account: Annotated[Account, Depends(require_account_access(AclPermission.read))],
) -> Account:
    return account


@router.patch("/{account_id}", response_model=AccountOut)
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


@router.get("/{account_id}/balance", response_model=BalanceResponse)
def get_balance(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_account_access(AclPermission.read))],
    as_of: date | None = None,
) -> BalanceResponse:
    return account_service.get_balance(db, account, as_of or date.today())


@router.get(
    "/{account_id}/acls",
    response_model=list[AclEntryOut],
    dependencies=[Depends(require_admin)],
)
def list_acls(
    account_id: int,
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
)
def set_acls(
    account_id: int,
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
)
def remove_acl(
    account_id: int,
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
    account_service.remove_acl(db, account, user_id, current)

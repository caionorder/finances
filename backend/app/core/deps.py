from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models import Account, AccountAcl, ApiKey, CreditCard, CreditCardAcl, User
from app.models.enums import AclPermission, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong token type"
        )
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found or inactive")
    return user


def require_role(*roles: UserRole):
    def dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role"
            )
        return user

    return dep


def require_account_access(permission: AclPermission = AclPermission.read):
    def dep(
        account_id: int,
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> Account:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account not found")
        if user.role == UserRole.admin:
            return account
        acl = db.get(AccountAcl, (account_id, user.id))
        if acl is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no access to this account")
        if permission == AclPermission.write and acl.permission != AclPermission.write:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="read-only access")
        return account

    return dep


def require_credit_card_access(permission: AclPermission = AclPermission.read):
    def dep(
        credit_card_id: int,
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> CreditCard:
        card = db.get(CreditCard, credit_card_id)
        if card is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found")
        if user.role == UserRole.admin:
            return card
        acl = db.get(CreditCardAcl, (credit_card_id, user.id))
        if acl is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no access to this credit card")
        if permission == AclPermission.write and acl.permission != AclPermission.write:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="read-only access")
        return card

    return dep


def get_api_key(
    db: Annotated[Session, Depends(get_db)],
    x_api_key: Annotated[str | None, Header(alias=settings.API_KEY_HEADER)] = None,
) -> ApiKey:
    from app.services import api_key_service

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"missing {settings.API_KEY_HEADER}",
        )
    api_key = api_key_service.lookup_by_plain(db, x_api_key)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or revoked API key",
        )
    return api_key


def require_scope(scope: str):
    def dep(api_key: Annotated[ApiKey, Depends(get_api_key)]) -> ApiKey:
        scopes = api_key.scopes_json or []
        if scope not in scopes and "*" not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"missing scope: {scope}",
            )
        return api_key

    return dep


__all__ = [
    "get_db",
    "oauth2_scheme",
    "get_current_user",
    "require_role",
    "require_account_access",
    "require_credit_card_access",
    "get_api_key",
    "require_scope",
]

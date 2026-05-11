import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import TokenResponse, UserPublic
from app.services import audit_service


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _client_meta(request: Request | None) -> tuple[str | None, str | None]:
    if request is None:
        return None, None
    user_agent = request.headers.get("user-agent")
    if user_agent and len(user_agent) > 255:
        user_agent = user_agent[:255]
    ip = request.client.host if request.client else None
    return user_agent, ip


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.execute(
        select(User).where(User.email == email, User.is_active.is_(True))
    ).scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def issue_tokens(db: Session, user: User, request: Request | None = None) -> TokenResponse:
    access = create_access_token(
        subject=user.id,
        extra_claims={"email": user.email, "role": user.role.value},
    )
    refresh = create_refresh_token(subject=user.id)
    expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    user_agent, ip = _client_meta(request)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_refresh(refresh),
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip,
        )
    )
    audit_service.log_action(
        db,
        user.id,
        "login",
        "User",
        user.id,
        {"ip": ip, "user_agent": user_agent},
    )
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic.model_validate(user),
    )


def rotate_refresh(
    db: Session, refresh_token_str: str, request: Request | None = None
) -> TokenResponse:
    try:
        payload = decode_token(refresh_token_str)
    except ValueError as exc:
        raise ValueError("invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise ValueError("invalid refresh token")

    token_hash = _hash_refresh(refresh_token_str)
    record = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if record is None:
        raise ValueError("invalid refresh token")
    if record.revoked_at is not None:
        raise ValueError("refresh token revoked")
    if record.expires_at < datetime.now(UTC).replace(tzinfo=None):
        raise ValueError("refresh token expired")

    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise ValueError("user inactive")

    now_naive = datetime.now(UTC).replace(tzinfo=None)
    result = db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == record.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now_naive)
    )
    db.flush()
    if result.rowcount == 0:
        raise ValueError("refresh token already rotated")
    return issue_tokens(db, user, request)


def revoke_refresh(db: Session, refresh_token_str: str) -> None:
    token_hash = _hash_refresh(refresh_token_str)
    record = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if record is None or record.revoked_at is not None:
        return
    record.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    records = db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    ).scalars().all()
    for record in records:
        record.revoked_at = now
    db.commit()

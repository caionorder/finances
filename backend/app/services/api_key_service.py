import hashlib
import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApiKey, User
from app.schemas.api_key import ApiKeyCreate, ApiKeyOut
from app.services import audit_service


def _hash_key(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _scopes_of(api_key: ApiKey) -> list[str]:
    raw = api_key.scopes_json
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(s) for s in raw]
    return []


def _to_out(api_key: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=api_key.id,
        name=api_key.name,
        scopes=_scopes_of(api_key),
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
        created_by_user_id=api_key.created_by_user_id,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


def list_keys(db: Session) -> list[ApiKeyOut]:
    rows = db.execute(select(ApiKey).order_by(ApiKey.id.desc())).scalars().all()
    return [_to_out(row) for row in rows]


def create_key(
    db: Session, payload: ApiKeyCreate, user: User
) -> tuple[ApiKey, str]:
    plain = secrets.token_urlsafe(32)
    api_key = ApiKey(
        key_hash=_hash_key(plain),
        name=payload.name,
        scopes_json=list(payload.scopes),
        created_by_user_id=user.id,
    )
    db.add(api_key)
    db.flush()
    audit_service.log_action(
        db,
        user.id,
        "create",
        "ApiKey",
        api_key.id,
        {"name": payload.name, "scopes": list(payload.scopes)},
    )
    db.commit()
    db.refresh(api_key)
    return api_key, plain


def revoke_key(db: Session, key_id: int, user: User) -> ApiKey | None:
    api_key = db.get(ApiKey, key_id)
    if api_key is None:
        return None
    if api_key.revoked_at is None:
        api_key.revoked_at = _now()
        audit_service.log_action(
            db, user.id, "revoke", "ApiKey", api_key.id, None
        )
        db.commit()
        db.refresh(api_key)
    return api_key


def delete_key(db: Session, key_id: int, actor_user_id: int | None = None) -> bool:
    api_key = db.get(ApiKey, key_id)
    if api_key is None:
        return False
    db.delete(api_key)
    audit_service.log_action(db, actor_user_id, "delete", "ApiKey", key_id, None)
    db.commit()
    return True


def lookup_by_plain(db: Session, plain: str) -> ApiKey | None:
    if not plain:
        return None
    token_hash = _hash_key(plain)
    api_key = db.execute(
        select(ApiKey).where(ApiKey.key_hash == token_hash)
    ).scalar_one_or_none()
    if api_key is None:
        return None
    if api_key.revoked_at is not None:
        return None
    api_key.last_used_at = _now()
    db.commit()
    db.refresh(api_key)
    return api_key


def scopes_property(api_key: ApiKey) -> list[str]:
    return _scopes_of(api_key)


__all__ = [
    "list_keys",
    "create_key",
    "revoke_key",
    "delete_key",
    "lookup_by_plain",
    "scopes_property",
]

import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit_service, auth_service


def _generate_password() -> str:
    return secrets.token_urlsafe(12)


def list_users(db: Session) -> list[User]:
    return list(db.execute(select(User).order_by(User.id)).scalars().all())


def create_user(
    db: Session, payload: UserCreate, actor_user_id: int | None = None
) -> tuple[User, str]:
    plain = _generate_password()
    user = User(
        email=str(payload.email),
        name=payload.name,
        role=payload.role,
        password_hash=hash_password(plain),
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
        audit_service.log_action(
            db,
            actor_user_id,
            "create",
            "User",
            user.id,
            {
                "email": str(payload.email),
                "name": payload.name,
                "role": payload.role.value
                if hasattr(payload.role, "value")
                else payload.role,
            },
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("email already registered") from exc
    db.refresh(user)
    return user, plain


def update_user(
    db: Session, user_id: int, payload: UserUpdate, actor_user_id: int | None = None
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    data = payload.model_dump(exclude_unset=True, mode="json")
    if "name" in data and data["name"] is not None:
        user.name = data["name"]
    if "role" in data and data["role"] is not None:
        user.role = data["role"]
    if "is_active" in data and data["is_active"] is not None:
        user.is_active = data["is_active"]
        if data["is_active"] is False:
            auth_service.revoke_all_for_user(db, user.id)
    audit_service.log_action(db, actor_user_id, "update", "User", user.id, data)
    db.commit()
    db.refresh(user)
    return user


def soft_delete_user(
    db: Session, user_id: int, actor_user_id: int | None = None
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    user.is_active = False
    audit_service.log_action(db, actor_user_id, "delete", "User", user.id, None)
    db.commit()
    auth_service.revoke_all_for_user(db, user.id)


def reset_password(
    db: Session, user_id: int, actor_user_id: int | None = None
) -> str:
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("user not found")
    plain = _generate_password()
    user.password_hash = hash_password(plain)
    audit_service.log_action(
        db, actor_user_id, "reset_password", "User", user.id, None
    )
    db.commit()
    auth_service.revoke_all_for_user(db, user.id)
    return plain


def change_password(
    db: Session, user: User, current_password: str, new_password: str
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise ValueError("current password is incorrect")
    user.password_hash = hash_password(new_password)
    audit_service.log_action(
        db, user.id, "change_password", "User", user.id, None
    )
    db.commit()
    auth_service.revoke_all_for_user(db, user.id)

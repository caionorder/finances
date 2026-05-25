from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.user import (
    ChangePasswordRequest,
    PasswordResetResponse,
    UserCreate,
    UserCreatedResponse,
    UserListItem,
    UserUpdate,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])

require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=list[UserListItem],
    dependencies=[Depends(require_admin)],
    summary="List all users (admin only)",
    description=(
        "Returns every user in the system — active, inactive and soft-deleted. Each entry "
        "includes id, email, name, role and `is_active` flag.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
    },
)
def list_users(db: Annotated[Session, Depends(get_db)]) -> list[User]:
    return user_service.list_users(db)


@router.post(
    "",
    response_model=UserCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    summary="Create a new user (admin only)",
    description=(
        "Provisions a new user account with the supplied email, name and role. A random "
        "**temporary password** is generated server-side and returned in the response — it is "
        "**only ever shown here**, so the admin must hand it to the user immediately.\n\n"
        "The new user is created with `is_active = true` and is expected to change their "
        "password on first login via `POST /users/me/change-password`.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        201: {"description": "User created. Capture `temporary_password` — it cannot be retrieved later."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        409: {"description": "A user with the same email already exists."},
        422: {"description": "Validation error (invalid email, weak constraints, ...)."},
    },
)
def create_user(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> UserCreatedResponse:
    try:
        user, password = user_service.create_user(db, payload, actor_user_id=current.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    return UserCreatedResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        temporary_password=password,
    )


@router.patch(
    "/{user_id}",
    response_model=UserListItem,
    dependencies=[Depends(require_admin)],
    summary="Update a user's profile fields (admin only)",
    description=(
        "Updates mutable fields on a user record: `name`, `role`, `is_active`. The email "
        "address is immutable post-creation — to change it, deactivate the user and create a "
        "new one.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "User not found."},
        422: {"description": "Validation error (invalid role enum, ...)."},
    },
)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> User:
    try:
        return user_service.update_user(db, user_id, payload, actor_user_id=current.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    summary="Soft-delete a user (admin only)",
    description=(
        "Marks the user as deleted by clearing `is_active` and anonymizing the email. The "
        "physical row is preserved so existing audit logs and historical references remain "
        "consistent.\n\n"
        "An admin **cannot soft-delete themselves** — attempt returns 400.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        204: {"description": "User soft-deleted."},
        400: {"description": "Caller attempted to delete their own account."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "User not found."},
    },
)
def delete_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    if user_id == current.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="cannot delete yourself"
        )
    try:
        user_service.soft_delete_user(db, user_id, actor_user_id=current.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@router.post(
    "/{user_id}/reset-password",
    response_model=PasswordResetResponse,
    dependencies=[Depends(require_admin)],
    summary="Reset a user's password to a fresh temporary value (admin only)",
    description=(
        "Generates a new random temporary password for the target user, persists its hash and "
        "returns the **plaintext** value exactly once. Existing refresh tokens for that user "
        "should be considered compromised — clients typically pair this with a refresh-token "
        "revocation pass.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        200: {"description": "Password reset. Capture `temporary_password` — it cannot be retrieved later."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "User not found."},
    },
)
def reset_password(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> PasswordResetResponse:
    try:
        pwd = user_service.reset_password(db, user_id, actor_user_id=current.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return PasswordResetResponse(temporary_password=pwd)


@router.post(
    "/me/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the authenticated user's own password",
    description=(
        "Rotates the caller's password. Requires the **current** password as proof of "
        "possession plus the desired **new** password (subject to server-side strength rules).\n\n"
        "Any user can call this endpoint to change their own password — no admin role is "
        "required. Existing access/refresh tokens are **not** revoked automatically; call "
        "`POST /auth/logout` separately if you want to invalidate the session on other devices."
    ),
    responses={
        204: {"description": "Password changed successfully."},
        400: {"description": "Current password is incorrect, or new password fails strength rules."},
        401: {"description": "Missing or invalid access token."},
    },
)
def change_password(
    payload: ChangePasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    try:
        user_service.change_password(db, user, payload.current_password, payload.new_password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

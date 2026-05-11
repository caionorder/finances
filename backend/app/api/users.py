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
)
def list_users(db: Annotated[Session, Depends(get_db)]) -> list[User]:
    return user_service.list_users(db)


@router.post(
    "",
    response_model=UserCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
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


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
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

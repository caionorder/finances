from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyOut
from app.services import api_key_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=list[ApiKeyOut],
    dependencies=[Depends(require_admin)],
)
def list_api_keys(db: Annotated[Session, Depends(get_db)]) -> list[ApiKeyOut]:
    return api_key_service.list_keys(db)


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_api_key(
    payload: ApiKeyCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ApiKeyCreatedResponse:
    api_key, plain = api_key_service.create_key(db, payload, current)
    return ApiKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        scopes=api_key_service.scopes_property(api_key),
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
        created_by_user_id=api_key.created_by_user_id,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
        plain_key=plain,
    )


@router.post(
    "/{key_id}/revoke",
    response_model=ApiKeyOut,
    dependencies=[Depends(require_admin)],
)
def revoke_api_key(
    key_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ApiKeyOut:
    api_key = api_key_service.revoke_key(db, key_id, current)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="api key not found"
        )
    return ApiKeyOut(
        id=api_key.id,
        name=api_key.name,
        scopes=api_key_service.scopes_property(api_key),
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
        created_by_user_id=api_key.created_by_user_id,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_api_key(
    key_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    deleted = api_key_service.delete_key(db, key_id, actor_user_id=current.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="api key not found"
        )

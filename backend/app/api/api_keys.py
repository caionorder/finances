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
    summary="List API keys (admin only)",
    description=(
        "Returns metadata for every API key the system has issued — name, scopes, "
        "`last_used_at`, `revoked_at` and creator. **The plaintext key value is never "
        "exposed here** (it was only returned once at creation time).\n\n"
        "Use this to audit issued keys and to identify dormant or compromised tokens.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
    },
)
def list_api_keys(db: Annotated[Session, Depends(get_db)]) -> list[ApiKeyOut]:
    return api_key_service.list_keys(db)


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    summary="Issue a new API key (admin only)",
    description=(
        "Creates a new long-lived API key bound to a list of `scopes` (e.g. "
        "`transactions:write`, `accounts:write`, `reports:read`). The response includes the "
        "**plaintext key** in `plain_key` — this is the **only time** it will ever be shown. "
        "Hand it to the client immediately and store it as a secret; only its hash is kept on "
        "the server.\n\n"
        "API keys are used for machine-to-machine integrations against the `/v1/external/*` "
        "endpoints via the `X-API-Key` header. They never expire, but can be revoked.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        201: {"description": "API key issued. Capture `plain_key` — it cannot be retrieved later."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        422: {"description": "Validation error (unknown scope, empty name, ...)."},
    },
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
    summary="Revoke an API key without deleting it (admin only)",
    description=(
        "Marks the key as revoked (`revoked_at` is set). Subsequent requests presenting this "
        "key are rejected with 401, but the audit record is preserved. Idempotent — revoking "
        "an already-revoked key still returns 200 with the current state.\n\n"
        "Prefer **revoke** over **delete** when you want to keep audit traceability.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        200: {"description": "Key revoked (or already revoked — current state returned)."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "API key not found."},
    },
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
    summary="Delete an API key permanently (admin only)",
    description=(
        "Hard-deletes the API key record. Audit logs that referenced the key (`api_key_id`) "
        "are kept but the key itself is gone. Prefer `POST /api-keys/{id}/revoke` if you need "
        "to retain the record for compliance.\n\n"
        "**Authorization**: caller must have `role == admin`."
    ),
    responses={
        204: {"description": "API key deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "API key not found."},
    },
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

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.rate_limit import limiter
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
    UserPublic,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

_auth_logger = logging.getLogger("auth")


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate with email + password",
    description=(
        "Exchanges a valid email/password pair for a fresh **access + refresh** token "
        "pair.\n\n"
        "* The access token (`access_token`) has a 15 minute TTL and must be sent on every "
        "subsequent request as `Authorization: Bearer <token>`.\n"
        "* The refresh token (`refresh_token`) has a 7 day TTL and is used exclusively against "
        "`POST /auth/refresh` to rotate the access token.\n"
        "* Rate limited to **10 requests/minute** per source IP — repeated failures trigger "
        "HTTP 429.\n\n"
        "Use this endpoint as the first call of any human-facing session. Machine-to-machine "
        "callers should prefer long-lived API keys (`/api-keys`) over passwords."
    ),
    responses={
        401: {"description": "Invalid email/password combination, or the user account is inactive."},
        422: {"description": "Validation error (missing fields, malformed email, etc.)."},
        429: {"description": "Rate limit exceeded (10/minute per IP)."},
    },
    openapi_extra={
        "x-codeSamples": [
            {
                "lang": "shell",
                "label": "curl",
                "source": (
                    "curl -X POST https://api.example.com/api/auth/login \\\n"
                    "  -H 'Content-Type: application/json' \\\n"
                    "  -d '{\"email\": \"user@example.com\", \"password\": \"s3cret\"}'"
                ),
            },
            {
                "lang": "python",
                "label": "httpx",
                "source": (
                    "import httpx\n\n"
                    "r = httpx.post(\n"
                    "    'https://api.example.com/api/auth/login',\n"
                    "    json={'email': 'user@example.com', 'password': 's3cret'},\n"
                    ")\n"
                    "r.raise_for_status()\n"
                    "tokens = r.json()\n"
                    "access_token = tokens['access_token']\n"
                    "refresh_token = tokens['refresh_token']"
                ),
            },
        ],
    },
)
@limiter.limit("10/minute")
def login(
    request: Request,
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user = auth_service.authenticate(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
        )
    return auth_service.issue_tokens(db, user, request)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate access + refresh token using a valid refresh token",
    description=(
        "Exchanges a still-valid `refresh_token` for a brand-new access/refresh token pair. "
        "The previous refresh token is **revoked atomically** — a refresh token can only be "
        "used once (single-use, rotating).\n\n"
        "Typical client flow:\n\n"
        "1. Access token expires (or 401 received).\n"
        "2. Call this endpoint with the stored refresh token.\n"
        "3. Persist the new pair, drop the old one.\n\n"
        "If the refresh token is unknown, already revoked, expired, or tied to an inactive "
        "user, a 401 is returned and the client should redirect to login."
    ),
    responses={
        401: {"description": "Refresh token is invalid, expired, revoked, or belongs to an inactive user."},
        422: {"description": "Missing or malformed `refresh_token` field."},
    },
)
def refresh(
    payload: RefreshRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    try:
        return auth_service.rotate_refresh(db, payload.refresh_token, request)
    except ValueError as exc:
        _auth_logger.warning("refresh rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token"
        ) from exc


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a refresh token (logout)",
    description=(
        "Marks the supplied `refresh_token` as revoked so it can no longer be used to obtain "
        "new access tokens. The current access token remains valid until its natural 15-minute "
        "expiry — clients should also discard it locally.\n\n"
        "Requires a valid access token (`Authorization: Bearer ...`). Idempotent: revoking an "
        "already-revoked or unknown token still returns 204."
    ),
    responses={
        204: {"description": "Refresh token revoked (or no-op when token was already invalid)."},
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Missing `refresh_token` field."},
    },
)
def logout(
    payload: LogoutRequest,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    auth_service.revoke_refresh(db, payload.refresh_token)


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return the authenticated user's profile",
    description=(
        "Returns the public profile of the user the access token belongs to (id, email, "
        "name, role, `is_active`). Use this to seed the frontend session and decide which "
        "menu items to show based on `role`.\n\n"
        "Hint: this endpoint is also a cheap way to verify whether a cached access token "
        "is still valid without consuming a write operation."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user

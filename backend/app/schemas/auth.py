from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr = Field(
        ...,
        description="The user's registered email address.",
        examples=["user@example.com"],
    )
    password: str = Field(
        ...,
        description="The user's password in plaintext (TLS in transit is mandatory).",
        examples=["s3cret-passw0rd"],
    )


class RefreshRequest(BaseModel):
    refresh_token: str = Field(
        ...,
        description=(
            "A still-valid refresh token previously issued by `/auth/login` or `/auth/refresh`. "
            "Will be revoked atomically as part of the rotation."
        ),
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )


class LogoutRequest(BaseModel):
    refresh_token: str = Field(
        ...,
        description="The refresh token to revoke. Idempotent — unknown tokens still return 204.",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )


class UserPublic(BaseModel):
    id: int = Field(..., description="Server-assigned user id.", examples=[1])
    email: EmailStr = Field(..., description="User's email address (immutable).", examples=["user@example.com"])
    name: str = Field(..., description="User's display name.", examples=["Caio Norder"])
    role: UserRole = Field(
        ...,
        description="Role drives permissions: `admin`, `member` or `viewer`.",
        examples=["admin"],
    )
    is_active: bool = Field(
        ...,
        description="False for soft-deleted or deactivated users; they cannot authenticate.",
        examples=[True],
    )
    created_at: datetime = Field(..., description="UTC timestamp of account creation.")

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str = Field(
        ...,
        description=(
            "Short-lived JWT (15 min TTL). Send as `Authorization: Bearer <access_token>` on "
            "every authenticated request."
        ),
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )
    refresh_token: str = Field(
        ...,
        description=(
            "Long-lived rotating refresh token (7 days TTL, single-use). Used exclusively "
            "against `POST /auth/refresh` to obtain a new access/refresh pair."
        ),
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )
    token_type: str = Field(
        "bearer",
        description="Always `bearer` — included for OAuth 2.0 compatibility.",
        examples=["bearer"],
    )
    user: UserPublic = Field(
        ...,
        description="Public profile of the authenticated user, returned to seed the client session.",
    )

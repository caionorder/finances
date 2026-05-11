from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=list)


class ApiKeyOut(BaseModel):
    id: int
    name: str
    scopes: list[str]
    last_used_at: datetime | None
    revoked_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreatedResponse(ApiKeyOut):
    plain_key: str

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "Human-readable label for the key (e.g. \"Zapier integration\", \"Agente Apollo\"). "
            "Used purely for audit and display."
        ),
        examples=["Zapier integration"],
    )
    scopes: list[str] = Field(
        default_factory=list,
        description=(
            "Permission scopes the key is allowed to use against `/v1/external/*`. Examples: "
            "`transactions:write`, `accounts:write`, `reports:read`. Empty list = key cannot "
            "call any external endpoint."
        ),
        examples=[["transactions:write", "reports:read"]],
    )


class ApiKeyOut(BaseModel):
    id: int = Field(..., description="Server-assigned key id.", examples=[7])
    name: str = Field(..., description="Display label.", examples=["Zapier integration"])
    scopes: list[str] = Field(
        ...,
        description="Permission scopes the key may exercise.",
        examples=[["transactions:write"]],
    )
    last_used_at: datetime | None = Field(
        None,
        description="UTC timestamp of the most recent successful authentication. `null` if never used.",
        examples=["2026-05-24T10:15:00Z"],
    )
    revoked_at: datetime | None = Field(
        None,
        description="UTC timestamp when the key was revoked. `null` for active keys.",
    )
    created_by_user_id: int | None = Field(
        None,
        description="Id of the admin user that issued the key.",
        examples=[1],
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC ISO-8601).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC ISO-8601).")

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreatedResponse(ApiKeyOut):
    plain_key: str = Field(
        ...,
        description=(
            "The **plaintext** API key value. Returned **only** in the response to "
            "`POST /api-keys` — it cannot be retrieved later. Pass it to the client as the "
            "`X-API-Key` header value when calling `/v1/external/*`."
        ),
        examples=["fk_live_8ZQ9w4FHe...redacted"],
    )

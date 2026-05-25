from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AuditLogOut(BaseModel):
    id: int = Field(..., description="Monotonically increasing audit-log id.", examples=[123])
    user_id: int | None = Field(
        None,
        description=(
            "Id of the actor who performed the action. `null` for system-triggered events "
            "(e.g. scheduler jobs)."
        ),
        examples=[1],
    )
    user_email: str | None = Field(
        None,
        description="Cached email of the actor at the time of the action (denormalized for display).",
        examples=["admin@example.com"],
    )
    action: str = Field(
        ...,
        description=(
            "Verb describing the operation (`create`, `update`, `delete`, `revoke`, "
            "`reset_password`, etc.)."
        ),
        examples=["update"],
    )
    entity: str = Field(
        ...,
        description="Type of entity that was acted upon (`user`, `account`, `transaction`, `api_key`, ...).",
        examples=["account"],
    )
    entity_id: int | None = Field(
        None,
        description="Id of the specific entity instance. `null` for entity-type-wide actions.",
        examples=[42],
    )
    payload_json: dict | None = Field(
        None,
        description=(
            "Free-form JSON capturing the diff or the relevant context for the action "
            "(e.g. `{\"old\": {...}, \"new\": {...}}`)."
        ),
    )
    created_at: datetime = Field(..., description="UTC timestamp when the audit record was written.")

    model_config = ConfigDict(from_attributes=True)

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    action: str
    entity: str
    entity_id: int | None
    payload_json: dict | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

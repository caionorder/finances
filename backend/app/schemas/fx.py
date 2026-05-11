from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class FxRateOut(BaseModel):
    base_code: str
    quote_code: str
    rate: Decimal
    source: str
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RefreshResult(BaseModel):
    fetched: int
    persisted: int
    error: str | None = None

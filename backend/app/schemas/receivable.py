from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recurrence import RecurrenceRule


class ReceivableBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    amount: Decimal = Field(..., gt=Decimal("0"))
    currency_code: str = Field(..., min_length=3, max_length=3)
    due_date: date
    account_id: int | None = None
    category_id: int | None = None
    notes: str | None = Field(None, max_length=500)


class ReceivableCreate(ReceivableBase):
    recurrence: RecurrenceRule | None = None


class ReceivableUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=500)
    amount: Decimal | None = Field(None, gt=Decimal("0"))
    due_date: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    notes: str | None = Field(None, max_length=500)


ReceivableStatus = Literal["received", "overdue", "pending"]


class ReceivableOut(ReceivableBase):
    id: int
    received_at: date | None
    recurrence_id: int | None
    transaction_id: int | None
    created_at: datetime
    updated_at: datetime
    status: ReceivableStatus

    model_config = ConfigDict(from_attributes=True)


class MarkAsReceivedRequest(BaseModel):
    received_at: date | None = None
    account_id: int | None = None


class OutstandingStatusGroup(BaseModel):
    count: int
    total_remaining: Decimal


class ReceivableOutstandingSummary(BaseModel):
    currency_code: str | None
    total_remaining: Decimal
    count: int
    by_status: dict[str, OutstandingStatusGroup]

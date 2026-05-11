from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recurrence import RecurrenceRule

PayableStatus = Literal["paid", "overdue", "pending", "partially_paid"]


class PaymentOut(BaseModel):
    """Represents a single payment event recorded against a Payable."""

    id: int
    transaction_id: int | None
    amount: Decimal
    paid_at: date
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayableBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    amount: Decimal = Field(..., gt=Decimal("0"))
    currency_code: str = Field(..., min_length=3, max_length=3)
    due_date: date
    account_id: int | None = None
    category_id: int | None = None
    notes: str | None = Field(None, max_length=500)


class PayableCreate(PayableBase):
    recurrence: RecurrenceRule | None = None


class PayableUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=500)
    amount: Decimal | None = Field(None, gt=Decimal("0"))
    due_date: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    notes: str | None = Field(None, max_length=500)


class PayableOut(PayableBase):
    id: int
    paid_at: date | None
    paid_amount: Decimal
    remaining_amount: Decimal
    recurrence_id: int | None
    transaction_id: int | None
    created_at: datetime
    updated_at: datetime
    status: PayableStatus
    payments: list[PaymentOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class MarkAsPaidRequest(BaseModel):
    paid_at: date | None = None
    account_id: int | None = None
    amount: Decimal | None = Field(None, gt=Decimal("0"))


class OutstandingStatusGroup(BaseModel):
    count: int
    total_remaining: Decimal


class PayableOutstandingSummary(BaseModel):
    currency_code: str | None
    total_remaining: Decimal
    count: int
    by_status: dict[str, OutstandingStatusGroup]

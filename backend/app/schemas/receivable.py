from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recurrence import RecurrenceRule


class ReceivableBase(BaseModel):
    description: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Short label for the expected payment (e.g. \"Salário Maio/26\").",
        examples=["Salário Maio/26"],
    )
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Full amount expected to be received. Decimal string. Must be positive.",
        examples=["5000.00"],
    )
    currency_code: str = Field(
        ...,
        min_length=3,
        max_length=3,
        description="ISO 3-letter currency code.",
        examples=["BRL"],
    )
    due_date: date = Field(
        ...,
        description=(
            "Date the money is expected to arrive (ISO YYYY-MM-DD). Used both for forecasting "
            "and to derive the `overdue` status when the date passes without settlement."
        ),
        examples=["2026-05-30"],
    )
    account_id: int | None = Field(
        None,
        description="Default account that should receive the money. Can be overridden at settle time.",
        examples=[1],
    )
    category_id: int | None = Field(
        None,
        description="Optional category id (e.g. \"Salary\", \"Client invoice\").",
        examples=[3],
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="Free-text notes (max 500 chars).",
    )


class ReceivableCreate(ReceivableBase):
    recurrence: RecurrenceRule | None = Field(
        None,
        description=(
            "Optional recurrence template. When provided, a `Recurrence` is also created and "
            "future instances of this receivable are auto-generated on schedule."
        ),
    )


class ReceivableUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=500, description="New description. Omit to preserve.")
    amount: Decimal | None = Field(None, gt=Decimal("0"), description="New expected amount.", examples=["5500.00"])
    due_date: date | None = Field(None, description="New expected date.", examples=["2026-06-05"])
    account_id: int | None = Field(None, description="New default receiving account id, or null to clear.")
    category_id: int | None = Field(None, description="New category id, or null to clear.")
    notes: str | None = Field(None, max_length=500, description="New notes (max 500 chars), or null to clear.")


ReceivableStatus = Literal["received", "overdue", "pending"]


class ReceivableOut(ReceivableBase):
    id: int = Field(..., description="Server-assigned receivable id.", examples=[55])
    received_at: date | None = Field(
        None,
        description="Date the money was received. `null` while pending or overdue.",
        examples=["2026-05-29"],
    )
    recurrence_id: int | None = Field(
        None,
        description="Id of the recurrence template that auto-generated this instance, if any.",
    )
    transaction_id: int | None = Field(
        None,
        description="Id of the `income` transaction booked when the receivable was settled.",
        examples=[2048],
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")
    status: ReceivableStatus = Field(
        ...,
        description=(
            "Derived status bucket: `pending`, `received` or `overdue`. Computed live from "
            "`received_at` and `due_date` vs today."
        ),
        examples=["pending"],
    )

    model_config = ConfigDict(from_attributes=True)


class MarkAsReceivedRequest(BaseModel):
    received_at: date | None = Field(
        None,
        description="Date the money arrived. Defaults to today on the server.",
        examples=["2026-05-29"],
    )
    account_id: int | None = Field(
        None,
        description=(
            "Account that received the money. Falls back to the receivable's `account_id` "
            "when omitted."
        ),
        examples=[1],
    )


class OutstandingStatusGroup(BaseModel):
    count: int = Field(..., description="Number of receivables in this bucket.", examples=[2])
    total_remaining: Decimal = Field(
        ...,
        description="Sum of `amount` across receivables in this bucket.",
        examples=["10000.00"],
    )


class ReceivableOutstandingSummary(BaseModel):
    currency_code: str | None = Field(
        None,
        description="Currency the aggregation is scoped to. `null` when caller didn't restrict.",
        examples=["BRL"],
    )
    total_remaining: Decimal = Field(
        ...,
        description="Grand total of expected amounts across all buckets.",
        examples=["10000.00"],
    )
    count: int = Field(..., description="Total number of outstanding receivables.", examples=[2])
    by_status: dict[str, OutstandingStatusGroup] = Field(
        ...,
        description="Per-bucket breakdown keyed by status string (`pending`, `overdue`).",
    )

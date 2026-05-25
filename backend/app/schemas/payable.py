from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recurrence import RecurrenceRule

PayableStatus = Literal["paid", "overdue", "pending", "partially_paid"]


class PaymentOut(BaseModel):
    """Single payment event recorded against a Payable."""

    id: int = Field(..., description="Server-assigned payment event id.", examples=[5])
    transaction_id: int | None = Field(
        None,
        description=(
            "Id of the `expense` transaction that materialized the payment on an account. "
            "`null` when the payment was recorded but no settlement was booked."
        ),
        examples=[1024],
    )
    amount: Decimal = Field(
        ...,
        description="Amount paid in this single event (decimal string).",
        examples=["150.00"],
    )
    paid_at: date = Field(..., description="Date the payment was made (ISO YYYY-MM-DD).", examples=["2026-05-20"])
    created_at: datetime = Field(..., description="UTC timestamp when the payment was recorded.")

    model_config = ConfigDict(from_attributes=True)


class PayableBase(BaseModel):
    description: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Short label for the bill (e.g. \"Energia ENEL Maio/26\").",
        examples=["Energia ENEL Maio/26"],
    )
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Full amount owed. Decimal string. Must be positive.",
        examples=["350.00"],
    )
    currency_code: str = Field(
        ...,
        min_length=3,
        max_length=3,
        description="ISO 3-letter currency code (e.g. `BRL`, `USD`, `PYG`).",
        examples=["BRL"],
    )
    due_date: date = Field(
        ...,
        description="Date by which the bill must be settled (ISO YYYY-MM-DD).",
        examples=["2026-05-30"],
    )
    account_id: int | None = Field(
        None,
        description=(
            "Default account that should settle the payable. Optional — can be overridden at "
            "`mark-as-paid` time."
        ),
        examples=[2],
    )
    category_id: int | None = Field(
        None,
        description="Optional category id (e.g. \"Utilities\").",
        examples=[8],
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="Free-text notes (max 500 chars).",
    )


class PayableCreate(PayableBase):
    recurrence: RecurrenceRule | None = Field(
        None,
        description=(
            "Optional recurrence template. When provided, a `Recurrence` is also created and "
            "future instances of this payable are auto-generated on schedule."
        ),
    )


class PayableUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=500, description="New description. Omit to preserve.")
    amount: Decimal | None = Field(None, gt=Decimal("0"), description="New total amount.", examples=["400.00"])
    due_date: date | None = Field(None, description="New due date.", examples=["2026-06-05"])
    account_id: int | None = Field(None, description="New default settling account id, or null to clear.")
    category_id: int | None = Field(None, description="New category id, or null to clear.")
    notes: str | None = Field(None, max_length=500, description="New notes (max 500 chars), or null to clear.")


class PayableOut(PayableBase):
    id: int = Field(..., description="Server-assigned payable id.", examples=[101])
    paid_at: date | None = Field(
        None,
        description="Date the payable was fully paid. `null` until the final payment.",
        examples=["2026-05-28"],
    )
    paid_amount: Decimal = Field(
        ...,
        description="Cumulative amount paid so far (sum of `payments[].amount`).",
        examples=["150.00"],
    )
    remaining_amount: Decimal = Field(
        ...,
        description="`amount - paid_amount`. Zero when fully paid.",
        examples=["200.00"],
    )
    recurrence_id: int | None = Field(
        None,
        description="Id of the recurrence template that auto-generated this instance, if any.",
    )
    transaction_id: int | None = Field(
        None,
        description=(
            "Legacy single-payment shortcut: id of the settling transaction. New code should "
            "consult `payments[]` instead."
        ),
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")
    status: PayableStatus = Field(
        ...,
        description=(
            "Derived status bucket: `pending`, `partially_paid`, `paid` or `overdue`. "
            "Computed live from `amount`, `paid_amount` and `due_date` vs today."
        ),
        examples=["partially_paid"],
    )
    payments: list[PaymentOut] = Field(
        default_factory=list,
        description="Full history of payment events recorded against this payable.",
    )

    model_config = ConfigDict(from_attributes=True)


class MarkAsPaidRequest(BaseModel):
    paid_at: date | None = Field(
        None,
        description="Date the payment was made. Defaults to today on the server.",
        examples=["2026-05-25"],
    )
    account_id: int | None = Field(
        None,
        description=(
            "Account that settled the payment. Falls back to the payable's `account_id` when "
            "omitted."
        ),
        examples=[2],
    )
    amount: Decimal | None = Field(
        None,
        gt=Decimal("0"),
        description=(
            "Amount paid in this event. Omit to settle the **full remaining balance**. "
            "Useful for recording partial payments."
        ),
        examples=["150.00"],
    )


class OutstandingStatusGroup(BaseModel):
    count: int = Field(..., description="Number of payables in this status bucket.", examples=[3])
    total_remaining: Decimal = Field(
        ...,
        description="Sum of `remaining_amount` across payables in this bucket.",
        examples=["650.00"],
    )


class PayableOutstandingSummary(BaseModel):
    currency_code: str | None = Field(
        None,
        description="Currency the aggregation is scoped to. `null` when caller didn't restrict.",
        examples=["BRL"],
    )
    total_remaining: Decimal = Field(
        ...,
        description="Grand total of outstanding amounts across all buckets.",
        examples=["650.00"],
    )
    count: int = Field(..., description="Total number of outstanding payables.", examples=[3])
    by_status: dict[str, OutstandingStatusGroup] = Field(
        ...,
        description=(
            "Per-bucket breakdown keyed by status string (`pending`, `partially_paid`, "
            "`overdue`)."
        ),
    )

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PurchaseCreate(BaseModel):
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description=(
            "**Total** purchase amount (positive decimal string). When `installments > 1`, "
            "this value is split evenly across the installments (cents rounded to the first)."
        ),
        examples=["1200.00"],
    )
    purchase_date: date = Field(
        ...,
        description=(
            "Date the purchase was made (ISO-8601 `YYYY-MM-DD`). Determines which "
            "billing cycle the FIRST installment lands on."
        ),
        examples=["2026-05-11"],
    )
    description: str | None = Field(
        None,
        max_length=500,
        description="Free-text label, max 500 chars.",
        examples=["Annual SaaS subscription"],
    )
    merchant: str | None = Field(
        None,
        max_length=255,
        description="Merchant/vendor name. Useful for agents to deduplicate by hash.",
        examples=["Amazon"],
    )
    category_id: int | None = Field(
        None,
        description="Optional category id. Discover valid ids via `GET /categories`.",
        examples=[12],
    )
    installments: int = Field(
        1,
        ge=1,
        le=72,
        description="Number of installments (1-72). 1 = single charge, N>1 = N child rows.",
        examples=[12],
    )


class PurchaseUpdate(BaseModel):
    amount: Decimal | None = Field(None, gt=Decimal("0"), description="New amount.")
    description: str | None = Field(None, max_length=500)
    merchant: str | None = Field(None, max_length=255)
    category_id: int | None = None


class PurchaseOut(BaseModel):
    id: int
    credit_card_id: int
    currency_code: str = Field(..., description="Currency inherited from the card.", examples=["BRL"])
    amount: Decimal = Field(..., description="Installment amount (decimal string).", examples=["100.00"])
    purchase_date: date
    description: str | None
    merchant: str | None
    category_id: int | None
    installment_n: int = Field(..., description="1-based installment index in the series.", examples=[1])
    installment_of: int = Field(..., description="Total installments in the series.", examples=[12])
    parent_purchase_id: int | None = Field(
        None,
        description="Set on child installments. Points to the series parent row.",
    )
    billing_cycle_id: int | None = Field(
        None,
        description="Cycle this installment is allocated to. Null for unallocated.",
    )
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PurchaseSeriesCreatedResponse(BaseModel):
    series_id: int | None = Field(
        None,
        description="Id of the parent purchase row when `installments > 1`, else null.",
    )
    installments: int = Field(..., description="Total number of installments created.", examples=[12])
    total_amount: Decimal = Field(..., description="Sum of all installments (echoes input).", examples=["1200.00"])
    purchases: list[PurchaseOut] = Field(
        ...,
        description="The N installment rows (and parent when applicable), in chronological order.",
    )

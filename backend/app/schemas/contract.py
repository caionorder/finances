from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ContractBase(BaseModel):
    customer_id: int = Field(
        ...,
        description="Id of the customer this contract belongs to.",
        examples=[1],
    )
    reference: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Caller-supplied contract reference. Unique per customer.",
        examples=["MSA-2026-01"],
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable contract title.",
        examples=["Master Services Agreement"],
    )
    contract_date: date = Field(
        ...,
        description="Date the contract was signed (ISO YYYY-MM-DD).",
        examples=["2026-01-01"],
    )
    currency_code: str = Field(
        "USD",
        min_length=3,
        max_length=3,
        description="Billing currency. Fixed to `USD`.",
        examples=["USD"],
    )
    service_period_start: date | None = Field(
        None, description="Start of the covered service period.", examples=["2026-01-01"]
    )
    service_period_end: date | None = Field(
        None, description="End of the covered service period.", examples=["2026-12-31"]
    )
    scope_description: str | None = Field(
        None,
        max_length=2000,
        description="Free-text description of the scope of services.",
    )
    agreed_rate: Decimal | None = Field(
        None,
        gt=Decimal("0"),
        description="Agreed rate used to seed a line item when generating an invoice.",
        examples=["5000.00"],
    )
    rate_unit: str | None = Field(
        None,
        max_length=40,
        description="Unit the rate applies to (e.g. `month`, `hour`, `project`).",
        examples=["month"],
    )
    payment_terms_days: int = Field(
        30,
        ge=0,
        le=365,
        description="Net payment terms in days. Drives the invoice due date.",
        examples=[30],
    )
    default_tax_rate: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Default tax rate (percent) seeded onto generated line items.",
        examples=["0"],
    )
    default_discount: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Default discount amount seeded onto generated invoices.",
        examples=["0"],
    )
    is_active: bool = Field(
        True,
        description="Whether the contract can still seed new invoices.",
        examples=[True],
    )
    next_period_start: date | None = Field(
        None,
        description="Start of the next billing period (advanced by from-contract generation).",
        examples=["2026-02-01"],
    )
    notes: str | None = Field(
        None, max_length=1000, description="Free-text notes (max 1000 chars)."
    )

    @property
    def _currency_fixed(self) -> str:  # pragma: no cover - documentation helper
        return "USD"


class ContractCreate(ContractBase):
    pass


class ContractUpdate(BaseModel):
    reference: str | None = Field(None, min_length=1, max_length=100, description="New reference.")
    title: str | None = Field(None, min_length=1, max_length=255, description="New title.")
    contract_date: date | None = Field(None, description="New contract date.")
    service_period_start: date | None = Field(
        None, description="New service period start, or null to clear."
    )
    service_period_end: date | None = Field(
        None, description="New service period end, or null to clear."
    )
    scope_description: str | None = Field(
        None, max_length=2000, description="New scope description, or null to clear."
    )
    agreed_rate: Decimal | None = Field(
        None, gt=Decimal("0"), description="New agreed rate, or null to clear."
    )
    rate_unit: str | None = Field(
        None, max_length=40, description="New rate unit, or null to clear."
    )
    payment_terms_days: int | None = Field(
        None, ge=0, le=365, description="New net payment terms in days."
    )
    default_tax_rate: Decimal | None = Field(
        None, ge=Decimal("0"), description="New default tax rate (percent)."
    )
    default_discount: Decimal | None = Field(
        None, ge=Decimal("0"), description="New default discount amount."
    )
    is_active: bool | None = Field(None, description="Activate/deactivate the contract.")
    next_period_start: date | None = Field(
        None, description="New next-period start, or null to clear."
    )
    notes: str | None = Field(None, max_length=1000, description="New notes, or null to clear.")


class ContractOut(ContractBase):
    id: int = Field(..., description="Server-assigned contract id.", examples=[1])
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)

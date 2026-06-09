from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerBase(BaseModel):
    legal_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Legal/registered name of the billing customer (US entity).",
        examples=["Acme Holdings LLC"],
    )
    contact_person: str | None = Field(
        None,
        max_length=255,
        description="Name of the primary contact at the customer.",
        examples=["Jane Doe"],
    )
    email: str | None = Field(
        None,
        max_length=255,
        description="Contact email address.",
        examples=["ap@example.com"],
    )
    phone: str | None = Field(
        None,
        max_length=50,
        description="Contact phone number.",
        examples=["+1 555 010 0000"],
    )
    tax_id: str | None = Field(
        None,
        max_length=50,
        description="US Employer Identification Number (EIN) or other tax id.",
        examples=["00-0000000"],
    )
    billing_address_line1: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="First line of the billing address.",
        examples=["1 Example Street"],
    )
    billing_address_line2: str | None = Field(
        None,
        max_length=255,
        description="Second line of the billing address (suite, floor, ...).",
        examples=["Suite 100"],
    )
    billing_city: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Billing city.",
        examples=["Wilmington"],
    )
    billing_state: str | None = Field(
        None,
        max_length=120,
        description="Billing state/province.",
        examples=["DE"],
    )
    billing_postal_code: str | None = Field(
        None,
        max_length=20,
        description="Billing ZIP/postal code.",
        examples=["19801"],
    )
    billing_country: str = Field(
        "US",
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2 country code. Defaults to `US`.",
        examples=["US"],
    )
    notes: str | None = Field(
        None,
        max_length=1000,
        description="Free-text notes (max 1000 chars).",
    )


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    legal_name: str | None = Field(
        None, min_length=1, max_length=255, description="New legal name."
    )
    contact_person: str | None = Field(
        None, max_length=255, description="New contact person, or null to clear."
    )
    email: str | None = Field(
        None, max_length=255, description="New contact email, or null to clear."
    )
    phone: str | None = Field(None, max_length=50, description="New phone, or null to clear.")
    tax_id: str | None = Field(None, max_length=50, description="New tax id/EIN, or null to clear.")
    billing_address_line1: str | None = Field(
        None, min_length=1, max_length=255, description="New address line 1."
    )
    billing_address_line2: str | None = Field(
        None, max_length=255, description="New address line 2, or null to clear."
    )
    billing_city: str | None = Field(
        None, min_length=1, max_length=120, description="New billing city."
    )
    billing_state: str | None = Field(
        None, max_length=120, description="New billing state, or null to clear."
    )
    billing_postal_code: str | None = Field(
        None, max_length=20, description="New postal code, or null to clear."
    )
    billing_country: str | None = Field(
        None, min_length=2, max_length=2, description="New country code."
    )
    notes: str | None = Field(None, max_length=1000, description="New notes, or null to clear.")
    is_archived: bool | None = Field(
        None,
        description="Flip to archive/unarchive the customer without deleting it.",
        examples=[True],
    )


class CustomerOut(CustomerBase):
    id: int = Field(..., description="Server-assigned customer id.", examples=[1])
    is_archived: bool = Field(
        ...,
        description=(
            "True when archived (hidden from default listings, still referenceable historically)."
        ),
        examples=[False],
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)

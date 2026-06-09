from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# SWIFT/BIC: 8 or 11 alphanumeric chars. Validated on issuer wire fields.
SWIFT_BIC_RE = re.compile(r"^[A-Z0-9]{8}([A-Z0-9]{3})?$")


def _validate_swift(value: str | None) -> str | None:
    if value is None:
        return None
    if not SWIFT_BIC_RE.match(value):
        raise ValueError("invalid SWIFT/BIC (expected 8 or 11 alphanumeric chars)")
    return value


class IssuerProfileBase(BaseModel):
    # --- Entity ---
    legal_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "Legal name of the issuing entity (must match the beneficiary bank account name)."
        ),
        examples=["Example Consulting SRL"],
    )
    ruc: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Paraguayan RUC (taxpayer registry id) of the issuer.",
        examples=["00000000-0"],
    )
    address_line1: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Issuer address line 1.",
        examples=["Av. Example 100"],
    )
    address_line2: str | None = Field(
        None, max_length=255, description="Issuer address line 2.", examples=["Piso 3"]
    )
    city: str = Field(
        ..., min_length=1, max_length=120, description="Issuer city.", examples=["Asuncion"]
    )
    country: str = Field(
        "PY",
        min_length=2,
        max_length=2,
        description="ISO country code. Defaults to `PY`.",
        examples=["PY"],
    )
    email: str | None = Field(
        None, max_length=255, description="Issuer contact email.", examples=["billing@example.com"]
    )
    phone: str | None = Field(
        None, max_length=50, description="Issuer contact phone.", examples=["+595 21 000 000"]
    )

    # --- Beneficiary bank (Continental) ---
    bank_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Beneficiary bank name.",
        examples=["Example Bank"],
    )
    bank_address: str | None = Field(
        None,
        max_length=500,
        description="Beneficiary bank address.",
        examples=["Av. Bank 200, Asuncion"],
    )
    bank_country: str = Field(
        "PY",
        min_length=2,
        max_length=2,
        description="Beneficiary bank country. Defaults to `PY`.",
        examples=["PY"],
    )
    swift_bic: str = Field(
        ...,
        min_length=8,
        max_length=11,
        description="Beneficiary bank SWIFT/BIC (8 or 11 alphanumeric chars).",
        examples=["EXAMPLPY"],
    )
    account_number: str | None = Field(
        None,
        max_length=64,
        description="Beneficiary account number at the bank.",
        examples=["00000000"],
    )
    iban: str | None = Field(
        None,
        max_length=64,
        description="Beneficiary IBAN (optional; PY does not use IBAN).",
        examples=["XX00EXAMPLE0000000000"],
    )

    # --- Intermediary / correspondent (US) ---
    intermediary_bank_name: str | None = Field(
        None,
        max_length=255,
        description="US intermediary/correspondent bank name.",
        examples=["Example Correspondent Bank"],
    )
    intermediary_swift_bic: str | None = Field(
        None,
        min_length=8,
        max_length=11,
        description="Intermediary bank SWIFT/BIC.",
        examples=["EXAMPUS3"],
    )
    intermediary_account_number: str | None = Field(
        None, max_length=64, description="Account-at-correspondent number.", examples=["00000000"]
    )
    intermediary_bank_country: str | None = Field(
        "US",
        min_length=2,
        max_length=2,
        description="Intermediary bank country. Defaults to `US`.",
        examples=["US"],
    )

    # --- Reconciliation ---
    receiving_account_id: int | None = Field(
        None,
        description=(
            "Id of the ledger account (USD) that receives the net wire. Required before issuing."
        ),
        examples=[1],
    )
    bank_receiving_fee: Decimal = Field(
        Decimal("44"),
        ge=Decimal("0"),
        description=(
            "Bank receiving fee netted from the invoice total when creating the receivable."
        ),
        examples=["44"],
    )
    default_income_category_id: int | None = Field(
        None,
        description="Default income category id for the auto-created receivable/transaction.",
        examples=[1],
    )

    # --- Terms / tax ---
    wire_reference_instructions: str | None = Field(
        None,
        max_length=1000,
        description="Free-text wire reference instructions shown on the PDF.",
    )
    default_payment_terms_days: int = Field(
        30, ge=0, le=365, description="Default net payment terms in days.", examples=[30]
    )
    tax_status_note: str | None = Field(
        None,
        max_length=1000,
        description="Footnote referencing the issuer's foreign tax status (e.g. IRS Form W-8BEN).",
        examples=[
            "Beneficiary is a non-U.S. person. IRS Form W-8BEN (foreign status "
            "certification) on file — available upon request."
        ],
    )

    @field_validator("swift_bic", "intermediary_swift_bic")
    @classmethod
    def _check_swift(cls, value: str | None) -> str | None:
        return _validate_swift(value)

    @model_validator(mode="after")
    def _check_consistency(self) -> IssuerProfileBase:
        # At least one of account_number / iban must be present.
        if not (self.account_number or self.iban):
            raise ValueError("issuer must have at least one of account_number or iban")
        # If any intermediary field is set, name + SWIFT are required.
        intermediary_set = any(
            v is not None
            for v in (
                self.intermediary_bank_name,
                self.intermediary_swift_bic,
                self.intermediary_account_number,
            )
        )
        if intermediary_set and not (self.intermediary_bank_name and self.intermediary_swift_bic):
            raise ValueError(
                "intermediary bank requires both intermediary_bank_name and intermediary_swift_bic"
            )
        return self


class IssuerProfileUpsert(IssuerProfileBase):
    """Full PUT body for the singleton issuer profile (id=1)."""


class IssuerProfileOut(IssuerProfileBase):
    id: int = Field(..., description="Always 1 (singleton).", examples=[1])
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)

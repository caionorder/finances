from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvoiceStatus

# Status filter values accepted by the list endpoint. ``overdue`` is derived,
# not a stored status.
InvoiceStatusFilter = Literal["draft", "issued", "sent", "paid", "void", "overdue"]


# ---------------------------------------------------------------------------
# Snapshot contracts (frozen at issue; consumed by the issue writer AND the
# PDF service's build_context). The DB columns are plain JSON.
# ---------------------------------------------------------------------------


class IssuerSnapshot(BaseModel):
    """Frozen copy of the issuer profile + wire instructions at issue time."""

    snapshot_version: int = Field(1, description="Snapshot schema version.")

    legal_name: str
    ruc: str
    address_line1: str
    address_line2: str | None = None
    city: str
    country: str = "PY"
    email: str | None = None
    phone: str | None = None

    bank_name: str
    bank_address: str | None = None
    bank_country: str = "PY"
    swift_bic: str
    account_number: str | None = None
    iban: str | None = None

    intermediary_bank_name: str | None = None
    intermediary_swift_bic: str | None = None
    intermediary_account_number: str | None = None
    intermediary_bank_country: str | None = None

    bank_receiving_fee: Decimal
    wire_reference_instructions: str | None = None
    tax_status_note: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CustomerContractSnapshot(BaseModel):
    """Contract details embedded in the customer snapshot (optional)."""

    reference: str
    title: str
    contract_date: date
    service_period_start: date | None = None
    service_period_end: date | None = None
    scope_description: str | None = None


class CustomerSnapshot(BaseModel):
    """Frozen copy of the customer (+ optional contract) at issue time."""

    snapshot_version: int = Field(1, description="Snapshot schema version.")

    legal_name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None
    billing_address_line1: str
    billing_address_line2: str | None = None
    billing_city: str
    billing_state: str | None = None
    billing_postal_code: str | None = None
    billing_country: str = "US"

    contract: CustomerContractSnapshot | None = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Line items
# ---------------------------------------------------------------------------


class InvoiceLineItemCreate(BaseModel):
    description: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Description of the billed item/service.",
        examples=["Consulting services — January 2026"],
    )
    quantity: Decimal = Field(
        Decimal("1"),
        gt=Decimal("0"),
        description="Quantity. Must be positive.",
        examples=["1"],
    )
    unit_price: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Unit price in USD. Must be positive.",
        examples=["5000.00"],
    )
    tax_rate: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Tax rate as a percentage (e.g. `10` for 10%).",
        examples=["0"],
    )


class InvoiceLineItemOut(BaseModel):
    id: int = Field(..., description="Server-assigned line item id.", examples=[1])
    position: int = Field(..., description="Zero-based ordering position.", examples=[0])
    description: str = Field(..., description="Description of the billed item/service.")
    quantity: Decimal = Field(..., description="Quantity.", examples=["1"])
    unit_price: Decimal = Field(..., description="Unit price in USD.", examples=["5000.00"])
    tax_rate: Decimal = Field(..., description="Tax rate (percent).", examples=["0"])
    line_subtotal: Decimal = Field(
        ..., description="round2(quantity * unit_price).", examples=["5000.00"]
    )
    line_tax: Decimal = Field(
        ..., description="round2(line_subtotal * tax_rate / 100).", examples=["0.00"]
    )

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Invoice create/update (mass-assignment split)
# ---------------------------------------------------------------------------


class InvoiceCreate(BaseModel):
    customer_id: int = Field(..., description="Customer to bill.", examples=[1])
    contract_id: int | None = Field(
        None, description="Optional originating contract.", examples=[1]
    )
    category_id: int | None = Field(
        None,
        description=(
            "Income category for the auto-created receivable. Falls back to the issuer default."
        ),
        examples=[1],
    )
    currency_code: str = Field(
        "USD",
        min_length=3,
        max_length=3,
        description="Billing currency. Fixed to `USD`.",
        examples=["USD"],
    )
    issue_date: date | None = Field(
        None, description="Optional issue date placeholder while draft.", examples=["2026-06-09"]
    )
    due_date: date = Field(
        ..., description="Payment due date (ISO YYYY-MM-DD).", examples=["2026-07-09"]
    )
    service_period_start: date | None = Field(
        None, description="Service period start.", examples=["2026-06-01"]
    )
    service_period_end: date | None = Field(
        None, description="Service period end.", examples=["2026-06-30"]
    )
    discount_total: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Flat discount applied to the subtotal (capped at subtotal).",
        examples=["0"],
    )
    po_number: str | None = Field(
        None, max_length=60, description="Customer purchase-order number.", examples=["PO-12345"]
    )
    terms: str | None = Field(
        None, max_length=2000, description="Free-text terms shown on the invoice."
    )
    notes: str | None = Field(
        None, max_length=2000, description="Free-text notes shown on the invoice."
    )
    line_items: list[InvoiceLineItemCreate] = Field(
        default_factory=list,
        description="Line items. At least one is required before the invoice can be issued.",
    )


class InvoiceUpdate(BaseModel):
    """Patch for a DRAFT invoice. Server-assigned fields are never accepted here."""

    customer_id: int | None = Field(None, description="Reassign the customer.")
    contract_id: int | None = Field(None, description="Reassign/clear the originating contract.")
    category_id: int | None = Field(None, description="Reassign/clear the income category.")
    issue_date: date | None = Field(None, description="New issue-date placeholder.")
    due_date: date | None = Field(None, description="New due date.")
    service_period_start: date | None = Field(None, description="New service period start.")
    service_period_end: date | None = Field(None, description="New service period end.")
    discount_total: Decimal | None = Field(
        None, ge=Decimal("0"), description="New flat discount (capped at subtotal)."
    )
    po_number: str | None = Field(
        None, max_length=60, description="New PO number, or null to clear."
    )
    terms: str | None = Field(None, max_length=2000, description="New terms, or null to clear.")
    notes: str | None = Field(None, max_length=2000, description="New notes, or null to clear.")
    line_items: list[InvoiceLineItemCreate] | None = Field(
        None,
        description="If provided, fully REPLACES the existing line items.",
    )


class InvoiceFromContractRequest(BaseModel):
    contract_id: int = Field(
        ..., description="Active contract to seed the draft from.", examples=[1]
    )
    due_date: date | None = Field(
        None,
        description="Override the due date (defaults to today + contract payment terms).",
        examples=["2026-07-09"],
    )


class MarkReceivedRequest(BaseModel):
    received_at: date | None = Field(
        None,
        description="Date the wire landed. Defaults to today on the server.",
        examples=["2026-07-05"],
    )


class VoidInvoiceRequest(BaseModel):
    void_reason: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Reason the invoice is being voided (audited).",
        examples=["Issued in error"],
    )


# ---------------------------------------------------------------------------
# Invoice output
# ---------------------------------------------------------------------------


class InvoiceOut(BaseModel):
    id: int = Field(..., description="Server-assigned invoice id.", examples=[1])
    number: str | None = Field(
        None,
        description="Invoice number (e.g. `INV-000101`). Null while draft; immutable after issue.",
        examples=["INV-000101"],
    )
    status: InvoiceStatus = Field(..., description="Lifecycle status.", examples=["draft"])
    overdue: bool = Field(
        ...,
        description=(
            "Derived: status in {issued, sent}, due_date < today, and the receivable is unsettled."
        ),
        examples=[False],
    )

    customer_id: int = Field(..., description="Billed customer id.", examples=[1])
    contract_id: int | None = Field(
        None, description="Originating contract id, if any.", examples=[1]
    )
    category_id: int | None = Field(
        None, description="Income category id for the receivable.", examples=[1]
    )
    receivable_id: int | None = Field(
        None, description="Auto-created net receivable id (set at issue).", examples=[10]
    )
    currency_code: str = Field(..., description="Billing currency.", examples=["USD"])

    issue_date: date | None = Field(
        None, description="Issue-date placeholder.", examples=["2026-06-09"]
    )
    due_date: date = Field(..., description="Payment due date.", examples=["2026-07-09"])
    service_period_start: date | None = Field(None, description="Service period start.")
    service_period_end: date | None = Field(None, description="Service period end.")

    subtotal: Decimal = Field(..., description="Sum of line subtotals.", examples=["5000.00"])
    discount_total: Decimal = Field(..., description="Flat discount applied.", examples=["0.00"])
    tax_total: Decimal = Field(..., description="Sum of line taxes.", examples=["0.00"])
    total: Decimal = Field(
        ..., description="subtotal - discount_total + tax_total.", examples=["5000.00"]
    )
    bank_fee_amount: Decimal = Field(
        ..., description="Bank receiving fee snapshot.", examples=["44.00"]
    )
    net_amount: Decimal = Field(
        ..., description="total - bank_fee_amount (the receivable value).", examples=["4956.00"]
    )

    po_number: str | None = Field(None, description="Customer PO number.")
    terms: str | None = Field(None, description="Terms shown on the invoice.")
    notes: str | None = Field(None, description="Notes shown on the invoice.")
    void_reason: str | None = Field(None, description="Reason captured when voided.")

    pdf_path: str | None = Field(
        None, description="Relative path of the persisted PDF (server-internal)."
    )
    pdf_generated_at: datetime | None = Field(None, description="When the PDF was generated.")

    issued_at: datetime | None = Field(None, description="When the invoice was issued.")
    sent_at: datetime | None = Field(None, description="When the invoice was marked sent.")
    voided_at: datetime | None = Field(None, description="When the invoice was voided.")

    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    line_items: list[InvoiceLineItemOut] = Field(
        default_factory=list, description="Invoice line items."
    )

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Outstanding summary (aging buckets derived from the linked receivables)
# ---------------------------------------------------------------------------


class InvoiceAgingBucket(BaseModel):
    count: int = Field(
        ..., description="Number of outstanding invoices in this bucket.", examples=[2]
    )
    total: Decimal = Field(
        ..., description="Sum of net receivable amounts in this bucket.", examples=["9912.00"]
    )


class InvoiceOutstandingSummary(BaseModel):
    currency_code: str = Field("USD", description="Currency of the aggregation.", examples=["USD"])
    total: Decimal = Field(
        ..., description="Grand total of outstanding net amounts.", examples=["9912.00"]
    )
    count: int = Field(..., description="Total number of outstanding invoices.", examples=[2])
    by_bucket: dict[str, InvoiceAgingBucket] = Field(
        ...,
        description="Aging breakdown keyed by `current`, `due_today`, `overdue`.",
    )

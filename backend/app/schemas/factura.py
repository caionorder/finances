from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_ruc(ruc: str) -> bool:
    """RUC paraguaio: digits-DV (modulo 11). Aceita com ou sem hyphen."""
    cleaned = ruc.replace("-", "").replace(" ", "")
    if not cleaned.isdigit():
        return False
    if len(cleaned) < 2 or len(cleaned) > 9:
        return False
    base = cleaned[:-1]
    dv = int(cleaned[-1])
    weights = [2, 3, 4, 5, 6, 7]
    s = sum(int(d) * weights[i % 6] for i, d in enumerate(reversed(base)))
    rem = s % 11
    expected_dv = 0 if rem < 2 else 11 - rem
    return dv == expected_dv


class FacturaBase(BaseModel):
    type: Literal["received", "issued"] = Field(
        ...,
        description=(
            "Direction of the factura: `received` (an invoice the company **received** from a "
            "supplier) or `issued` (an invoice the company **emitted** to a customer)."
        ),
        examples=["received"],
    )
    number: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Fiscal document number (free-form alphanumeric — keep separators if present).",
        examples=["001-001-0001234"],
    )
    ruc: str = Field(
        ...,
        min_length=3,
        max_length=20,
        description=(
            "Paraguayan RUC of the counter-party. Digits-only with an optional hyphen for the "
            "DV (validated server-side with modulo-11)."
        ),
        examples=["80012345-6"],
    )
    supplier_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Legal name of the supplier (received) or customer (issued).",
        examples=["Bigbox S.A."],
    )
    date: _dt.date = Field(
        ...,
        description="Issue date of the factura (ISO YYYY-MM-DD).",
        examples=["2026-05-15"],
    )
    total: Decimal = Field(
        ...,
        ge=Decimal("0"),
        description="Grand total of the factura. Decimal string. Must equal `iva_5 + iva_10 + exempt`.",
        examples=["1500000"],
    )
    iva_5: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Subtotal taxed at the 5% IVA bracket. Defaults to `0`.",
        examples=["100000"],
    )
    iva_10: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Subtotal taxed at the 10% IVA bracket. Defaults to `0`.",
        examples=["1300000"],
    )
    exempt: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        description="Subtotal that is IVA-exempt. Defaults to `0`.",
        examples=["100000"],
    )
    currency_code: str = Field(
        "PYG",
        min_length=3,
        max_length=3,
        description="ISO 3-letter currency code. Defaults to `PYG` (Guarani).",
        examples=["PYG"],
    )
    category_id: int | None = Field(
        None,
        description="Optional category id to map the factura to the chart of accounts.",
        examples=[12],
    )
    notes: str | None = Field(
        None,
        max_length=1000,
        description="Free-form notes (max 1000 chars).",
        examples=["Compra de equipamentos para o escritório."],
    )

    @field_validator("ruc")
    @classmethod
    def _ruc_must_have_digits(cls, v: str) -> str:
        cleaned = v.replace("-", "").replace(" ", "")
        if not cleaned or not cleaned.isdigit():
            raise ValueError("ruc must contain only digits and optional hyphen")
        if len(cleaned) < 2 or len(cleaned) > 9:
            raise ValueError("ruc length must be between 2 and 9 digits")
        return v


class FacturaCreate(FacturaBase):
    pass


class FacturaUpdate(BaseModel):
    type: Literal["received", "issued"] | None = Field(
        None,
        description="New direction (`received` or `issued`). Omit to preserve.",
    )
    number: str | None = Field(
        None, min_length=1, max_length=50,
        description="New fiscal number. Omit to preserve.",
        examples=["001-001-0001234"],
    )
    ruc: str | None = Field(
        None, min_length=3, max_length=20,
        description="New RUC (validated modulo-11). Omit to preserve.",
        examples=["80012345-6"],
    )
    supplier_name: str | None = Field(
        None, min_length=1, max_length=255,
        description="New supplier/customer name. Omit to preserve.",
    )
    date: _dt.date | None = Field(None, description="New issue date.", examples=["2026-05-20"])
    total: Decimal | None = Field(None, ge=Decimal("0"), description="New grand total.", examples=["1500000"])
    iva_5: Decimal | None = Field(None, ge=Decimal("0"), description="New 5% IVA subtotal.")
    iva_10: Decimal | None = Field(None, ge=Decimal("0"), description="New 10% IVA subtotal.")
    exempt: Decimal | None = Field(None, ge=Decimal("0"), description="New IVA-exempt subtotal.")
    category_id: int | None = Field(
        None,
        description="New category id, or null to clear.",
    )
    notes: str | None = Field(None, max_length=1000, description="New notes (max 1000 chars).")

    @field_validator("ruc")
    @classmethod
    def _ruc_must_have_digits(cls, v: str | None) -> str | None:
        if v is None:
            return v
        cleaned = v.replace("-", "").replace(" ", "")
        if not cleaned or not cleaned.isdigit():
            raise ValueError("ruc must contain only digits and optional hyphen")
        if len(cleaned) < 2 or len(cleaned) > 9:
            raise ValueError("ruc length must be between 2 and 9 digits")
        return v


class FacturaOut(BaseModel):
    id: int = Field(..., description="Server-assigned factura id.", examples=[101])
    type: Literal["received", "issued"] = Field(..., description="Direction of the factura.", examples=["received"])
    number: str = Field(..., description="Fiscal document number.", examples=["001-001-0001234"])
    ruc: str = Field(..., description="RUC of the counter-party.", examples=["80012345-6"])
    supplier_name: str = Field(..., description="Supplier (received) or customer (issued) name.", examples=["Bigbox S.A."])
    date: _dt.date = Field(..., description="Issue date.", examples=["2026-05-15"])
    total: Decimal = Field(..., description="Grand total (decimal string).", examples=["1500000"])
    iva_5: Decimal = Field(..., description="5% IVA subtotal.", examples=["100000"])
    iva_10: Decimal = Field(..., description="10% IVA subtotal.", examples=["1300000"])
    exempt: Decimal = Field(..., description="IVA-exempt subtotal.", examples=["100000"])
    currency_code: str = Field(..., description="ISO currency code.", examples=["PYG"])
    category_id: int | None = Field(None, description="Linked category id, if any.")
    notes: str | None = Field(None, description="Free-form notes.")
    file_path: str | None = Field(
        None,
        description=(
            "Relative path of the attachment under `UPLOAD_DIR`. `null` when no file was "
            "uploaded. Clients should not access this directly — use `GET /facturas/{id}/download`."
        ),
    )
    file_mime: str | None = Field(
        None,
        description="MIME type of the attached file (e.g. `application/pdf`, `image/jpeg`).",
        examples=["application/pdf"],
    )
    file_size: int | None = Field(
        None,
        description="Size of the attachment in bytes.",
        examples=[152400],
    )
    has_file: bool = Field(
        ...,
        description="Convenience flag: `true` when an attachment exists, derived from `file_path`.",
        examples=[True],
    )
    created_at: _dt.datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: _dt.datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "FacturaBase",
    "FacturaCreate",
    "FacturaUpdate",
    "FacturaOut",
    "_validate_ruc",
]

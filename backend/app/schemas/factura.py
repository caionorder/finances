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
    type: Literal["received", "issued"]
    number: str = Field(..., min_length=1, max_length=50)
    ruc: str = Field(..., min_length=3, max_length=20)
    supplier_name: str = Field(..., min_length=1, max_length=255)
    date: _dt.date
    total: Decimal = Field(..., ge=Decimal("0"))
    iva_5: Decimal = Field(Decimal("0"), ge=Decimal("0"))
    iva_10: Decimal = Field(Decimal("0"), ge=Decimal("0"))
    exempt: Decimal = Field(Decimal("0"), ge=Decimal("0"))
    currency_code: str = Field("PYG", min_length=3, max_length=3)
    category_id: int | None = None
    notes: str | None = Field(None, max_length=1000)

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
    type: Literal["received", "issued"] | None = None
    number: str | None = Field(None, min_length=1, max_length=50)
    ruc: str | None = Field(None, min_length=3, max_length=20)
    supplier_name: str | None = Field(None, min_length=1, max_length=255)
    date: _dt.date | None = None
    total: Decimal | None = Field(None, ge=Decimal("0"))
    iva_5: Decimal | None = Field(None, ge=Decimal("0"))
    iva_10: Decimal | None = Field(None, ge=Decimal("0"))
    exempt: Decimal | None = Field(None, ge=Decimal("0"))
    category_id: int | None = None
    notes: str | None = Field(None, max_length=1000)

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
    id: int
    type: Literal["received", "issued"]
    number: str
    ruc: str
    supplier_name: str
    date: _dt.date
    total: Decimal
    iva_5: Decimal
    iva_10: Decimal
    exempt: Decimal
    currency_code: str
    category_id: int | None
    notes: str | None
    file_path: str | None
    file_mime: str | None
    file_size: int | None
    has_file: bool
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "FacturaBase",
    "FacturaCreate",
    "FacturaUpdate",
    "FacturaOut",
    "_validate_ruc",
]

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InvestmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: Literal["cdb", "lci", "lca", "tesouro", "poupanca", "fundo", "acoes", "cripto", "outros"]
    account_id: int | None = None
    currency_code: str = Field(..., min_length=2, max_length=10)
    principal: Decimal = Field(..., gt=Decimal("0"))
    start_date: date
    maturity_date: date | None = None
    rate_value: Decimal = Field(..., ge=Decimal("0"))
    rate_period: Literal["monthly", "semiannual", "annual"]
    rate_kind: Literal["fixed", "percent_of_index", "index_plus"] = "fixed"
    index_ref: Literal["cdi", "selic", "ipca", "igpm"] | None = None
    liquidity: Literal["daily", "on_maturity"] = "daily"
    notes: str | None = Field(None, max_length=500)


class InvestmentCreate(InvestmentBase):
    pass


class InvestmentUpdate(BaseModel):
    name: str | None = None
    account_id: int | None = None
    maturity_date: date | None = None
    rate_value: Decimal | None = None
    rate_period: Literal["monthly", "semiannual", "annual"] | None = None
    rate_kind: Literal["fixed", "percent_of_index", "index_plus"] | None = None
    index_ref: Literal["cdi", "selic", "ipca", "igpm"] | None = None
    liquidity: Literal["daily", "on_maturity"] | None = None
    notes: str | None = None
    is_archived: bool | None = None


class InvestmentOut(InvestmentBase):
    id: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InvestmentWithPosition(InvestmentOut):
    total_invested: Decimal
    total_withdrawn: Decimal
    current_value: Decimal
    gross_gain: Decimal
    gain_percent: Decimal


class MovementCreate(BaseModel):
    type: Literal["deposit", "withdrawal", "interest"]
    amount: Decimal = Field(..., gt=Decimal("0"))
    date: date
    notes: str | None = Field(None, max_length=500)


class MovementOut(BaseModel):
    id: int
    investment_id: int
    type: str
    amount: Decimal
    date: date
    transaction_id: int | None
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PositionResponse(BaseModel):
    investment_id: int
    as_of: date
    principal: Decimal
    total_invested: Decimal
    total_withdrawn: Decimal
    current_value: Decimal
    gross_gain: Decimal
    gain_percent: Decimal
    days_elapsed: int


class ProjectionPoint(BaseModel):
    date: date
    value: Decimal


class ProjectionResponse(BaseModel):
    investment_id: int
    until: date
    points: list[ProjectionPoint]

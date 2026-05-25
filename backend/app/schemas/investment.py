import datetime as _dt
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InvestmentBase(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable label for the investment.",
        examples=["CDB Inter 110% CDI"],
    )
    type: Literal["cdb", "lci", "lca", "tesouro", "poupanca", "fundo", "acoes", "cripto", "outros"] = Field(
        ...,
        description=(
            "Investment vehicle: `cdb`, `lci`, `lca`, `tesouro`, `poupanca`, `fundo`, "
            "`acoes`, `cripto`, `outros`."
        ),
        examples=["cdb"],
    )
    account_id: int | None = Field(
        None,
        description="Optional linked account id (e.g. brokerage cash account).",
        examples=[3],
    )
    currency_code: str = Field(
        ...,
        min_length=2,
        max_length=10,
        description="ISO-like currency the investment is denominated in. Immutable once set.",
        examples=["BRL"],
    )
    principal: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Initial principal amount invested. Serialized as decimal string.",
        examples=["10000.00"],
    )
    start_date: date = Field(
        ...,
        description="Date the investment started accruing yield (ISO YYYY-MM-DD).",
        examples=["2026-01-15"],
    )
    maturity_date: date | None = Field(
        None,
        description="Maturity / redemption date. `null` for open-ended positions (equities, crypto).",
        examples=["2027-01-15"],
    )
    rate_value: Decimal = Field(
        ...,
        ge=Decimal("0"),
        description=(
            "Yield rate value as a decimal string. Interpretation depends on `rate_kind` "
            "(e.g. `110` paired with `percent_of_index` + `cdi` = 110% of CDI)."
        ),
        examples=["110"],
    )
    rate_period: Literal["monthly", "semiannual", "annual"] = Field(
        ...,
        description="Period for the rate: `monthly`, `semiannual` or `annual`.",
        examples=["annual"],
    )
    rate_kind: Literal["fixed", "percent_of_index", "index_plus"] = Field(
        "fixed",
        description=(
            "How `rate_value` should be interpreted: `fixed` (literal %), `percent_of_index` "
            "(% of `index_ref`), `index_plus` (`index_ref` + fixed spread)."
        ),
        examples=["percent_of_index"],
    )
    index_ref: Literal["cdi", "selic", "ipca", "igpm"] | None = Field(
        None,
        description="Reference index used by `percent_of_index` / `index_plus`. Required for those kinds.",
        examples=["cdi"],
    )
    liquidity: Literal["daily", "on_maturity"] = Field(
        "daily",
        description="`daily` if redeemable at any time, `on_maturity` if locked until `maturity_date`.",
        examples=["daily"],
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="Free-text notes (max 500 chars).",
    )


class InvestmentCreate(InvestmentBase):
    pass


class InvestmentUpdate(BaseModel):
    name: str | None = Field(None, description="New display name. Omit to preserve.")
    account_id: int | None = Field(None, description="New linked account id, or null to clear.")
    maturity_date: date | None = Field(None, description="New maturity date, or null to clear.")
    rate_value: Decimal | None = Field(None, description="New yield rate value.", examples=["115"])
    rate_period: Literal["monthly", "semiannual", "annual"] | None = Field(
        None, description="New rate period."
    )
    rate_kind: Literal["fixed", "percent_of_index", "index_plus"] | None = Field(
        None, description="New rate kind."
    )
    index_ref: Literal["cdi", "selic", "ipca", "igpm"] | None = Field(
        None, description="New reference index."
    )
    liquidity: Literal["daily", "on_maturity"] | None = Field(
        None, description="New liquidity flag."
    )
    notes: str | None = Field(None, description="New notes, or null to clear.")
    is_archived: bool | None = Field(
        None,
        description="Set true to archive (or false to unarchive) the investment.",
        examples=[True],
    )


class InvestmentOut(InvestmentBase):
    id: int = Field(..., description="Server-assigned investment id.", examples=[42])
    is_archived: bool = Field(
        ..., description="True if archived (hidden from default listings).", examples=[False]
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)


class InvestmentWithPosition(InvestmentOut):
    total_invested: Decimal = Field(
        ...,
        description="Sum of `deposit` movements minus zero — i.e. money contributed so far.",
        examples=["10000.00"],
    )
    total_withdrawn: Decimal = Field(
        ...,
        description="Sum of `withdrawal` movements.",
        examples=["0.00"],
    )
    current_value: Decimal = Field(
        ...,
        description="Live position value as of \"now\" (principal + interest - withdrawals).",
        examples=["10456.78"],
    )
    gross_gain: Decimal = Field(
        ...,
        description="`current_value - total_invested + total_withdrawn`.",
        examples=["456.78"],
    )
    gain_percent: Decimal = Field(
        ...,
        description="`gross_gain / total_invested * 100`, expressed as a decimal string.",
        examples=["4.57"],
    )


class MovementCreate(BaseModel):
    type: Literal["deposit", "withdrawal", "interest"] = Field(
        ...,
        description="Movement kind: `deposit`, `withdrawal` or `interest` (accrual booking).",
        examples=["deposit"],
    )
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Movement amount. Always positive; the `type` carries the direction.",
        examples=["500.00"],
    )
    date: _dt.date = Field(..., description="Movement date (ISO YYYY-MM-DD).", examples=["2026-05-25"])
    notes: str | None = Field(None, max_length=500, description="Free-text notes (max 500 chars).")


class MovementOut(BaseModel):
    id: int = Field(..., description="Server-assigned movement id.", examples=[7])
    investment_id: int = Field(..., description="Parent investment id.", examples=[42])
    type: str = Field(..., description="Movement kind: `deposit`, `withdrawal` or `interest`.", examples=["deposit"])
    amount: Decimal = Field(..., description="Movement amount (always positive).", examples=["500.00"])
    date: _dt.date = Field(..., description="Movement date.")
    transaction_id: int | None = Field(
        None,
        description=(
            "Linked transaction id when the movement also posted a real transaction on the "
            "linked account. `null` when stand-alone."
        ),
    )
    notes: str | None = Field(None, description="Free-form notes.")
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)


class PositionResponse(BaseModel):
    investment_id: int = Field(..., description="Investment id this position refers to.", examples=[42])
    as_of: date = Field(..., description="Reference date the position was computed against.", examples=["2026-05-25"])
    principal: Decimal = Field(..., description="Original principal at start.", examples=["10000.00"])
    total_invested: Decimal = Field(..., description="Cumulative contributions.", examples=["10000.00"])
    total_withdrawn: Decimal = Field(..., description="Cumulative withdrawals.", examples=["0.00"])
    current_value: Decimal = Field(..., description="Position value at `as_of`.", examples=["10456.78"])
    gross_gain: Decimal = Field(..., description="Profit/loss in absolute terms.", examples=["456.78"])
    gain_percent: Decimal = Field(..., description="Profit/loss in percent.", examples=["4.57"])
    days_elapsed: int = Field(..., description="Days between `start_date` and `as_of`.", examples=[130])


class ProjectionPoint(BaseModel):
    date: _dt.date = Field(..., description="Projected date.", examples=["2026-06-25"])
    value: Decimal = Field(..., description="Projected investment value at that date.", examples=["10510.00"])


class ProjectionResponse(BaseModel):
    investment_id: int = Field(..., description="Investment id.", examples=[42])
    until: date = Field(..., description="Projection horizon.", examples=["2027-01-15"])
    points: list[ProjectionPoint] = Field(
        ...,
        description="Periodic projected values from \"today\" up to `until`.",
    )

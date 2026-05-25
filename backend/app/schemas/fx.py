from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class FxRateOut(BaseModel):
    base_code: str = Field(
        ...,
        description="Source currency code (the unit of `rate`'s denominator).",
        examples=["USD"],
    )
    quote_code: str = Field(
        ...,
        description="Target currency code (the unit of `rate`'s numerator).",
        examples=["BRL"],
    )
    rate: Decimal = Field(
        ...,
        description=(
            "How much `quote_code` is one unit of `base_code` worth. Serialized as a decimal "
            "string for precision."
        ),
        examples=["5.1234"],
    )
    source: str = Field(
        ...,
        description="Name of the upstream provider that emitted the rate (e.g. `exchangerate-api`).",
        examples=["exchangerate-api"],
    )
    fetched_at: datetime = Field(
        ...,
        description="UTC timestamp when the rate was fetched from the provider.",
        examples=["2026-05-25T10:00:00Z"],
    )

    model_config = ConfigDict(from_attributes=True)


class RefreshResult(BaseModel):
    fetched: int = Field(
        ...,
        description="Number of currency pairs the upstream provider returned.",
        examples=[20],
    )
    persisted: int = Field(
        ...,
        description="Number of pairs actually persisted (skipping unchanged or invalid rows).",
        examples=[18],
    )
    error: str | None = Field(
        None,
        description=(
            "If the refresh failed partially, a human-readable summary of what went wrong. "
            "`null` on full success."
        ),
    )

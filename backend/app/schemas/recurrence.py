from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RecurrenceRule(BaseModel):
    """Simplified RRULE-like rule (subset).

    * `weekly`: `day` 1..7 (mon=1, sun=7); repeats every N weeks via `interval`.
    * `monthly`: `day` 1..31 (clamped to the target month's last day if needed).
    * `yearly`: uses month/day from the last instance to keep the anniversary.
    * `custom`: reserved — not implemented yet.
    """

    freq: Literal["weekly", "monthly", "yearly", "custom"] = Field(
        ...,
        description="Recurrence cadence: `weekly`, `monthly`, `yearly` or `custom` (reserved).",
        examples=["monthly"],
    )
    interval: int = Field(
        1,
        ge=1,
        le=12,
        description=(
            "Period multiplier within `freq` (1-12). E.g. `freq=weekly, interval=2` means "
            "every two weeks."
        ),
        examples=[1],
    )
    day: int | None = Field(
        None,
        ge=1,
        le=31,
        description=(
            "Day of the period to fire on. For `weekly`: 1..7 (mon-sun). For `monthly`: "
            "1..31 (clamped to the last day of the target month)."
        ),
        examples=[5],
    )
    month: int | None = Field(
        None,
        ge=1,
        le=12,
        description="For `yearly` cadence — month of the year (1..12).",
        examples=[3],
    )
    until: date | None = Field(
        None,
        description="Optional end date for the rule (inclusive). `null` for open-ended.",
        examples=["2027-12-31"],
    )


class RecurrenceUpdate(BaseModel):
    rule: RecurrenceRule | None = Field(
        None,
        description="New recurrence rule. Replaces the previous rule wholesale.",
    )
    template: dict | None = Field(
        None,
        description=(
            "New JSON template used as the body when materializing the next instance "
            "(payable or receivable shape)."
        ),
    )
    next_run_date: date | None = Field(
        None,
        description="Override the next-run date (e.g. to skip an instance).",
        examples=["2026-07-01"],
    )
    is_active: bool | None = Field(
        None,
        description="Toggle activation. Set `false` to soft-stop, `true` to resume.",
        examples=[True],
    )


class RecurrenceOut(BaseModel):
    id: int = Field(..., description="Server-assigned recurrence id.", examples=[12])
    kind: str = Field(
        ...,
        description="What this template generates: `payable` or `receivable`.",
        examples=["payable"],
    )
    rule_json: dict = Field(
        ...,
        description=(
            "Recurrence rule serialized as JSON. Mirrors the `RecurrenceRule` model."
        ),
    )
    template_json: dict = Field(
        ...,
        description=(
            "JSON template used as the body of the next generated instance — typically the "
            "Create payload for a payable/receivable minus the date."
        ),
    )
    next_run_date: date | None = Field(
        None,
        description="Date the scheduler will next materialize an instance.",
        examples=["2026-06-05"],
    )
    is_active: bool = Field(
        ...,
        description="False when the template has been deactivated or exhausted.",
        examples=[True],
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC).")

    model_config = ConfigDict(from_attributes=True)

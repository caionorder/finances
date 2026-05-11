from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RecurrenceRule(BaseModel):
    """Subset de RRULE simplificado.

    - weekly: `day` 1..7 (mon-sun); cada N semanas via `interval`.
    - monthly: `day` 1..31 (clamp ao ultimo dia do mes alvo).
    - yearly: usa mes/dia da `last_date` (mantem aniversario).
    - custom: nao implementado ainda; reservado.
    """

    freq: Literal["weekly", "monthly", "yearly", "custom"]
    interval: int = Field(1, ge=1, le=12)
    day: int | None = Field(None, ge=1, le=31)
    month: int | None = Field(None, ge=1, le=12)
    until: date | None = None


class RecurrenceUpdate(BaseModel):
    rule: RecurrenceRule | None = None
    template: dict | None = None
    next_run_date: date | None = None
    is_active: bool | None = None


class RecurrenceOut(BaseModel):
    id: int
    kind: str
    rule_json: dict
    template_json: dict
    next_run_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

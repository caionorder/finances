from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import AclPermission, CycleStatus


class CreditCardBase(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable card name (e.g. `Itaú Black`, `Amex Aeternum`).",
        examples=["Itaú Black"],
    )
    currency_code: str = Field(
        ...,
        min_length=2,
        max_length=10,
        description="Currency the card operates in (`BRL`, `USD`, `PYG`, ...).",
        examples=["BRL"],
    )
    card_type: Literal["credit", "debit"] = Field(
        "credit",
        description="`credit` (default) or `debit`.",
    )
    limit_amount: Decimal | None = Field(
        None,
        description="Total credit limit (decimal string). Null for debit/no-limit cards.",
        examples=["10000.00"],
    )
    closing_day: int | None = Field(
        None,
        ge=1,
        le=31,
        description="Day of month the billing cycle closes (1-31). Drives cycle generation.",
        examples=[20],
    )
    due_day: int | None = Field(
        None,
        ge=1,
        le=31,
        description="Day of month the bill is due (1-31).",
        examples=[5],
    )
    payment_account_id: int | None = Field(
        None,
        description="Account auto-debited when the bill is paid.",
    )
    parent_card_id: int | None = Field(
        None,
        description="Set for additional/secondary cards that share the parent's billing cycle.",
    )


class CreditCardCreate(CreditCardBase):
    pass


class CreditCardUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    limit_amount: Decimal | None = None
    closing_day: int | None = Field(None, ge=1, le=31)
    due_day: int | None = Field(None, ge=1, le=31)
    payment_account_id: int | None = None
    is_archived: bool | None = None


class CreditCardOut(CreditCardBase):
    id: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    permission_for_me: Literal["read", "write"] | None = None

    model_config = ConfigDict(from_attributes=True)


class CreditCardWithSummary(CreditCardOut):
    current_cycle_total: Decimal
    current_cycle_due_date: date | None
    available_credit: Decimal | None
    is_additional: bool = False


class CreditCardAclItem(BaseModel):
    user_id: int
    permission: AclPermission


class CreditCardAclEntryOut(BaseModel):
    user_id: int
    user_email: EmailStr
    user_name: str
    permission: AclPermission

    model_config = ConfigDict(from_attributes=True)


class CreditCardAclSetRequest(BaseModel):
    acls: list[CreditCardAclItem]


class CycleOut(BaseModel):
    id: int
    credit_card_id: int
    period_start: date
    period_end: date
    due_date: date
    total_amount: Decimal
    status: CycleStatus
    purchase_count: int

    model_config = ConfigDict(from_attributes=True)

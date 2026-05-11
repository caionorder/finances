import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TransactionKind


class TransactionBase(BaseModel):
    account_id: int = Field(
        ...,
        description="Id of the account that owns the transaction. Currency is inherited.",
        examples=[1],
    )
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description=(
            "Positive monetary amount. Serialized as a **string** to preserve decimal "
            "precision. The `kind` controls the balance effect (income → +, expense → -)."
        ),
        examples=["123.45"],
    )
    kind: TransactionKind = Field(
        ...,
        description="`income`, `expense` or `transfer`. Use `transfer` only via `/transactions/transfer`.",
        examples=["expense"],
    )
    category_id: int | None = Field(
        None,
        description="Optional category id. Discover valid ids via `GET /categories`.",
        examples=[7],
    )
    date: _dt.date = Field(
        ...,
        description="Transaction date (ISO-8601 `YYYY-MM-DD`).",
        examples=["2026-05-11"],
    )
    description: str | None = Field(
        None,
        max_length=500,
        description="Free-text label. Max 500 chars.",
        examples=["Lunch at Black Burger"],
    )


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    amount: Decimal | None = Field(
        default=None,
        gt=Decimal("0"),
        description="New amount (positive decimal string). Omit to keep current value.",
        examples=["150.00"],
    )
    category_id: int | None = Field(
        None,
        description="New category id, or null to clear.",
    )
    date: _dt.date | None = Field(
        default=None,
        description="New transaction date.",
        examples=["2026-05-12"],
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="New description, or null to clear.",
    )


class TransactionOut(BaseModel):
    id: int
    account_id: int
    currency_code: str = Field(
        ...,
        description="ISO-like currency code inherited from the account (e.g. `BRL`, `USD`, `PYG`).",
        examples=["BRL"],
    )
    amount: Decimal = Field(
        ...,
        description="Amount as decimal string. Always positive; sign comes from `kind`.",
        examples=["123.45"],
    )
    kind: TransactionKind
    category_id: int | None
    date: _dt.date
    description: str | None
    transfer_pair_id: int | None = Field(
        None,
        description="When set, points to the paired leg of a transfer.",
    )
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)


class TransferCreate(BaseModel):
    source_account_id: int = Field(..., description="Account to debit.", examples=[1])
    destination_account_id: int = Field(..., description="Account to credit.", examples=[2])
    amount: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Transfer amount. Both accounts must share the same currency.",
        examples=["500.00"],
    )
    date: _dt.date = Field(..., description="Transfer date (ISO-8601).", examples=["2026-05-11"])
    description: str | None = Field(default=None, max_length=500)


class TransferOut(BaseModel):
    source_transaction: TransactionOut
    destination_transaction: TransactionOut

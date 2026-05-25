from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import AccountType, AclPermission


class AccountBase(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable label for the account (e.g. \"Itaú PJ\", \"Cash USD\").",
        examples=["Itaú PJ"],
    )
    type: AccountType = Field(
        ...,
        description="Account category: `checking`, `savings`, `cash`, `investment`, `other`.",
        examples=["checking"],
    )
    currency_code: str = Field(
        ...,
        min_length=2,
        max_length=10,
        description=(
            "ISO-like currency code that pins the account's currency. Immutable post-creation "
            "— all transactions inherit this value."
        ),
        examples=["BRL"],
    )
    opening_balance: Decimal = Field(
        Decimal("0"),
        description=(
            "Initial balance booked when the account was created. Serialized as a decimal "
            "string. Add to `movements_total` to obtain `current_balance`."
        ),
        examples=["1000.00"],
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="Free-text notes. Max 500 chars.",
        examples=["Conta usada para faturas da PJ."],
    )


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="New display name. Omit to keep current value.",
        examples=["Itaú PJ (matriz)"],
    )
    type: AccountType | None = Field(
        None,
        description="New account type. Currency cannot be changed via update.",
    )
    opening_balance: Decimal | None = Field(
        None,
        description=(
            "Adjust the historical opening balance. Use sparingly — typically only at account "
            "set-up time."
        ),
        examples=["1500.00"],
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="New notes string, or null to clear.",
    )
    is_archived: bool | None = Field(
        None,
        description="Flip to true to archive (or false to unarchive) without deleting transactions.",
        examples=[True],
    )


class AccountOut(AccountBase):
    id: int = Field(..., description="Server-assigned account id.", examples=[1])
    is_archived: bool = Field(
        ...,
        description="True if the account is archived and hidden from default listings.",
        examples=[False],
    )
    created_at: datetime = Field(..., description="Creation timestamp (UTC ISO-8601).")
    updated_at: datetime = Field(..., description="Last-update timestamp (UTC ISO-8601).")
    permission_for_me: Literal["read", "write"] | None = Field(
        None,
        description=(
            "Caller's effective permission on this account: `read`, `write`, or `null` if "
            "they have no ACL entry (admins are not gated by this field)."
        ),
        examples=["write"],
    )

    model_config = ConfigDict(from_attributes=True)


class AccountWithBalance(AccountOut):
    current_balance: Decimal = Field(
        ...,
        description=(
            "Live balance as of \"now\": `opening_balance + movements_total`. Serialized as "
            "decimal string."
        ),
        examples=["1234.56"],
    )


class BalanceResponse(BaseModel):
    account_id: int = Field(..., description="Account id this balance refers to.", examples=[1])
    currency_code: str = Field(..., description="Currency of the balance (matches the account).", examples=["BRL"])
    opening_balance: Decimal = Field(
        ...,
        description="Initial balance at account creation.",
        examples=["1000.00"],
    )
    movements_total: Decimal = Field(
        ...,
        description=(
            "Signed sum of transactions up to and including `as_of` (income +, expense -, "
            "transfer ± depending on direction)."
        ),
        examples=["234.56"],
    )
    current_balance: Decimal = Field(
        ...,
        description="`opening_balance + movements_total`.",
        examples=["1234.56"],
    )
    as_of: date = Field(
        ...,
        description="Reference date used to compute the balance.",
        examples=["2026-05-25"],
    )


class AclItem(BaseModel):
    user_id: int = Field(
        ...,
        description="Target user id that should receive (or update) the permission.",
        examples=[42],
    )
    permission: AclPermission = Field(
        ...,
        description="Permission level: `read` (view only) or `write` (mutate transactions/ACLs).",
        examples=["write"],
    )


class AclEntryOut(BaseModel):
    user_id: int = Field(..., description="User id of the ACL grantee.", examples=[42])
    user_email: EmailStr = Field(..., description="Email of the grantee (for display).", examples=["user@example.com"])
    user_name: str = Field(..., description="Full name of the grantee (for display).", examples=["Maria Souza"])
    permission: AclPermission = Field(
        ...,
        description="Permission level: `read` or `write`.",
        examples=["read"],
    )

    model_config = ConfigDict(from_attributes=True)


class AclSetRequest(BaseModel):
    acls: list[AclItem] = Field(
        ...,
        description=(
            "Full list of ACL entries that should remain on the account after this PUT call. "
            "Any user not present in this list loses access. To grant the caller's own user, "
            "include them explicitly."
        ),
        examples=[[{"user_id": 42, "permission": "write"}]],
    )

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import AccountType, AclPermission


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: AccountType
    currency_code: str = Field(..., min_length=2, max_length=10)
    opening_balance: Decimal = Decimal("0")
    notes: str | None = Field(None, max_length=500)


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    type: AccountType | None = None
    opening_balance: Decimal | None = None
    notes: str | None = Field(None, max_length=500)
    is_archived: bool | None = None


class AccountOut(AccountBase):
    id: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    permission_for_me: Literal["read", "write"] | None = None

    model_config = ConfigDict(from_attributes=True)


class AccountWithBalance(AccountOut):
    current_balance: Decimal


class BalanceResponse(BaseModel):
    account_id: int
    currency_code: str
    opening_balance: Decimal
    movements_total: Decimal
    current_balance: Decimal
    as_of: date


class AclItem(BaseModel):
    user_id: int
    permission: AclPermission


class AclEntryOut(BaseModel):
    user_id: int
    user_email: EmailStr
    user_name: str
    permission: AclPermission

    model_config = ConfigDict(from_attributes=True)


class AclSetRequest(BaseModel):
    acls: list[AclItem]

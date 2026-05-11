from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class CashflowBucket(BaseModel):
    period: str
    income: Decimal
    expense: Decimal
    net: Decimal


class CashflowReport(BaseModel):
    currency: str
    from_date: date
    to_date: date
    group_by: Literal["month", "week", "day"]
    buckets: list[CashflowBucket]
    totals: CashflowBucket


class CategoryNode(BaseModel):
    category_id: int | None
    name: str
    color: str | None
    icon: str | None
    own_total: Decimal
    subtree_total: Decimal
    children: list["CategoryNode"] = []


CategoryNode.model_rebuild()


class ByCategoryReport(BaseModel):
    currency: str
    from_date: date
    to_date: date
    kind: Literal["income", "expense"]
    total: Decimal
    nodes: list[CategoryNode]


class ForecastActualItem(BaseModel):
    period: str
    forecast_in: Decimal
    actual_in: Decimal
    forecast_out: Decimal
    actual_out: Decimal


class ForecastVsActualReport(BaseModel):
    currency: str
    from_date: date
    to_date: date
    items: list[ForecastActualItem]


class AccountBalance(BaseModel):
    account_id: int
    name: str
    type: str
    balance: Decimal


class CreditCardBalance(BaseModel):
    credit_card_id: int
    name: str
    cycle_total: Decimal
    available_credit: Decimal | None


class NetWorthByCurrency(BaseModel):
    currency: str
    accounts_total: Decimal
    credit_cards_total: Decimal
    net: Decimal
    accounts: list[AccountBalance]
    credit_cards: list[CreditCardBalance]


class NetWorthReport(BaseModel):
    as_of: date
    by_currency: list[NetWorthByCurrency]
    converted_to: str | None = None
    total_converted: Decimal | None = None


# ---------------------------------------------------------------------------
# BI reports (Sprint 2 — Quick Wins)
# ---------------------------------------------------------------------------


class AgingBucket(BaseModel):
    count: int
    total_remaining: Decimal


AgingBucketKey = Literal["overdue", "due_today", "1_7", "8_14", "15_30", "30_plus"]


class AgingReport(BaseModel):
    currency_code: str
    as_of: date
    buckets: dict[str, AgingBucket]
    grand_total_remaining: Decimal
    grand_count: int


class MonthExpense(BaseModel):
    period: str
    expense: Decimal


class BurnRateReport(BaseModel):
    currency_code: str
    as_of: date
    burn_3m: Decimal
    burn_6m: Decimal
    burn_12m: Decimal
    by_month: list[MonthExpense]


class SavingsItem(BaseModel):
    period: str
    income: Decimal
    expense: Decimal
    savings_rate: Decimal | None


class SavingsRateReport(BaseModel):
    currency_code: str
    from_date: date
    to_date: date
    items: list[SavingsItem]
    avg_3m: Decimal | None
    avg_12m: Decimal | None


class RunwayReport(BaseModel):
    currency_code: str
    as_of: date
    net_worth: Decimal
    burn_3m: Decimal
    burn_6m: Decimal
    burn_12m: Decimal
    runway_months_3m: Decimal | None
    runway_months_6m: Decimal | None
    runway_months_12m: Decimal | None
    target_months: int
    status: Literal["critical", "warning", "healthy", "unknown"]


class CurrencyExposureItem(BaseModel):
    currency: str
    net: Decimal
    converted: Decimal | None
    pct: Decimal | None


class CurrencyExposureReport(BaseModel):
    as_of: date
    convert_to: str
    total_converted: Decimal
    items: list[CurrencyExposureItem]


class TopCategoryItem(BaseModel):
    category_id: int | None
    name: str
    current: Decimal
    previous: Decimal
    delta_pct: Decimal | None
    delta_abs: Decimal
    is_new: bool


class TopCategoriesReport(BaseModel):
    currency_code: str
    month: str
    prev_month: str
    items: list[TopCategoryItem]


class NetWorthTrendCurrency(BaseModel):
    currency: str
    net: Decimal
    converted: Decimal | None


class NetWorthTrendItem(BaseModel):
    period: str
    by_currency: list[NetWorthTrendCurrency]
    total_converted: Decimal | None


class NetWorthTrendReport(BaseModel):
    convert_to: str
    from_date: date
    to_date: date
    items: list[NetWorthTrendItem]

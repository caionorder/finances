from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class CashflowBucket(BaseModel):
    period: str = Field(
        ...,
        description="Bucket label — `YYYY-MM-DD` for day/week buckets, `YYYY-MM` for monthly.",
        examples=["2026-05"],
    )
    income: Decimal = Field(..., description="Total income in this bucket (decimal string).", examples=["5000.00"])
    expense: Decimal = Field(..., description="Total expense in this bucket.", examples=["3200.00"])
    net: Decimal = Field(..., description="`income - expense`.", examples=["1800.00"])


class CashflowReport(BaseModel):
    currency: str = Field(..., description="Currency the totals are denominated in.", examples=["BRL"])
    from_date: date = Field(..., description="Inclusive lower bound of the report window.", examples=["2026-01-01"])
    to_date: date = Field(..., description="Inclusive upper bound of the report window.", examples=["2026-05-31"])
    group_by: Literal["month", "week", "day"] = Field(..., description="Bucket granularity used.", examples=["month"])
    buckets: list[CashflowBucket] = Field(..., description="One entry per bucket within the window.")
    totals: CashflowBucket = Field(..., description="Aggregated totals across all buckets.")


class CategoryNode(BaseModel):
    category_id: int | None = Field(None, description="Category id; `null` for the synthetic \"uncategorized\" node.", examples=[5])
    name: str = Field(..., description="Display name.", examples=["Food"])
    color: str | None = Field(None, description="Hex color for charts.", examples=["#FF8800"])
    icon: str | None = Field(None, description="Optional icon identifier.", examples=["restaurant"])
    own_total: Decimal = Field(..., description="Amount directly tagged on this category.", examples=["1200.00"])
    subtree_total: Decimal = Field(
        ...,
        description="`own_total` plus the recursive sum of every descendant.",
        examples=["1500.00"],
    )
    children: list["CategoryNode"] = Field(default_factory=list, description="Nested children (for tree views).")


CategoryNode.model_rebuild()


class ByCategoryReport(BaseModel):
    currency: str = Field(..., description="Currency of the totals.", examples=["BRL"])
    from_date: date = Field(..., description="Inclusive lower bound.")
    to_date: date = Field(..., description="Inclusive upper bound.")
    kind: Literal["income", "expense"] = Field(..., description="Direction the report covers.", examples=["expense"])
    total: Decimal = Field(..., description="Grand total of `subtree_total` across roots.", examples=["3200.00"])
    nodes: list[CategoryNode] = Field(..., description="Root-level category tree.")


class ForecastActualItem(BaseModel):
    period: str = Field(..., description="Month label `YYYY-MM`.", examples=["2026-05"])
    forecast_in: Decimal = Field(..., description="Receivables expected in this period.", examples=["10000.00"])
    actual_in: Decimal = Field(..., description="Income transactions actually booked.", examples=["9500.00"])
    forecast_out: Decimal = Field(..., description="Payables scheduled for this period.", examples=["6000.00"])
    actual_out: Decimal = Field(..., description="Expense transactions actually booked.", examples=["6200.00"])


class ForecastVsActualReport(BaseModel):
    currency: str = Field(..., description="Currency of the totals.", examples=["BRL"])
    from_date: date = Field(..., description="Inclusive lower bound.")
    to_date: date = Field(..., description="Inclusive upper bound.")
    items: list[ForecastActualItem] = Field(..., description="One entry per month in the window.")


class AccountBalance(BaseModel):
    account_id: int = Field(..., description="Account id.", examples=[1])
    name: str = Field(..., description="Account display name.", examples=["Itaú PJ"])
    type: str = Field(..., description="Account type (`checking`, `cash`, ...).", examples=["checking"])
    balance: Decimal = Field(..., description="Balance in the account's own currency.", examples=["5000.00"])


class CreditCardBalance(BaseModel):
    credit_card_id: int = Field(..., description="Credit card id.", examples=[2])
    name: str = Field(..., description="Card display name.", examples=["Nubank Black"])
    cycle_total: Decimal = Field(..., description="Total spent in the current open cycle.", examples=["1200.00"])
    available_credit: Decimal | None = Field(
        None,
        description="Available credit (`limit - cycle_total`). `null` if no limit was configured.",
        examples=["8800.00"],
    )


class NetWorthByCurrency(BaseModel):
    currency: str = Field(..., description="Currency code.", examples=["BRL"])
    accounts_total: Decimal = Field(..., description="Sum of account balances in this currency.", examples=["10000.00"])
    credit_cards_total: Decimal = Field(..., description="Sum of credit card cycles in this currency.", examples=["1200.00"])
    net: Decimal = Field(..., description="`accounts_total - credit_cards_total`.", examples=["8800.00"])
    accounts: list[AccountBalance] = Field(..., description="Per-account breakdown.")
    credit_cards: list[CreditCardBalance] = Field(..., description="Per-card breakdown.")


class NetWorthReport(BaseModel):
    as_of: date = Field(..., description="Snapshot date.", examples=["2026-05-25"])
    by_currency: list[NetWorthByCurrency] = Field(..., description="One entry per currency present.")
    converted_to: str | None = Field(
        None,
        description="Target currency when `convert_to` was passed. `null` otherwise.",
        examples=["USD"],
    )
    total_converted: Decimal | None = Field(
        None,
        description="Sum of every `net` line FX-converted into `converted_to`.",
        examples=["1800.00"],
    )


# ---------------------------------------------------------------------------
# BI reports (Sprint 2 — Quick Wins)
# ---------------------------------------------------------------------------


class AgingBucket(BaseModel):
    count: int = Field(..., description="Number of items in this bucket.", examples=[3])
    total_remaining: Decimal = Field(..., description="Sum of outstanding amounts in this bucket.", examples=["650.00"])


AgingBucketKey = Literal["overdue", "due_today", "1_7", "8_14", "15_30", "30_plus"]


class AgingReport(BaseModel):
    currency_code: str = Field(..., description="Currency the report is scoped to.", examples=["BRL"])
    as_of: date = Field(..., description="Reference date used to compute the buckets.", examples=["2026-05-25"])
    buckets: dict[str, AgingBucket] = Field(
        ...,
        description=(
            "Per-bucket counts and totals. Keys: `overdue`, `due_today`, `1_7`, `8_14`, "
            "`15_30`, `30_plus`."
        ),
    )
    grand_total_remaining: Decimal = Field(..., description="Sum across all buckets.", examples=["3500.00"])
    grand_count: int = Field(..., description="Total items across all buckets.", examples=[12])


class MonthExpense(BaseModel):
    period: str = Field(..., description="Month label `YYYY-MM`.", examples=["2026-05"])
    expense: Decimal = Field(..., description="Total expense for the month.", examples=["3200.00"])


class BurnRateReport(BaseModel):
    currency_code: str = Field(..., description="Currency scope.", examples=["BRL"])
    as_of: date = Field(..., description="Reference date.")
    burn_3m: Decimal = Field(..., description="Average monthly burn over the trailing 3 months.", examples=["3000.00"])
    burn_6m: Decimal = Field(..., description="Average monthly burn over the trailing 6 months.", examples=["2950.00"])
    burn_12m: Decimal = Field(..., description="Average monthly burn over the trailing 12 months.", examples=["2900.00"])
    by_month: list[MonthExpense] = Field(..., description="Per-month expense detail used to compute the averages.")


class SavingsItem(BaseModel):
    period: str = Field(..., description="Month label `YYYY-MM`.", examples=["2026-05"])
    income: Decimal = Field(..., description="Income for the month.", examples=["5000.00"])
    expense: Decimal = Field(..., description="Expense for the month.", examples=["3200.00"])
    savings_rate: Decimal | None = Field(
        None,
        description="`(income - expense) / income` (decimal string). `null` when income is zero.",
        examples=["0.36"],
    )


class SavingsRateReport(BaseModel):
    currency_code: str = Field(..., description="Currency scope.", examples=["BRL"])
    from_date: date = Field(..., description="Inclusive lower bound.")
    to_date: date = Field(..., description="Inclusive upper bound.")
    items: list[SavingsItem] = Field(..., description="Per-month entries within the window.")
    avg_3m: Decimal | None = Field(None, description="Average savings rate over the trailing 3 months.", examples=["0.30"])
    avg_12m: Decimal | None = Field(None, description="Average savings rate over the trailing 12 months.", examples=["0.28"])


class RunwayReport(BaseModel):
    currency_code: str = Field(..., description="Currency scope.", examples=["BRL"])
    as_of: date = Field(..., description="Reference date.")
    net_worth: Decimal = Field(..., description="Total net worth used as numerator for the runway.", examples=["50000.00"])
    burn_3m: Decimal = Field(..., description="Trailing-3-month burn used as one of the denominators.", examples=["3000.00"])
    burn_6m: Decimal = Field(..., description="Trailing-6-month burn.", examples=["2950.00"])
    burn_12m: Decimal = Field(..., description="Trailing-12-month burn.", examples=["2900.00"])
    runway_months_3m: Decimal | None = Field(None, description="`net_worth / burn_3m`. `null` if burn is zero.", examples=["16.67"])
    runway_months_6m: Decimal | None = Field(None, description="`net_worth / burn_6m`.", examples=["16.95"])
    runway_months_12m: Decimal | None = Field(None, description="`net_worth / burn_12m`.", examples=["17.24"])
    target_months: int = Field(..., description="Caller-supplied target runway, used to derive `status`.", examples=[6])
    status: Literal["critical", "warning", "healthy", "unknown"] = Field(
        ...,
        description="Stoplight: `critical`, `warning`, `healthy` or `unknown` when burn is missing.",
        examples=["healthy"],
    )


class CurrencyExposureItem(BaseModel):
    currency: str = Field(..., description="Currency code.", examples=["USD"])
    net: Decimal = Field(..., description="Net asset value held in this currency (native units).", examples=["1000.00"])
    converted: Decimal | None = Field(
        None,
        description="Same `net` FX-converted into the report's base currency.",
        examples=["5123.40"],
    )
    pct: Decimal | None = Field(
        None,
        description="Share of total net worth (0..1 as decimal string).",
        examples=["0.25"],
    )


class CurrencyExposureReport(BaseModel):
    as_of: date = Field(..., description="Snapshot date.")
    convert_to: str = Field(..., description="Base currency for FX conversion.", examples=["USD"])
    total_converted: Decimal = Field(..., description="Sum of every `converted` line.", examples=["20000.00"])
    items: list[CurrencyExposureItem] = Field(..., description="One entry per native currency.")


class TopCategoryItem(BaseModel):
    category_id: int | None = Field(None, description="Category id; `null` for uncategorized.")
    name: str = Field(..., description="Display name.", examples=["Food"])
    current: Decimal = Field(..., description="Expense in the requested month.", examples=["1200.00"])
    previous: Decimal = Field(..., description="Expense in the previous month, for comparison.", examples=["900.00"])
    delta_pct: Decimal | None = Field(
        None,
        description="Percentage change vs previous month. `null` when previous is zero.",
        examples=["0.33"],
    )
    delta_abs: Decimal = Field(..., description="Absolute change vs previous month.", examples=["300.00"])
    is_new: bool = Field(..., description="True when there was no spend in the previous month.", examples=[False])


class TopCategoriesReport(BaseModel):
    currency_code: str = Field(..., description="Currency scope.", examples=["BRL"])
    month: str = Field(..., description="Requested month (`YYYY-MM`).", examples=["2026-05"])
    prev_month: str = Field(..., description="Previous month used for the delta column.", examples=["2026-04"])
    items: list[TopCategoryItem] = Field(..., description="Top categories ordered by `current` descending.")


class NetWorthTrendCurrency(BaseModel):
    currency: str = Field(..., description="Currency code.", examples=["BRL"])
    net: Decimal = Field(..., description="Net worth in this currency at the bucket date.", examples=["10000.00"])
    converted: Decimal | None = Field(
        None,
        description="Same `net` FX-converted into the report base currency.",
        examples=["1850.00"],
    )


class NetWorthTrendItem(BaseModel):
    period: str = Field(..., description="Bucket label `YYYY-MM`.", examples=["2026-05"])
    by_currency: list[NetWorthTrendCurrency] = Field(..., description="Per-currency breakdown.")
    total_converted: Decimal | None = Field(
        None,
        description="Sum of `converted` across currencies for the bucket.",
        examples=["1850.00"],
    )


class NetWorthTrendReport(BaseModel):
    convert_to: str = Field(..., description="Base currency for FX conversion.", examples=["USD"])
    from_date: date = Field(..., description="Inclusive lower bound.")
    to_date: date = Field(..., description="Inclusive upper bound.")
    items: list[NetWorthTrendItem] = Field(..., description="One entry per month in the window.")


class FinancialHealthReport(BaseModel):
    as_of: date = Field(..., description="Snapshot date.", examples=["2026-05-25"])
    month_start: date = Field(..., description="First day of the month containing `as_of`.", examples=["2026-05-01"])
    month_end: date = Field(..., description="Last day of the month containing `as_of`.", examples=["2026-05-31"])
    convert_to: str = Field(..., description="Base currency used to normalize all monetary fields.", examples=["USD"])
    incoming_month: Decimal = Field(..., description="Total income posted in the current month.", examples=["5000.00"])
    outgoing_month: Decimal = Field(..., description="Total expense posted in the current month.", examples=["3200.00"])
    pending_payables_month: Decimal = Field(
        ...,
        description="Outstanding payables due in the current month.",
        examples=["800.00"],
    )
    total_investments: Decimal = Field(..., description="Sum of investment positions.", examples=["20000.00"])
    total_health: Decimal = Field(
        ...,
        description=(
            "Composite financial-health figure: `incoming_month - outgoing_month - "
            "pending_payables_month + total_investments` (all converted to `convert_to`)."
        ),
        examples=["21000.00"],
    )

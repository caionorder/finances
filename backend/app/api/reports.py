from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import User
from app.schemas.report import (
    AgingReport,
    BurnRateReport,
    ByCategoryReport,
    CashflowReport,
    CurrencyExposureReport,
    FinancialHealthReport,
    ForecastVsActualReport,
    NetWorthReport,
    NetWorthTrendReport,
    RunwayReport,
    SavingsRateReport,
    TopCategoriesReport,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/cashflow",
    response_model=CashflowReport,
    summary="Cashflow time-series (income/expense/net) bucketed by period",
    description=(
        "Aggregates income and expenses on accounts the caller can see, bucketed by `day`, "
        "`week` or `month` over a date range. Returns one point per bucket with `income`, "
        "`expense` and `net = income - expense`.\n\n"
        "Filters by a **single currency** — cross-currency callers should aggregate "
        "per-currency in the client or use FX-aware reports.\n\n"
        "**Visibility**: respects per-account ACL."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (invalid currency length, malformed dates, ...)."},
    },
)
def cashflow(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(
        ...,
        min_length=3,
        max_length=3,
        description="ISO-like 3-letter currency code (`BRL`, `USD`, `PYG`).",
    ),
    from_date: date = Query(
        ...,
        alias="from",
        description="Inclusive lower bound on transaction date (ISO YYYY-MM-DD).",
    ),
    to_date: date = Query(
        ...,
        alias="to",
        description="Inclusive upper bound on transaction date (ISO YYYY-MM-DD).",
    ),
    group_by: str = Query(
        "month",
        pattern="^(month|week|day)$",
        description="Bucket granularity: `month` (default), `week` or `day`.",
    ),
) -> CashflowReport:
    return report_service.cashflow(db, user, currency, from_date, to_date, group_by)


@router.get(
    "/by-category",
    response_model=ByCategoryReport,
    summary="Spending or income breakdown by category",
    description=(
        "Returns totals per category over the date range, restricted to a single currency and "
        "a single transaction `kind` (`income` or `expense`). Drives donut/pie charts on the "
        "dashboard."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error."},
    },
)
def by_category(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(..., min_length=3, max_length=3, description="ISO 3-letter currency code."),
    from_date: date = Query(..., alias="from", description="Inclusive lower bound (ISO YYYY-MM-DD)."),
    to_date: date = Query(..., alias="to", description="Inclusive upper bound (ISO YYYY-MM-DD)."),
    kind: str = Query(
        "expense",
        pattern="^(income|expense)$",
        description="Restrict to `income` or `expense`. Defaults to `expense`.",
    ),
) -> ByCategoryReport:
    return report_service.by_category(db, user, currency, from_date, to_date, kind)


@router.get(
    "/forecast-vs-actual",
    response_model=ForecastVsActualReport,
    summary="Compare forecast (from payables/receivables) against booked transactions",
    description=(
        "For each month in the range, returns:\n\n"
        "* `forecast_income` / `forecast_expense` — sum of receivables and payables that were "
        "scheduled to land in that month.\n"
        "* `actual_income` / `actual_expense` — sum of transactions that actually posted.\n"
        "* `variance` — actual minus forecast.\n\n"
        "Useful to detect budget drift and to validate recurrence configuration."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error."},
    },
)
def forecast_vs_actual(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(..., min_length=3, max_length=3, description="ISO 3-letter currency code."),
    from_date: date = Query(..., alias="from", description="Inclusive lower bound (ISO YYYY-MM-DD)."),
    to_date: date = Query(..., alias="to", description="Inclusive upper bound (ISO YYYY-MM-DD)."),
) -> ForecastVsActualReport:
    return report_service.forecast_vs_actual(db, user, currency, from_date, to_date)


@router.get(
    "/net-worth",
    response_model=NetWorthReport,
    summary="Net worth snapshot across all accounts as of a date",
    description=(
        "Returns the **sum of balances** across every account visible to the caller as of "
        "`as_of`. Each currency contributes a separate line; if `convert_to` is supplied, "
        "all lines are FX-converted into that currency using the latest available rate.\n\n"
        "**Visibility**: respects per-account ACL."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def net_worth(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    as_of: date | None = Query(
        None,
        description="Snapshot date (ISO YYYY-MM-DD). Defaults to today.",
    ),
    include_archived: bool = Query(
        False,
        description="Include archived accounts in the snapshot (default: false).",
    ),
    convert_to: str | None = Query(
        None,
        max_length=10,
        description="Optional target currency to FX-convert every line into (e.g. `USD`).",
    ),
) -> NetWorthReport:
    return report_service.net_worth(
        db, user, as_of or date.today(), include_archived, convert_to
    )


# ---------------------------------------------------------------------------
# BI Reports — Sprint 2 quick wins
# ---------------------------------------------------------------------------


@router.get(
    "/payables-aging",
    response_model=AgingReport,
    summary="Payables aging buckets (current, 30, 60, 90+ days overdue)",
    description=(
        "Classifies open payables into aging buckets relative to `as_of` (defaults to today). "
        "Standard buckets: `current`, `1-30`, `31-60`, `61-90`, `over_90`.\n\n"
        "Useful to spotlight cash-flow pressure points and prioritize collections/payments."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def payables_aging(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to aggregate (e.g. `BRL`)."),
    as_of: date | None = Query(None, description="Reference date for the aging snapshot. Defaults to today."),
) -> AgingReport:
    return report_service.payables_aging(db, user, currency_code, as_of)


@router.get(
    "/receivables-aging",
    response_model=AgingReport,
    summary="Receivables aging buckets (current, 30, 60, 90+ days overdue)",
    description=(
        "Same shape as `/payables-aging`, but for money expected to come in. Highlights "
        "slow-paying clients/sources."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def receivables_aging(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to aggregate."),
    as_of: date | None = Query(None, description="Reference date for the aging snapshot. Defaults to today."),
) -> AgingReport:
    return report_service.receivables_aging(db, user, currency_code, as_of)


@router.get(
    "/burn-rate",
    response_model=BurnRateReport,
    summary="Monthly burn rate (average net cash outflow)",
    description=(
        "Computes the trailing average net cash outflow per month — a proxy for how fast "
        "balances are being consumed. Drives the runway/budget BI panel."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def burn_rate(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to aggregate."),
    as_of: date | None = Query(None, description="Reference date. Defaults to today."),
) -> BurnRateReport:
    return report_service.burn_rate(db, user, currency_code, as_of)


@router.get(
    "/savings-rate",
    response_model=SavingsRateReport,
    summary="Savings rate over a date range (savings / income)",
    description=(
        "Computes the savings rate as `(income - expense) / income` over the window. Returns "
        "both the absolute net and the percentage."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def savings_rate(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to aggregate."),
    from_date: date = Query(..., alias="from", description="Inclusive lower bound (ISO YYYY-MM-DD)."),
    to_date: date = Query(..., alias="to", description="Inclusive upper bound (ISO YYYY-MM-DD)."),
) -> SavingsRateReport:
    return report_service.savings_rate(db, user, currency_code, from_date, to_date)


@router.get(
    "/runway",
    response_model=RunwayReport,
    summary="Cash runway in months given current balance and burn rate",
    description=(
        "Estimates how many months of runway remain, based on current balance and the "
        "trailing burn rate. Flags whether the runway meets the `target_months` goal — "
        "useful to gate a stoplight tile on the dashboard."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def runway(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to evaluate."),
    target_months: int = Query(6, ge=1, le=120, description="Desired runway target in months (1-120)."),
    as_of: date | None = Query(None, description="Reference date. Defaults to today."),
) -> RunwayReport:
    return report_service.runway(db, user, currency_code, target_months, as_of)


@router.get(
    "/currency-exposure",
    response_model=CurrencyExposureReport,
    summary="Net asset exposure per currency, FX-converted to a base currency",
    description=(
        "Returns the share of total net worth held in each currency, converted into a single "
        "base currency (`convert_to`, defaults to USD) using the latest FX rates. Powers a "
        "currency-mix pie chart and FX-risk warnings."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def currency_exposure(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    convert_to: str = Query("USD", min_length=3, max_length=10, description="Base currency for the conversion (default `USD`)."),
    as_of: date | None = Query(None, description="Reference date. Defaults to today."),
) -> CurrencyExposureReport:
    return report_service.currency_exposure(db, user, convert_to, as_of)


@router.get(
    "/top-categories",
    response_model=TopCategoriesReport,
    summary="Top-N spending categories for a calendar month",
    description=(
        "Returns the top `top_n` expense categories for the month given by `month` "
        "(`YYYY-MM`). Drives the **\"Onde está o dinheiro?\"** widget."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        422: {"description": "Validation error (malformed month)."},
    },
)
def top_categories(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10, description="Currency to aggregate."),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Calendar month in `YYYY-MM` form (e.g. `2026-05`)."),
    top_n: int = Query(10, ge=1, le=100, description="Number of top categories to return (1-100)."),
) -> TopCategoriesReport:
    return report_service.top_categories(db, user, currency_code, month, top_n)


@router.get(
    "/net-worth-trend",
    response_model=NetWorthTrendReport,
    summary="Net-worth time series, FX-converted to a single currency",
    description=(
        "Returns one point per month between `from` and `to` with the net worth FX-converted "
        "into `convert_to`. Powers the long-term net-worth chart."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def net_worth_trend(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date = Query(..., alias="from", description="Inclusive lower bound (ISO YYYY-MM-DD)."),
    to_date: date = Query(..., alias="to", description="Inclusive upper bound (ISO YYYY-MM-DD)."),
    convert_to: str = Query("USD", min_length=3, max_length=10, description="Target currency to FX-convert each point into."),
) -> NetWorthTrendReport:
    return report_service.net_worth_trend(db, user, from_date, to_date, convert_to)


@router.get(
    "/financial-health",
    response_model=FinancialHealthReport,
    summary="Composite financial-health score with sub-component breakdown",
    description=(
        "Returns a single 0-100 score summarizing financial health, derived from sub-signals "
        "such as runway, savings rate, debt ratio, currency diversification and "
        "income/expense volatility. Each sub-component is returned alongside the headline "
        "score so the UI can explain the rating to the user.\n\n"
        "Drives the **\"Saúde Financeira\"** dashboard card."
    ),
    responses={401: {"description": "Missing or invalid access token."}},
)
def financial_health(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    as_of: date | None = Query(None, description="Reference date for the snapshot. Defaults to today."),
    convert_to: str = Query("USD", min_length=3, max_length=10, description="Base currency to normalize all sub-signals (default `USD`)."),
) -> FinancialHealthReport:
    return report_service.financial_health(db, user, as_of, convert_to)

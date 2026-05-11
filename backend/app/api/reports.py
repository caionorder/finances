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
    ForecastVsActualReport,
    NetWorthReport,
    NetWorthTrendReport,
    RunwayReport,
    SavingsRateReport,
    TopCategoriesReport,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/cashflow", response_model=CashflowReport)
def cashflow(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(..., min_length=3, max_length=3),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    group_by: str = Query("month", pattern="^(month|week|day)$"),
) -> CashflowReport:
    return report_service.cashflow(db, user, currency, from_date, to_date, group_by)


@router.get("/by-category", response_model=ByCategoryReport)
def by_category(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(..., min_length=3, max_length=3),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    kind: str = Query("expense", pattern="^(income|expense)$"),
) -> ByCategoryReport:
    return report_service.by_category(db, user, currency, from_date, to_date, kind)


@router.get("/forecast-vs-actual", response_model=ForecastVsActualReport)
def forecast_vs_actual(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: str = Query(..., min_length=3, max_length=3),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
) -> ForecastVsActualReport:
    return report_service.forecast_vs_actual(db, user, currency, from_date, to_date)


@router.get("/net-worth", response_model=NetWorthReport)
def net_worth(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    as_of: date | None = None,
    include_archived: bool = False,
    convert_to: str | None = Query(None, max_length=10),
) -> NetWorthReport:
    return report_service.net_worth(
        db, user, as_of or date.today(), include_archived, convert_to
    )


# ---------------------------------------------------------------------------
# BI Reports — Sprint 2 quick wins
# ---------------------------------------------------------------------------


@router.get("/payables-aging", response_model=AgingReport)
def payables_aging(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    as_of: date | None = None,
) -> AgingReport:
    return report_service.payables_aging(db, user, currency_code, as_of)


@router.get("/receivables-aging", response_model=AgingReport)
def receivables_aging(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    as_of: date | None = None,
) -> AgingReport:
    return report_service.receivables_aging(db, user, currency_code, as_of)


@router.get("/burn-rate", response_model=BurnRateReport)
def burn_rate(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    as_of: date | None = None,
) -> BurnRateReport:
    return report_service.burn_rate(db, user, currency_code, as_of)


@router.get("/savings-rate", response_model=SavingsRateReport)
def savings_rate(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
) -> SavingsRateReport:
    return report_service.savings_rate(db, user, currency_code, from_date, to_date)


@router.get("/runway", response_model=RunwayReport)
def runway(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    target_months: int = Query(6, ge=1, le=120),
    as_of: date | None = None,
) -> RunwayReport:
    return report_service.runway(db, user, currency_code, target_months, as_of)


@router.get("/currency-exposure", response_model=CurrencyExposureReport)
def currency_exposure(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    convert_to: str = Query("USD", min_length=3, max_length=10),
    as_of: date | None = None,
) -> CurrencyExposureReport:
    return report_service.currency_exposure(db, user, convert_to, as_of)


@router.get("/top-categories", response_model=TopCategoriesReport)
def top_categories(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency_code: str = Query(..., min_length=3, max_length=10),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    top_n: int = Query(10, ge=1, le=100),
) -> TopCategoriesReport:
    return report_service.top_categories(db, user, currency_code, month, top_n)


@router.get("/net-worth-trend", response_model=NetWorthTrendReport)
def net_worth_trend(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    convert_to: str = Query("USD", min_length=3, max_length=10),
) -> NetWorthTrendReport:
    return report_service.net_worth_trend(db, user, from_date, to_date, convert_to)

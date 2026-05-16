from __future__ import annotations

import logging
from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountAcl,
    Category,
    CreditCard,
    CreditCardAcl,
    CreditCardCycle,
    CreditCardPurchase,
    Investment,
    Payable,
    PayablePayment,
    Receivable,
    Transaction,
    User,
)
from app.models.enums import CycleStatus, TransactionKind, UserRole
from app.schemas.report import (
    AccountBalance,
    AgingBucket,
    AgingReport,
    BurnRateReport,
    ByCategoryReport,
    CashflowBucket,
    CashflowReport,
    CategoryNode,
    CreditCardBalance,
    CurrencyExposureItem,
    CurrencyExposureReport,
    FinancialHealthReport,
    ForecastActualItem,
    ForecastVsActualReport,
    MonthExpense,
    NetWorthByCurrency,
    NetWorthReport,
    NetWorthTrendCurrency,
    NetWorthTrendItem,
    NetWorthTrendReport,
    RunwayReport,
    SavingsItem,
    SavingsRateReport,
    TopCategoriesReport,
    TopCategoryItem,
)

logger = logging.getLogger(__name__)


def _visible_account_ids(db: Session, user: User) -> list[int] | None:
    """Returns list of visible account ids, or None if admin (no filter needed)."""
    if user.role == UserRole.admin:
        return None
    rows = db.execute(
        select(AccountAcl.account_id).where(AccountAcl.user_id == user.id)
    ).all()
    return [r[0] for r in rows]


def _visible_credit_card_ids(db: Session, user: User) -> list[int] | None:
    if user.role == UserRole.admin:
        return None
    rows = db.execute(
        select(CreditCardAcl.credit_card_id).where(CreditCardAcl.user_id == user.id)
    ).all()
    return [r[0] for r in rows]


def _month_iter(start: date, end: date) -> list[str]:
    """Returns list of YYYY-MM strings between start and end (inclusive)."""
    out: list[str] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def cashflow(
    db: Session,
    user: User,
    currency: str,
    from_date: date,
    to_date: date,
    group_by: str,
) -> CashflowReport:
    if group_by == "week":
        period_expr = func.date_format(Transaction.date, "%x-W%v")
    elif group_by == "day":
        period_expr = func.date_format(Transaction.date, "%Y-%m-%d")
    else:
        period_expr = func.date_format(Transaction.date, "%Y-%m")

    income_expr = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0
    )
    expense_expr = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0
    )

    stmt = select(
        period_expr.label("period"),
        income_expr.label("income"),
        expense_expr.label("expense"),
    ).where(
        Transaction.currency_code == currency,
        Transaction.date >= from_date,
        Transaction.date <= to_date,
        Transaction.kind != TransactionKind.transfer,
    )

    visible = _visible_account_ids(db, user)
    if visible is not None:
        if not visible:
            return CashflowReport(
                currency=currency,
                from_date=from_date,
                to_date=to_date,
                group_by=group_by,  # type: ignore[arg-type]
                buckets=[],
                totals=CashflowBucket(
                    period="ALL",
                    income=Decimal("0"),
                    expense=Decimal("0"),
                    net=Decimal("0"),
                ),
            )
        stmt = stmt.where(Transaction.account_id.in_(visible))

    stmt = stmt.group_by("period").order_by("period")
    rows = db.execute(stmt).all()

    buckets: list[CashflowBucket] = []
    total_income = Decimal("0")
    total_expense = Decimal("0")
    for row in rows:
        income = Decimal(row.income or 0)
        expense = Decimal(row.expense or 0)
        total_income += income
        total_expense += expense
        buckets.append(
            CashflowBucket(
                period=row.period,
                income=income,
                expense=expense,
                net=income - expense,
            )
        )

    return CashflowReport(
        currency=currency,
        from_date=from_date,
        to_date=to_date,
        group_by=group_by,  # type: ignore[arg-type]
        buckets=buckets,
        totals=CashflowBucket(
            period="ALL",
            income=total_income,
            expense=total_expense,
            net=total_income - total_expense,
        ),
    )


def by_category(
    db: Session,
    user: User,
    currency: str,
    from_date: date,
    to_date: date,
    kind: str,
) -> ByCategoryReport:
    target_kind = (
        TransactionKind.income if kind == "income" else TransactionKind.expense
    )
    sum_expr = func.coalesce(func.sum(func.abs(Transaction.amount)), 0)

    stmt = select(Transaction.category_id, sum_expr.label("total")).where(
        Transaction.currency_code == currency,
        Transaction.date >= from_date,
        Transaction.date <= to_date,
        Transaction.kind == target_kind,
    )

    visible = _visible_account_ids(db, user)
    if visible is not None:
        if not visible:
            return ByCategoryReport(
                currency=currency,
                from_date=from_date,
                to_date=to_date,
                kind=kind,  # type: ignore[arg-type]
                total=Decimal("0"),
                nodes=[],
            )
        stmt = stmt.where(Transaction.account_id.in_(visible))

    stmt = stmt.group_by(Transaction.category_id)
    rows = db.execute(stmt).all()

    own_total_by_cat: dict[int | None, Decimal] = {}
    grand_total = Decimal("0")
    for row in rows:
        amount = Decimal(row.total or 0)
        own_total_by_cat[row.category_id] = amount
        grand_total += amount

    cats = list(db.execute(select(Category)).scalars().all())
    cat_by_id: dict[int, Category] = {c.id: c for c in cats}
    children_of: dict[int | None, list[Category]] = defaultdict(list)
    for c in cats:
        children_of[c.parent_id].append(c)
    for parent_id in children_of:
        children_of[parent_id].sort(key=lambda c: (c.sort_order, c.name))

    def build(cat: Category) -> CategoryNode:
        own = own_total_by_cat.get(cat.id, Decimal("0"))
        children_nodes: list[CategoryNode] = []
        subtree = own
        for child in children_of.get(cat.id, []):
            child_node = build(child)
            subtree += child_node.subtree_total
            children_nodes.append(child_node)
        return CategoryNode(
            category_id=cat.id,
            name=cat.name,
            color=cat.color,
            icon=cat.icon,
            own_total=own,
            subtree_total=subtree,
            children=children_nodes,
        )

    nodes: list[CategoryNode] = []
    for root in children_of.get(None, []):
        node = build(root)
        if node.subtree_total > 0:
            nodes.append(node)

    if None in own_total_by_cat and own_total_by_cat[None] > 0:
        uncategorized = own_total_by_cat[None]
        nodes.append(
            CategoryNode(
                category_id=None,
                name="Sem categoria",
                color=None,
                icon=None,
                own_total=uncategorized,
                subtree_total=uncategorized,
                children=[],
            )
        )

    return ByCategoryReport(
        currency=currency,
        from_date=from_date,
        to_date=to_date,
        kind=kind,  # type: ignore[arg-type]
        total=grand_total,
        nodes=nodes,
    )


def forecast_vs_actual(
    db: Session,
    user: User,
    currency: str,
    from_date: date,
    to_date: date,
) -> ForecastVsActualReport:
    months = _month_iter(from_date, to_date)
    if not months:
        return ForecastVsActualReport(
            currency=currency,
            from_date=from_date,
            to_date=to_date,
            items=[],
        )

    visible = _visible_account_ids(db, user)
    if visible is not None and not visible:
        return ForecastVsActualReport(
            currency=currency,
            from_date=from_date,
            to_date=to_date,
            items=[
                ForecastActualItem(
                    period=m,
                    forecast_in=Decimal("0"),
                    actual_in=Decimal("0"),
                    forecast_out=Decimal("0"),
                    actual_out=Decimal("0"),
                )
                for m in months
            ],
        )

    forecast_in: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    forecast_out: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    actual_in: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    actual_out: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    rec_stmt = (
        select(
            func.date_format(Receivable.due_date, "%Y-%m").label("period"),
            func.coalesce(func.sum(Receivable.amount), 0).label("total"),
        )
        .where(
            Receivable.currency_code == currency,
            Receivable.due_date >= from_date,
            Receivable.due_date <= to_date,
            Receivable.received_at.is_(None),
        )
        .group_by("period")
    )
    if visible is not None:
        rec_stmt = rec_stmt.where(Receivable.account_id.in_(visible))
    for row in db.execute(rec_stmt).all():
        forecast_in[row.period] = Decimal(row.total or 0)

    pay_stmt = (
        select(
            func.date_format(Payable.due_date, "%Y-%m").label("period"),
            func.coalesce(
                func.sum(Payable.amount - Payable.paid_amount), 0
            ).label("total"),
        )
        .where(
            Payable.currency_code == currency,
            Payable.due_date >= from_date,
            Payable.due_date <= to_date,
            Payable.paid_amount < Payable.amount,
        )
        .group_by("period")
    )
    if visible is not None:
        pay_stmt = pay_stmt.where(Payable.account_id.in_(visible))
    for row in db.execute(pay_stmt).all():
        forecast_out[row.period] = Decimal(row.total or 0)

    in_stmt = (
        select(
            func.date_format(Transaction.date, "%Y-%m").label("period"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .where(
            Transaction.currency_code == currency,
            Transaction.date >= from_date,
            Transaction.date <= to_date,
            Transaction.kind == TransactionKind.income,
            Transaction.amount > 0,
        )
        .group_by("period")
    )
    if visible is not None:
        in_stmt = in_stmt.where(Transaction.account_id.in_(visible))
    for row in db.execute(in_stmt).all():
        actual_in[row.period] = Decimal(row.total or 0)

    out_stmt = (
        select(
            func.date_format(Transaction.date, "%Y-%m").label("period"),
            func.coalesce(func.sum(-Transaction.amount), 0).label("total"),
        )
        .where(
            Transaction.currency_code == currency,
            Transaction.date >= from_date,
            Transaction.date <= to_date,
            Transaction.kind == TransactionKind.expense,
            Transaction.amount < 0,
        )
        .group_by("period")
    )
    if visible is not None:
        out_stmt = out_stmt.where(Transaction.account_id.in_(visible))
    for row in db.execute(out_stmt).all():
        actual_out[row.period] = Decimal(row.total or 0)

    items = [
        ForecastActualItem(
            period=m,
            forecast_in=forecast_in.get(m, Decimal("0")),
            actual_in=actual_in.get(m, Decimal("0")),
            forecast_out=forecast_out.get(m, Decimal("0")),
            actual_out=actual_out.get(m, Decimal("0")),
        )
        for m in months
    ]

    return ForecastVsActualReport(
        currency=currency,
        from_date=from_date,
        to_date=to_date,
        items=items,
    )


def net_worth(
    db: Session,
    user: User,
    as_of: date,
    include_archived: bool,
    convert_to: str | None = None,
) -> NetWorthReport:
    acc_stmt = select(Account)
    if not include_archived:
        acc_stmt = acc_stmt.where(Account.is_archived.is_(False))
    if user.role != UserRole.admin:
        acc_stmt = acc_stmt.join(
            AccountAcl,
            (AccountAcl.account_id == Account.id) & (AccountAcl.user_id == user.id),
        )
    accounts = list(db.execute(acc_stmt.order_by(Account.id)).scalars().all())

    movements_by_account: dict[int, Decimal] = {}
    if accounts:
        acc_ids = [a.id for a in accounts]
        rows = db.execute(
            select(
                Transaction.account_id,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .where(
                Transaction.account_id.in_(acc_ids),
                Transaction.date <= as_of,
            )
            .group_by(Transaction.account_id)
        ).all()
        movements_by_account = {row[0]: Decimal(row[1] or 0) for row in rows}

    card_stmt = select(CreditCard)
    if not include_archived:
        card_stmt = card_stmt.where(CreditCard.is_archived.is_(False))
    if user.role != UserRole.admin:
        card_stmt = card_stmt.join(
            CreditCardAcl,
            (CreditCardAcl.credit_card_id == CreditCard.id)
            & (CreditCardAcl.user_id == user.id),
        )
    cards = list(db.execute(card_stmt.order_by(CreditCard.id)).scalars().all())

    cycle_total_by_card: dict[int, Decimal] = {}
    if cards:
        card_ids = [c.id for c in cards]
        cycles = list(
            db.execute(
                select(CreditCardCycle).where(
                    CreditCardCycle.credit_card_id.in_(card_ids),
                    CreditCardCycle.period_start <= as_of,
                    CreditCardCycle.period_end >= as_of,
                    CreditCardCycle.status == CycleStatus.open,
                )
            )
            .scalars()
            .all()
        )
        cycle_id_to_card = {cy.id: cy.credit_card_id for cy in cycles}
        if cycles:
            sum_rows = db.execute(
                select(
                    CreditCardPurchase.billing_cycle_id,
                    func.coalesce(func.sum(CreditCardPurchase.amount), 0),
                )
                .where(CreditCardPurchase.billing_cycle_id.in_(list(cycle_id_to_card.keys())))
                .group_by(CreditCardPurchase.billing_cycle_id)
            ).all()
            for row in sum_rows:
                card_id = cycle_id_to_card.get(row[0])
                if card_id is not None:
                    cycle_total_by_card[card_id] = Decimal(row[1] or 0)

    grouped: dict[str, dict] = {}

    def slot(currency: str) -> dict:
        if currency not in grouped:
            grouped[currency] = {
                "accounts_total": Decimal("0"),
                "credit_cards_total": Decimal("0"),
                "accounts": [],
                "credit_cards": [],
            }
        return grouped[currency]

    for acc in accounts:
        balance = (acc.opening_balance or Decimal("0")) + movements_by_account.get(
            acc.id, Decimal("0")
        )
        s = slot(acc.currency_code)
        s["accounts_total"] += balance
        s["accounts"].append(
            AccountBalance(
                account_id=acc.id,
                name=acc.name,
                type=acc.type.value if hasattr(acc.type, "value") else str(acc.type),
                balance=balance,
            )
        )

    for card in cards:
        cycle_total = cycle_total_by_card.get(card.id, Decimal("0"))
        avail = (
            card.limit_amount - cycle_total if card.limit_amount is not None else None
        )
        s = slot(card.currency_code)
        s["credit_cards_total"] += cycle_total
        s["credit_cards"].append(
            CreditCardBalance(
                credit_card_id=card.id,
                name=card.name,
                cycle_total=cycle_total,
                available_credit=avail,
            )
        )

    by_currency = [
        NetWorthByCurrency(
            currency=cur,
            accounts_total=data["accounts_total"],
            credit_cards_total=data["credit_cards_total"],
            net=data["accounts_total"] - data["credit_cards_total"],
            accounts=data["accounts"],
            credit_cards=data["credit_cards"],
        )
        for cur, data in sorted(grouped.items())
    ]

    total_converted: Decimal | None = None
    converted_to_code: str | None = None
    if convert_to:
        from app.services import fx_service

        converted_to_code = convert_to.upper()
        accum = Decimal("0")
        any_converted = False
        for entry in by_currency:
            rate = fx_service.get_latest_rate(db, entry.currency, converted_to_code)
            if rate is None:
                continue
            accum += entry.net * rate
            any_converted = True
        total_converted = accum if any_converted else None

    return NetWorthReport(
        as_of=as_of,
        by_currency=by_currency,
        converted_to=converted_to_code,
        total_converted=total_converted,
    )


# ---------------------------------------------------------------------------
# BI helpers
# ---------------------------------------------------------------------------


def _end_of_month(d: date) -> date:
    last = monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last)


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _shift_months(d: date, delta: int) -> date:
    idx = d.month - 1 + delta
    year = d.year + idx // 12
    month = idx % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _month_label(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _payable_visibility_predicate(user: User, visible: list[int] | None):
    """Returns a SQL predicate (or None) restricting Payables for non-admin users.

    Mirrors the live policy in payable_service: created_by user OR account_id in ACL set.
    """
    if user.role == UserRole.admin:
        return None
    if visible:
        return or_(
            Payable.created_by_user_id == user.id,
            Payable.account_id.in_(visible),
        )
    return Payable.created_by_user_id == user.id


def _receivable_visibility_predicate(user: User, visible: list[int] | None):
    if user.role == UserRole.admin:
        return None
    if visible:
        return or_(
            Receivable.created_by_user_id == user.id,
            Receivable.account_id.in_(visible),
        )
    return Receivable.created_by_user_id == user.id


# ---------------------------------------------------------------------------
# Aging — payables + receivables
# ---------------------------------------------------------------------------


def payables_aging(
    db: Session,
    user: User,
    currency_code: str,
    as_of: date | None = None,
) -> AgingReport:
    today = as_of or date.today()
    diff = func.datediff(Payable.due_date, today)
    remaining = Payable.amount - Payable.paid_amount

    bucket_expr = case(
        (diff < 0, "overdue"),
        (diff == 0, "due_today"),
        (diff <= 7, "1_7"),
        (diff <= 14, "8_14"),
        (diff <= 30, "15_30"),
        else_="30_plus",
    ).label("bucket")

    stmt = (
        select(
            bucket_expr,
            func.count().label("count"),
            func.coalesce(func.sum(remaining), 0).label("total"),
        )
        .where(
            Payable.paid_amount < Payable.amount,
            Payable.currency_code == currency_code,
        )
        .group_by(bucket_expr)
    )

    visible = _visible_account_ids(db, user)
    pred = _payable_visibility_predicate(user, visible)
    if pred is not None:
        stmt = stmt.where(pred)

    rows = db.execute(stmt).all()
    buckets: dict[str, AgingBucket] = {
        k: AgingBucket(count=0, total_remaining=Decimal("0"))
        for k in ("overdue", "due_today", "1_7", "8_14", "15_30", "30_plus")
    }
    grand_total = Decimal("0")
    grand_count = 0
    for row in rows:
        total = Decimal(row.total or 0)
        count = int(row.count or 0)
        bucket = str(row.bucket)
        if bucket in buckets:
            buckets[bucket] = AgingBucket(count=count, total_remaining=total)
        grand_total += total
        grand_count += count

    return AgingReport(
        currency_code=currency_code,
        as_of=today,
        buckets=buckets,
        grand_total_remaining=grand_total,
        grand_count=grand_count,
    )


def receivables_aging(
    db: Session,
    user: User,
    currency_code: str,
    as_of: date | None = None,
) -> AgingReport:
    today = as_of or date.today()
    diff = func.datediff(Receivable.due_date, today)

    bucket_expr = case(
        (diff < 0, "overdue"),
        (diff == 0, "due_today"),
        (diff <= 7, "1_7"),
        (diff <= 14, "8_14"),
        (diff <= 30, "15_30"),
        else_="30_plus",
    ).label("bucket")

    stmt = (
        select(
            bucket_expr,
            func.count().label("count"),
            func.coalesce(func.sum(Receivable.amount), 0).label("total"),
        )
        .where(
            Receivable.received_at.is_(None),
            Receivable.currency_code == currency_code,
        )
        .group_by(bucket_expr)
    )

    visible = _visible_account_ids(db, user)
    pred = _receivable_visibility_predicate(user, visible)
    if pred is not None:
        stmt = stmt.where(pred)

    rows = db.execute(stmt).all()
    buckets: dict[str, AgingBucket] = {
        k: AgingBucket(count=0, total_remaining=Decimal("0"))
        for k in ("overdue", "due_today", "1_7", "8_14", "15_30", "30_plus")
    }
    grand_total = Decimal("0")
    grand_count = 0
    for row in rows:
        total = Decimal(row.total or 0)
        count = int(row.count or 0)
        bucket = str(row.bucket)
        if bucket in buckets:
            buckets[bucket] = AgingBucket(count=count, total_remaining=total)
        grand_total += total
        grand_count += count

    return AgingReport(
        currency_code=currency_code,
        as_of=today,
        buckets=buckets,
        grand_total_remaining=grand_total,
        grand_count=grand_count,
    )


# ---------------------------------------------------------------------------
# Burn rate
# ---------------------------------------------------------------------------


def _expense_by_month(
    db: Session,
    user: User,
    currency_code: str,
    from_month: date,
    to_month: date,
) -> dict[str, Decimal]:
    """Returns expense (positive Decimal) per YYYY-MM for the requested window."""
    expense_expr = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0
    )
    period_expr = func.date_format(Transaction.date, "%Y-%m").label("period")

    stmt = (
        select(period_expr, expense_expr.label("expense"))
        .where(
            Transaction.currency_code == currency_code,
            Transaction.date >= _month_start(from_month),
            Transaction.date <= _end_of_month(to_month),
            Transaction.kind != TransactionKind.transfer,
        )
        .group_by("period")
    )

    visible = _visible_account_ids(db, user)
    if visible is not None:
        if not visible:
            return {}
        stmt = stmt.where(Transaction.account_id.in_(visible))

    out: dict[str, Decimal] = {}
    for row in db.execute(stmt).all():
        out[row.period] = Decimal(row.expense or 0)
    return out


def burn_rate(
    db: Session,
    user: User,
    currency_code: str,
    as_of: date | None = None,
) -> BurnRateReport:
    today = as_of or date.today()
    start = _shift_months(today, -11)
    months_by_month = _month_iter(start, today)

    series = _expense_by_month(db, user, currency_code, start, today)
    by_month = [
        MonthExpense(period=m, expense=series.get(m, Decimal("0")))
        for m in months_by_month
    ]

    def _avg(last_n: int) -> Decimal:
        window = by_month[-last_n:] if last_n <= len(by_month) else by_month
        if not window:
            return Decimal("0")
        total = sum((m.expense for m in window), Decimal("0"))
        return (total / Decimal(len(window))).quantize(Decimal("0.0001"))

    return BurnRateReport(
        currency_code=currency_code,
        as_of=today,
        burn_3m=_avg(3),
        burn_6m=_avg(6),
        burn_12m=_avg(12),
        by_month=by_month,
    )


# ---------------------------------------------------------------------------
# Savings rate
# ---------------------------------------------------------------------------


def savings_rate(
    db: Session,
    user: User,
    currency_code: str,
    from_date: date,
    to_date: date,
) -> SavingsRateReport:
    income_expr = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0
    )
    expense_expr = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0
    )
    period_expr = func.date_format(Transaction.date, "%Y-%m").label("period")

    stmt = (
        select(
            period_expr,
            income_expr.label("income"),
            expense_expr.label("expense"),
        )
        .where(
            Transaction.currency_code == currency_code,
            Transaction.date >= from_date,
            Transaction.date <= to_date,
            Transaction.kind != TransactionKind.transfer,
        )
        .group_by("period")
        .order_by("period")
    )

    visible = _visible_account_ids(db, user)
    if visible is not None:
        if not visible:
            return SavingsRateReport(
                currency_code=currency_code,
                from_date=from_date,
                to_date=to_date,
                items=[],
                avg_3m=None,
                avg_12m=None,
            )
        stmt = stmt.where(Transaction.account_id.in_(visible))

    months = _month_iter(from_date, to_date)
    by_period: dict[str, tuple[Decimal, Decimal]] = {}
    for row in db.execute(stmt).all():
        by_period[row.period] = (
            Decimal(row.income or 0),
            Decimal(row.expense or 0),
        )

    items: list[SavingsItem] = []
    valid_rates: list[Decimal] = []
    for m in months:
        income, expense = by_period.get(m, (Decimal("0"), Decimal("0")))
        rate: Decimal | None = None
        if income > 0:
            rate = ((income - expense) / income).quantize(Decimal("0.0001"))
            valid_rates.append(rate)
        items.append(
            SavingsItem(
                period=m, income=income, expense=expense, savings_rate=rate
            )
        )

    def _avg(window: list[Decimal]) -> Decimal | None:
        if not window:
            return None
        return (sum(window, Decimal("0")) / Decimal(len(window))).quantize(
            Decimal("0.0001")
        )

    return SavingsRateReport(
        currency_code=currency_code,
        from_date=from_date,
        to_date=to_date,
        items=items,
        avg_3m=_avg(valid_rates[-3:]),
        avg_12m=_avg(valid_rates[-12:]),
    )


# ---------------------------------------------------------------------------
# Runway
# ---------------------------------------------------------------------------


def runway(
    db: Session,
    user: User,
    currency_code: str,
    target_months: int = 6,
    as_of: date | None = None,
) -> RunwayReport:
    today = as_of or date.today()
    nw = net_worth(db, user, today, include_archived=False)
    nw_currency = next(
        (entry for entry in nw.by_currency if entry.currency == currency_code), None
    )
    nw_value = nw_currency.net if nw_currency else Decimal("0")

    burn = burn_rate(db, user, currency_code, today)

    def _divide(divisor: Decimal) -> Decimal | None:
        if divisor <= 0:
            return None
        return (nw_value / divisor).quantize(Decimal("0.01"))

    runway_3m = _divide(burn.burn_3m)
    runway_6m = _divide(burn.burn_6m)
    runway_12m = _divide(burn.burn_12m)

    if runway_3m is None:
        report_status: Literal["critical", "warning", "healthy", "unknown"] = "unknown"
    elif runway_3m < Decimal("3"):
        report_status = "critical"
    elif runway_3m < Decimal("6"):
        report_status = "warning"
    else:
        report_status = "healthy"

    return RunwayReport(
        currency_code=currency_code,
        as_of=today,
        net_worth=nw_value,
        burn_3m=burn.burn_3m,
        burn_6m=burn.burn_6m,
        burn_12m=burn.burn_12m,
        runway_months_3m=runway_3m,
        runway_months_6m=runway_6m,
        runway_months_12m=runway_12m,
        target_months=target_months,
        status=report_status,
    )


# ---------------------------------------------------------------------------
# Currency exposure
# ---------------------------------------------------------------------------


def currency_exposure(
    db: Session,
    user: User,
    convert_to: str = "USD",
    as_of: date | None = None,
) -> CurrencyExposureReport:
    from app.services import fx_service

    convert_to_code = convert_to.upper()
    today = as_of or date.today()
    nw = net_worth(db, user, today, include_archived=False)

    raw: list[tuple[str, Decimal, Decimal | None]] = []
    total = Decimal("0")
    for entry in nw.by_currency:
        rate = fx_service.get_latest_rate(db, entry.currency, convert_to_code)
        converted = entry.net * rate if rate is not None else None
        if converted is not None:
            total += converted
        raw.append((entry.currency, entry.net, converted))

    items: list[CurrencyExposureItem] = []
    for currency, net, converted in raw:
        if converted is not None and total > 0:
            pct = (converted / total).quantize(Decimal("0.0001"))
        else:
            pct = None
        items.append(
            CurrencyExposureItem(
                currency=currency, net=net, converted=converted, pct=pct
            )
        )

    return CurrencyExposureReport(
        as_of=today,
        convert_to=convert_to_code,
        total_converted=total,
        items=items,
    )


# ---------------------------------------------------------------------------
# Top categories MoM
# ---------------------------------------------------------------------------


def _parse_month(value: str) -> tuple[date, date]:
    """Returns (month_start, month_end) for a YYYY-MM string."""
    parts = value.split("-")
    if len(parts) != 2:
        raise ValueError(f"invalid month format: {value}")
    year = int(parts[0])
    mo = int(parts[1])
    return date(year, mo, 1), date(year, mo, monthrange(year, mo)[1])


def top_categories(
    db: Session,
    user: User,
    currency_code: str,
    month: str,
    top_n: int = 10,
) -> TopCategoriesReport:
    current_start, current_end = _parse_month(month)
    prev_start = _shift_months(current_start, -1)
    prev_start_date = _month_start(prev_start)
    prev_end = _end_of_month(prev_start)
    prev_label = _month_label(prev_start_date)

    sum_expr = func.coalesce(func.sum(func.abs(Transaction.amount)), 0)

    def _query(start: date, end: date) -> dict[int | None, Decimal]:
        stmt = (
            select(Transaction.category_id, sum_expr.label("total"))
            .where(
                Transaction.currency_code == currency_code,
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.kind == TransactionKind.expense,
            )
            .group_by(Transaction.category_id)
        )
        visible = _visible_account_ids(db, user)
        if visible is not None:
            if not visible:
                return {}
            stmt = stmt.where(Transaction.account_id.in_(visible))
        out: dict[int | None, Decimal] = {}
        for row in db.execute(stmt).all():
            out[row.category_id] = Decimal(row.total or 0)
        return out

    current = _query(current_start, current_end)
    previous = _query(prev_start_date, prev_end)

    category_ids = {cid for cid in current if cid is not None} | {
        cid for cid in previous if cid is not None
    }
    cat_rows = list(
        db.execute(select(Category).where(Category.id.in_(category_ids)))
        .scalars()
        .all()
    ) if category_ids else []
    name_by_id: dict[int, str] = {c.id: c.name for c in cat_rows}

    keys = set(current.keys()) | set(previous.keys())
    items: list[TopCategoryItem] = []
    for cid in keys:
        cur = current.get(cid, Decimal("0"))
        prev = previous.get(cid, Decimal("0"))
        delta_abs = cur - prev
        delta_pct: Decimal | None
        if prev > 0:
            delta_pct = (delta_abs / prev).quantize(Decimal("0.0001"))
        else:
            delta_pct = None
        is_new = prev == 0 and cur > 0
        if cid is None:
            name = "Sem categoria"
        else:
            name = name_by_id.get(cid, f"Categoria {cid}")
        items.append(
            TopCategoryItem(
                category_id=cid,
                name=name,
                current=cur,
                previous=prev,
                delta_pct=delta_pct,
                delta_abs=delta_abs,
                is_new=is_new,
            )
        )
    items.sort(key=lambda x: x.current, reverse=True)
    items = items[:top_n]

    return TopCategoriesReport(
        currency_code=currency_code,
        month=month,
        prev_month=prev_label,
        items=items,
    )


# ---------------------------------------------------------------------------
# Net worth trend
# ---------------------------------------------------------------------------


def net_worth_trend(
    db: Session,
    user: User,
    from_date: date,
    to_date: date,
    convert_to: str = "USD",
) -> NetWorthTrendReport:
    from app.services import fx_service

    convert_to_code = convert_to.upper()
    months = _month_iter(from_date, to_date)

    items: list[NetWorthTrendItem] = []
    for label in months:
        year, mo = map(int, label.split("-"))
        as_of = _end_of_month(date(year, mo, 1))
        nw = net_worth(db, user, as_of, include_archived=False)
        by_currency: list[NetWorthTrendCurrency] = []
        total: Decimal | None = Decimal("0")
        any_converted = False
        for entry in nw.by_currency:
            rate = fx_service.get_latest_rate(db, entry.currency, convert_to_code)
            converted = entry.net * rate if rate is not None else None
            if converted is not None:
                any_converted = True
                total = (total or Decimal("0")) + converted
            by_currency.append(
                NetWorthTrendCurrency(
                    currency=entry.currency, net=entry.net, converted=converted
                )
            )
        if not any_converted:
            total = None
        items.append(
            NetWorthTrendItem(
                period=label, by_currency=by_currency, total_converted=total
            )
        )

    return NetWorthTrendReport(
        convert_to=convert_to_code,
        from_date=from_date,
        to_date=to_date,
        items=items,
    )


# ---------------------------------------------------------------------------
# Financial health — Home card aggregator
# ---------------------------------------------------------------------------


def _convert_or_warn(
    db: Session, amount: Decimal, from_code: str, to_code: str
) -> Decimal:
    """Best-effort convert. Returns Decimal('0') if no rate; logs warning."""
    if amount == 0:
        return Decimal("0")
    from app.services import fx_service

    rate = fx_service.get_latest_rate(db, from_code, to_code)
    if rate is None:
        logger.warning(
            "financial_health: no fx rate for %s->%s, skipping amount=%s",
            from_code,
            to_code,
            amount,
        )
        return Decimal("0")
    return amount * rate


def financial_health(
    db: Session,
    user: User,
    as_of: date | None = None,
    convert_to: str = "USD",
) -> FinancialHealthReport:
    """Aggregated snapshot for the Home "Financial Health" card.

    All monetary outputs are converted to ``convert_to`` (default USD).
    Sources lacking an FX rate to the target are dropped from the running
    sum (warning logged) rather than failing the whole request.
    """
    from app.services import investment_service

    today = as_of or date.today()
    convert_to_code = convert_to.upper()
    month_start = _month_start(today)
    month_end = _end_of_month(today)

    visible = _visible_account_ids(db, user)
    no_accounts_visible = visible is not None and not visible

    incoming = Decimal("0")
    outgoing = Decimal("0")
    pending = Decimal("0")

    if not no_accounts_visible:
        # incoming (a): realized income transactions in month, per currency
        in_tx_stmt = (
            select(
                Transaction.currency_code,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .where(
                Transaction.date >= month_start,
                Transaction.date <= month_end,
                Transaction.kind == TransactionKind.income,
                Transaction.amount > 0,
            )
            .group_by(Transaction.currency_code)
        )
        if visible is not None:
            in_tx_stmt = in_tx_stmt.where(Transaction.account_id.in_(visible))
        for row in db.execute(in_tx_stmt).all():
            incoming += _convert_or_warn(
                db, Decimal(row.total or 0), row.currency_code, convert_to_code
            )

        # incoming (b): receivables received this month that did NOT spawn a
        # transaction (e.g. no linked account). Avoids double counting since
        # transaction-linked receivables are already covered by branch (a).
        rec_stmt = (
            select(
                Receivable.currency_code,
                func.coalesce(func.sum(Receivable.amount), 0).label("total"),
            )
            .where(
                Receivable.received_at >= month_start,
                Receivable.received_at <= month_end,
                Receivable.transaction_id.is_(None),
            )
            .group_by(Receivable.currency_code)
        )
        rec_pred = _receivable_visibility_predicate(user, visible)
        if rec_pred is not None:
            rec_stmt = rec_stmt.where(rec_pred)
        for row in db.execute(rec_stmt).all():
            incoming += _convert_or_warn(
                db, Decimal(row.total or 0), row.currency_code, convert_to_code
            )

        # outgoing (a): realized expense transactions in month, per currency
        out_tx_stmt = (
            select(
                Transaction.currency_code,
                func.coalesce(func.sum(-Transaction.amount), 0).label("total"),
            )
            .where(
                Transaction.date >= month_start,
                Transaction.date <= month_end,
                Transaction.kind == TransactionKind.expense,
                Transaction.amount < 0,
            )
            .group_by(Transaction.currency_code)
        )
        if visible is not None:
            out_tx_stmt = out_tx_stmt.where(Transaction.account_id.in_(visible))
        for row in db.execute(out_tx_stmt).all():
            outgoing += _convert_or_warn(
                db, Decimal(row.total or 0), row.currency_code, convert_to_code
            )

        # outgoing (b): payable_payments paid this month that did NOT spawn a
        # transaction. Currency comes from the parent Payable.
        pp_stmt = (
            select(
                Payable.currency_code,
                func.coalesce(func.sum(PayablePayment.amount), 0).label("total"),
            )
            .join(Payable, Payable.id == PayablePayment.payable_id)
            .where(
                PayablePayment.paid_at >= month_start,
                PayablePayment.paid_at <= month_end,
                PayablePayment.transaction_id.is_(None),
            )
            .group_by(Payable.currency_code)
        )
        pp_pred = _payable_visibility_predicate(user, visible)
        if pp_pred is not None:
            pp_stmt = pp_stmt.where(pp_pred)
        for row in db.execute(pp_stmt).all():
            outgoing += _convert_or_warn(
                db, Decimal(row.total or 0), row.currency_code, convert_to_code
            )

        # pending payables: due in month, not fully paid — sum remaining
        pending_stmt = (
            select(
                Payable.currency_code,
                func.coalesce(
                    func.sum(Payable.amount - Payable.paid_amount), 0
                ).label("total"),
            )
            .where(
                Payable.due_date >= month_start,
                Payable.due_date <= month_end,
                Payable.paid_amount < Payable.amount,
            )
            .group_by(Payable.currency_code)
        )
        pending_pred = _payable_visibility_predicate(user, visible)
        if pending_pred is not None:
            pending_stmt = pending_stmt.where(pending_pred)
        for row in db.execute(pending_stmt).all():
            pending += _convert_or_warn(
                db, Decimal(row.total or 0), row.currency_code, convert_to_code
            )

    # Investments: sum current_value across positions (non-admins see only own)
    inv_stmt = select(Investment).where(Investment.is_archived.is_(False))
    if user.role != UserRole.admin:
        inv_stmt = inv_stmt.where(Investment.created_by_user_id == user.id)
    investments = list(db.execute(inv_stmt).scalars().all())

    total_investments = Decimal("0")
    for inv in investments:
        pos = investment_service.compute_position(db, inv, today)
        current_value = Decimal(pos["current_value"])
        total_investments += _convert_or_warn(
            db, current_value, inv.currency_code, convert_to_code
        )

    # Net worth (accounts - credit_cards) already converted by net_worth()
    nw = net_worth(db, user, today, include_archived=False, convert_to=convert_to_code)
    nw_converted = nw.total_converted or Decimal("0")
    total_health = nw_converted + total_investments

    q = Decimal("0.01")
    return FinancialHealthReport(
        as_of=today,
        month_start=month_start,
        month_end=month_end,
        convert_to=convert_to_code,
        incoming_month=incoming.quantize(q, rounding=ROUND_HALF_UP),
        outgoing_month=outgoing.quantize(q, rounding=ROUND_HALF_UP),
        pending_payables_month=pending.quantize(q, rounding=ROUND_HALF_UP),
        total_investments=total_investments.quantize(q, rounding=ROUND_HALF_UP),
        total_health=total_health.quantize(q, rounding=ROUND_HALF_UP),
    )


__all__ = [
    "cashflow",
    "by_category",
    "forecast_vs_actual",
    "net_worth",
    "payables_aging",
    "receivables_aging",
    "burn_rate",
    "savings_rate",
    "runway",
    "currency_exposure",
    "top_categories",
    "net_worth_trend",
    "financial_health",
]

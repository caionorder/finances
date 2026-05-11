from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Investment, InvestmentMovement, User
from app.models.enums import MovementType, RatePeriod, UserRole
from app.services import audit_service


_INDEX_ANNUAL: dict[str, Decimal] = {
    "cdi": Decimal("0.12"),
    "selic": Decimal("0.12"),
    "ipca": Decimal("0.04"),
    "igpm": Decimal("0.05"),
}


def _period_str(period) -> str:
    return period.value if hasattr(period, "value") else str(period)


def _kind_str(kind) -> str:
    return kind.value if hasattr(kind, "value") else str(kind)


def _index_str(idx) -> str | None:
    if idx is None:
        return None
    return idx.value if hasattr(idx, "value") else str(idx)


def _mv_type_str(t) -> str:
    return t.value if hasattr(t, "value") else str(t)


def _periods_between(start: date, end: date, period) -> Decimal:
    if end <= start:
        return Decimal("0")
    days = Decimal((end - start).days)
    p = _period_str(period)
    if p == RatePeriod.monthly.value:
        return days / Decimal("30.4375")
    if p == RatePeriod.semiannual.value:
        return days / Decimal("182.625")
    return days / Decimal("365.25")


def _convert_annual_to_period(annual_decimal: Decimal, period) -> Decimal:
    p = _period_str(period)
    if p == RatePeriod.annual.value:
        return annual_decimal
    one = Decimal("1")
    if p == RatePeriod.semiannual.value:
        return (one + annual_decimal) ** (Decimal("1") / Decimal("2")) - one
    return (one + annual_decimal) ** (Decimal("1") / Decimal("12")) - one


def _periodic_rate(inv: Investment) -> Decimal:
    """Taxa periodica em decimal (ex 0.01 = 1%). Considera rate_kind:
    - fixed: rate_value ja eh taxa por periodo
    - percent_of_index: rate_value % * indexador anual hardcoded -> converte pro periodo
    - index_plus: indexador anual + rate_value -> converte pro periodo
    """
    rate = inv.rate_value / Decimal("100")
    kind = _kind_str(inv.rate_kind)
    idx = _index_str(inv.index_ref)
    if kind == "percent_of_index" and idx:
        index_annual = _INDEX_ANNUAL.get(idx, Decimal("0"))
        annual_eq = rate * index_annual
        return _convert_annual_to_period(annual_eq, inv.rate_period)
    if kind == "index_plus" and idx:
        index_annual = _INDEX_ANNUAL.get(idx, Decimal("0"))
        annual_eq = index_annual + rate
        return _convert_annual_to_period(annual_eq, inv.rate_period)
    return rate


def _compound(amount: Decimal, periodic_rate: Decimal, periods: Decimal) -> Decimal:
    if periods == 0:
        return amount
    return amount * ((Decimal("1") + periodic_rate) ** periods)


def compute_position(db: Session, inv: Investment, as_of: date) -> dict:
    if as_of < inv.start_date:
        as_of = inv.start_date

    periodic = _periodic_rate(inv)

    n_periods = _periods_between(inv.start_date, as_of, inv.rate_period)
    current = _compound(inv.principal, periodic, n_periods)

    movements = db.execute(
        select(InvestmentMovement)
        .where(InvestmentMovement.investment_id == inv.id)
        .where(InvestmentMovement.date <= as_of)
        .order_by(InvestmentMovement.date)
    ).scalars().all()

    total_invested = Decimal("0")
    total_withdrawn = Decimal("0")

    for m in movements:
        n = _periods_between(m.date, as_of, inv.rate_period)
        future_value = _compound(m.amount, periodic, n)
        mt = _mv_type_str(m.type)
        if mt == MovementType.deposit.value or mt == MovementType.interest.value:
            current += future_value
            if mt == MovementType.deposit.value:
                total_invested += m.amount
        elif mt == MovementType.withdrawal.value:
            current -= future_value
            total_withdrawn += m.amount

    total_invested_with_principal = inv.principal + total_invested
    net_invested = total_invested_with_principal - total_withdrawn
    gross_gain = current - net_invested
    gain_percent = (
        gross_gain / total_invested_with_principal * Decimal("100")
        if total_invested_with_principal > 0
        else Decimal("0")
    )

    return {
        "investment_id": inv.id,
        "as_of": as_of,
        "principal": inv.principal,
        "total_invested": total_invested_with_principal,
        "total_withdrawn": total_withdrawn,
        "current_value": current.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        "gross_gain": gross_gain.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        "gain_percent": gain_percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "days_elapsed": (as_of - inv.start_date).days,
    }


def compute_projection(db: Session, inv: Investment, until: date) -> list[dict]:
    if until <= inv.start_date:
        return []
    points: list[dict] = []
    cur = inv.start_date.replace(day=1)
    while cur <= until:
        points.append({"date": cur, "value": compute_position(db, inv, cur)["current_value"]})
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)
    points.append({"date": until, "value": compute_position(db, inv, until)["current_value"]})
    return points


def list_investments(db: Session, user: User, include_archived: bool = False) -> list[dict]:
    stmt = select(Investment)
    if not include_archived:
        stmt = stmt.where(Investment.is_archived.is_(False))
    if user.role != UserRole.admin:
        stmt = stmt.where(Investment.created_by_user_id == user.id)
    stmt = stmt.order_by(Investment.id.desc())
    rows = db.execute(stmt).scalars().all()

    out: list[dict] = []
    today = date.today()
    for inv in rows:
        pos = compute_position(db, inv, today)
        out.append({
            "id": inv.id,
            "name": inv.name,
            "type": inv.type,
            "account_id": inv.account_id,
            "currency_code": inv.currency_code,
            "principal": inv.principal,
            "start_date": inv.start_date,
            "maturity_date": inv.maturity_date,
            "rate_value": inv.rate_value,
            "rate_period": inv.rate_period,
            "rate_kind": inv.rate_kind,
            "index_ref": inv.index_ref,
            "liquidity": inv.liquidity,
            "notes": inv.notes,
            "is_archived": inv.is_archived,
            "created_at": inv.created_at,
            "updated_at": inv.updated_at,
            "total_invested": pos["total_invested"],
            "total_withdrawn": pos["total_withdrawn"],
            "current_value": pos["current_value"],
            "gross_gain": pos["gross_gain"],
            "gain_percent": pos["gain_percent"],
        })
    return out


def create(db: Session, payload, user: User) -> Investment:
    if payload.account_id is not None:
        acc = db.get(Account, payload.account_id)
        if not acc:
            raise HTTPException(400, "account not found")
    inv = Investment(
        name=payload.name,
        type=payload.type,
        account_id=payload.account_id,
        currency_code=payload.currency_code,
        principal=payload.principal,
        start_date=payload.start_date,
        maturity_date=payload.maturity_date,
        rate_value=payload.rate_value,
        rate_period=payload.rate_period,
        rate_kind=payload.rate_kind,
        index_ref=payload.index_ref,
        liquidity=payload.liquidity,
        notes=payload.notes,
        is_archived=False,
        created_by_user_id=user.id,
    )
    db.add(inv)
    db.flush()
    audit_service.log_action(
        db, user.id, "create", "Investment", inv.id, payload.model_dump(mode="json")
    )
    db.commit()
    db.refresh(inv)
    return inv


def update(db: Session, inv: Investment, payload, user: User) -> Investment:
    data = payload.model_dump(exclude_unset=True, mode="json")
    for f in (
        "name", "account_id", "maturity_date", "rate_value", "rate_period",
        "rate_kind", "index_ref", "liquidity", "notes", "is_archived",
    ):
        if f in data:
            setattr(inv, f, data[f])
    audit_service.log_action(
        db, user.id if user else None, "update", "Investment", inv.id, data
    )
    db.commit()
    db.refresh(inv)
    return inv


def archive(db: Session, inv: Investment, user: User) -> None:
    inv.is_archived = True
    audit_service.log_action(
        db, user.id if user else None, "archive", "Investment", inv.id, None
    )
    db.commit()


def add_movement(db: Session, inv: Investment, payload, user: User) -> InvestmentMovement:
    mv = InvestmentMovement(
        investment_id=inv.id,
        type=payload.type,
        amount=payload.amount,
        date=payload.date,
        notes=payload.notes,
        created_by_user_id=user.id,
    )
    db.add(mv)
    db.flush()
    audit_service.log_action(
        db, user.id, f"movement_{payload.type}", "Investment", inv.id,
        payload.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(mv)
    return mv


def list_movements(db: Session, inv: Investment) -> list[InvestmentMovement]:
    return list(db.execute(
        select(InvestmentMovement)
        .where(InvestmentMovement.investment_id == inv.id)
        .order_by(InvestmentMovement.date.desc(), InvestmentMovement.id.desc())
    ).scalars().all())


def delete_movement(db: Session, mv: InvestmentMovement, user: User) -> None:
    inv_id = mv.investment_id
    mv_id = mv.id
    db.delete(mv)
    audit_service.log_action(
        db, user.id, "movement_delete", "Investment", inv_id, {"movement_id": mv_id}
    )
    db.commit()

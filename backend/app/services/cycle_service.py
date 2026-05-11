from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CreditCard, CreditCardCycle, CreditCardPurchase
from app.models.enums import CardType, CycleStatus


def _reject_debit(card: CreditCard) -> None:
    if card.card_type == CardType.debit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="debit cards do not have billing cycles",
        )
from app.schemas.credit_card import CycleOut


def _safe_day(year: int, month: int, target_day: int) -> int:
    last = monthrange(year, month)[1]
    return min(target_day, last)


def _add_months(d: date, n: int) -> date:
    month_index = d.month - 1 + n
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = _safe_day(year, month, d.day)
    return date(year, month, day)


def compute_cycle_for_purchase(
    card: CreditCard, purchase_date: date
) -> tuple[date, date, date]:
    closing = card.closing_day
    due = card.due_day

    closing_in_purchase_month = _safe_day(
        purchase_date.year, purchase_date.month, closing
    )

    if purchase_date.day <= closing_in_purchase_month:
        period_end = date(
            purchase_date.year, purchase_date.month, closing_in_purchase_month
        )
    else:
        next_month = _add_months(date(purchase_date.year, purchase_date.month, 1), 1)
        period_end = date(
            next_month.year,
            next_month.month,
            _safe_day(next_month.year, next_month.month, closing),
        )

    prev_first = _add_months(date(period_end.year, period_end.month, 1), -1)
    prev_close = date(
        prev_first.year,
        prev_first.month,
        _safe_day(prev_first.year, prev_first.month, closing),
    )
    period_start = prev_close + timedelta(days=1)

    due_first = _add_months(date(period_end.year, period_end.month, 1), 1)
    due_date = date(
        due_first.year,
        due_first.month,
        _safe_day(due_first.year, due_first.month, due),
    )

    return period_start, period_end, due_date


def ensure_cycle_exists(
    db: Session,
    card_id: int,
    period_start: date,
    period_end: date,
    due_date: date,
) -> CreditCardCycle:
    cycle = (
        db.query(CreditCardCycle)
        .filter_by(credit_card_id=card_id, period_start=period_start)
        .first()
    )
    if cycle is None:
        cycle = CreditCardCycle(
            credit_card_id=card_id,
            period_start=period_start,
            period_end=period_end,
            due_date=due_date,
            total_amount=Decimal("0"),
            status=CycleStatus.open,
        )
        db.add(cycle)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            cycle = (
                db.query(CreditCardCycle)
                .filter_by(credit_card_id=card_id, period_start=period_start)
                .first()
            )
            if cycle is None:
                raise
    if cycle.status == CycleStatus.closed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cycle is already closed; cannot add purchases retroactively",
        )
    return cycle


def _parse_year_month(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(f"{value}-01")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid {field_name}, expected YYYY-MM",
        ) from exc


def list_cycles(
    db: Session,
    card: CreditCard,
    status_filter: CycleStatus | None = None,
    from_month: str | None = None,
    to_month: str | None = None,
) -> list[CycleOut]:
    _reject_debit(card)
    # Adicional: cycles vivem no PAI; totals filtram apenas compras deste filho
    billing_card = _billing_card_for(db, card)
    is_additional = card.parent_card_id is not None

    sums_q = select(
        CreditCardPurchase.billing_cycle_id.label("cycle_id"),
        func.coalesce(func.sum(CreditCardPurchase.amount), 0).label("total"),
        func.count(CreditCardPurchase.id).label("cnt"),
    )
    if is_additional:
        sums_q = sums_q.where(CreditCardPurchase.credit_card_id == card.id)
    sums_subq = sums_q.group_by(CreditCardPurchase.billing_cycle_id).subquery()

    stmt = (
        select(
            CreditCardCycle,
            func.coalesce(sums_subq.c.total, 0).label("total"),
            func.coalesce(sums_subq.c.cnt, 0).label("cnt"),
        )
        .outerjoin(sums_subq, sums_subq.c.cycle_id == CreditCardCycle.id)
        .where(CreditCardCycle.credit_card_id == billing_card.id)
    )

    if status_filter is not None:
        stmt = stmt.where(CreditCardCycle.status == status_filter)
    if from_month:
        from_date = _parse_year_month(from_month, "from")
        stmt = stmt.where(CreditCardCycle.period_end >= from_date)
    if to_month:
        to_first = _parse_year_month(to_month, "to")
        to_next = _add_months(to_first, 1)
        stmt = stmt.where(CreditCardCycle.period_end < to_next)

    stmt = stmt.order_by(CreditCardCycle.period_end.desc())
    rows = db.execute(stmt).all()

    return [
        CycleOut(
            id=cycle.id,
            credit_card_id=cycle.credit_card_id,
            period_start=cycle.period_start,
            period_end=cycle.period_end,
            due_date=cycle.due_date,
            total_amount=Decimal(total or 0),
            status=cycle.status,
            purchase_count=int(cnt or 0),
        )
        for cycle, total, cnt in rows
    ]


def _billing_card_for(db: Session, card: CreditCard) -> CreditCard:
    """Pra cartao adicional, retorna o cartao PAI (onde os cycles vivem).
    Pra cartao principal, retorna ele mesmo."""
    if card.parent_card_id is None:
        return card
    parent = db.get(CreditCard, card.parent_card_id)
    if parent is None:
        # parent foi removido (cenario improvavel — FK RESTRICT). Fallback no proprio.
        return card
    return parent


def get_current_cycle(db: Session, card: CreditCard) -> CycleOut:
    _reject_debit(card)
    # Adicional usa o cycle do pai
    billing_card = _billing_card_for(db, card)
    today = date.today()
    cycle = (
        db.query(CreditCardCycle)
        .filter(
            CreditCardCycle.credit_card_id == billing_card.id,
            CreditCardCycle.period_start <= today,
            CreditCardCycle.period_end >= today,
            CreditCardCycle.status == CycleStatus.open,
        )
        .first()
    )
    if cycle is None:
        ps, pe, dd = compute_cycle_for_purchase(billing_card, today)
        cycle = ensure_cycle_exists(db, billing_card.id, ps, pe, dd)
        db.commit()
    return _cycle_with_aggregates(db, cycle, scope_card_id=card.id if card.parent_card_id else None)


def get_cycle_detail(
    db: Session, card: CreditCard, cycle_id: int
) -> CycleOut:
    _reject_debit(card)
    billing_card = _billing_card_for(db, card)
    cycle = db.get(CreditCardCycle, cycle_id)
    if cycle is None or cycle.credit_card_id != billing_card.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="cycle not found"
        )
    return _cycle_with_aggregates(db, cycle, scope_card_id=card.id if card.parent_card_id else None)


def list_cycle_purchases(
    db: Session, card: CreditCard, cycle_id: int
) -> list[CreditCardPurchase]:
    _reject_debit(card)
    billing_card = _billing_card_for(db, card)
    cycle = db.get(CreditCardCycle, cycle_id)
    if cycle is None or cycle.credit_card_id != billing_card.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="cycle not found"
        )
    q = db.query(CreditCardPurchase).filter(CreditCardPurchase.billing_cycle_id == cycle_id)
    # Adicional: filtra purchases apenas deste cartao filho.
    # Principal: inclui purchases proprias + dos filhos (todas no mesmo cycle).
    if card.parent_card_id is not None:
        q = q.filter(CreditCardPurchase.credit_card_id == card.id)
    return q.order_by(
        CreditCardPurchase.purchase_date.asc(), CreditCardPurchase.id.asc()
    ).all()


def _cycle_with_aggregates(
    db: Session, cycle: CreditCardCycle, scope_card_id: int | None = None
) -> CycleOut:
    """Agrega total + count de purchases do cycle.
    Se scope_card_id passado (cartao adicional), filtra apenas compras dele.
    Senao (principal), agrega tudo do cycle (proprias + filhos)."""
    where_clauses = [CreditCardPurchase.billing_cycle_id == cycle.id]
    if scope_card_id is not None:
        where_clauses.append(CreditCardPurchase.credit_card_id == scope_card_id)
    row = db.execute(
        select(
            func.coalesce(func.sum(CreditCardPurchase.amount), 0),
            func.count(CreditCardPurchase.id),
        ).where(*where_clauses)
    ).one()
    total, cnt = row
    return CycleOut(
        id=cycle.id,
        credit_card_id=cycle.credit_card_id,
        period_start=cycle.period_start,
        period_end=cycle.period_end,
        due_date=cycle.due_date,
        total_amount=Decimal(total or 0),
        status=cycle.status,
        purchase_count=int(cnt or 0),
    )


__all__ = [
    "compute_cycle_for_purchase",
    "ensure_cycle_exists",
    "list_cycles",
    "get_current_cycle",
    "get_cycle_detail",
    "list_cycle_purchases",
    "_add_months",
    "_safe_day",
]

from __future__ import annotations

import base64
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Category,
    CreditCard,
    CreditCardPurchase,
    Currency,
    User,
)
from app.models.enums import CardType, CategoryKind, TransactionKind
from app.schemas.common import CursorPage
from app.schemas.credit_card_purchase import (
    PurchaseCreate,
    PurchaseOut,
    PurchaseSeriesCreatedResponse,
    PurchaseUpdate,
)
from app.schemas.transaction import TransactionCreate
from app.services import transaction_service
from app.services.cycle_service import (
    _add_months,
    compute_cycle_for_purchase,
    ensure_cycle_exists,
)


def _round(value: Decimal, decimals: int) -> Decimal:
    quantizer = Decimal(10) ** -decimals
    return value.quantize(quantizer, rounding=ROUND_HALF_UP)


def _split_installments(total: Decimal, n: int, decimals: int) -> list[Decimal]:
    if n < 1:
        raise ValueError("installments must be >= 1")
    if n == 1:
        return [_round(total, decimals)]
    per = _round(total / n, decimals)
    parts = [per] * (n - 1)
    last = total - sum(parts)
    parts.append(last)
    return parts


def _encode_cursor(purchase_id: int) -> str:
    return base64.urlsafe_b64encode(str(purchase_id).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        return int(decoded)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


def create_purchase(
    db: Session,
    card: CreditCard,
    payload: PurchaseCreate,
    user: User,
) -> PurchaseSeriesCreatedResponse:
    if card.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="credit card is archived"
        )

    if payload.category_id is not None:
        category = db.get(Category, payload.category_id)
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="category not found"
            )
        if category.kind != CategoryKind.expense:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"category kind ({category.kind.value}) must be 'expense'",
            )

    if card.card_type == CardType.debit:
        return _create_debit_purchase(db, card, payload, user)

    currency = db.get(Currency, card.currency_code)
    decimals = currency.decimals if currency else 2

    n = max(1, payload.installments)
    parts = _split_installments(payload.amount, n, decimals)

    billing_card = (
        db.get(CreditCard, card.parent_card_id)
        if card.parent_card_id is not None
        else card
    )
    if billing_card is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parent card not found for additional card",
        )

    purchases: list[CreditCardPurchase] = []
    parent_id: int | None = None

    try:
        for i, part_amount in enumerate(parts, start=1):
            effective_date = _add_months(payload.purchase_date, i - 1)
            ps, pe, dd = compute_cycle_for_purchase(billing_card, effective_date)
            cycle = ensure_cycle_exists(db, billing_card.id, ps, pe, dd)

            p = CreditCardPurchase(
                credit_card_id=card.id,
                currency_code=card.currency_code,
                amount=part_amount,
                category_id=payload.category_id,
                purchase_date=payload.purchase_date,
                description=payload.description,
                merchant=payload.merchant,
                installment_n=i,
                installment_of=n,
                parent_purchase_id=parent_id,
                billing_cycle_id=cycle.id,
                created_by_user_id=user.id,
            )
            db.add(p)
            db.flush()
            purchases.append(p)
            if i == 1 and n > 1:
                parent_id = p.id
        db.commit()
    except Exception:
        db.rollback()
        raise

    for p in purchases:
        db.refresh(p)

    series_id = purchases[0].id if len(purchases) > 1 else None
    total = sum((p.amount for p in purchases), start=Decimal("0"))
    return PurchaseSeriesCreatedResponse(
        series_id=series_id,
        installments=len(purchases),
        total_amount=total,
        purchases=[PurchaseOut.model_validate(p) for p in purchases],
    )


def _create_debit_purchase(
    db: Session,
    card: CreditCard,
    payload: PurchaseCreate,
    user: User,
) -> PurchaseSeriesCreatedResponse:
    if payload.installments != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="debit purchases cannot be split into installments",
        )
    if card.payment_account_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="debit card has no payment_account_id",
        )
    account = db.get(Account, card.payment_account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="linked account not found",
        )

    base_desc = payload.description or "Compra"
    tx_payload = TransactionCreate(
        account_id=account.id,
        amount=payload.amount,
        kind=TransactionKind.expense,
        category_id=payload.category_id,
        date=payload.purchase_date,
        description=f"{base_desc} (cartão {card.name})"[:500],
    )
    tx = transaction_service.create_single(db, account, tx_payload, user)

    fake_purchase = PurchaseOut(
        id=tx.id,
        credit_card_id=card.id,
        currency_code=card.currency_code,
        amount=payload.amount,
        purchase_date=payload.purchase_date,
        description=payload.description,
        merchant=payload.merchant,
        category_id=payload.category_id,
        installment_n=1,
        installment_of=1,
        parent_purchase_id=None,
        billing_cycle_id=None,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )
    return PurchaseSeriesCreatedResponse(
        series_id=None,
        installments=1,
        total_amount=payload.amount,
        purchases=[fake_purchase],
    )


def list_purchases(
    db: Session,
    card: CreditCard,
    cycle_id: int | None,
    cursor: str | None,
    limit: int,
) -> CursorPage[PurchaseOut]:
    if card.card_type == CardType.debit:
        # Debit purchases are stored as Transactions on the linked account.
        # Frontend lists those via the transactions endpoint.
        return CursorPage[PurchaseOut](items=[], next_cursor=None, limit=limit)

    # Quando card é principal, inclui compras dos adicionais (filhos cujo
    # parent_card_id = card.id). Compras dos filhos têm credit_card_id = filho
    # mas billing_cycle_id aponta pro cycle do pai.
    card_ids: list[int] = [card.id]
    if card.parent_card_id is None:
        children_ids = list(
            db.execute(
                select(CreditCard.id).where(CreditCard.parent_card_id == card.id)
            ).scalars().all()
        )
        card_ids.extend(children_ids)

    stmt = select(CreditCardPurchase).where(
        CreditCardPurchase.credit_card_id.in_(card_ids)
    )
    if cycle_id is not None:
        stmt = stmt.where(CreditCardPurchase.billing_cycle_id == cycle_id)
    if cursor is not None:
        cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(CreditCardPurchase.id < cursor_id)

    stmt = stmt.order_by(CreditCardPurchase.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[PurchaseOut](
        items=[PurchaseOut.model_validate(p) for p in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def update_purchase(
    db: Session, purchase: CreditCardPurchase, payload: PurchaseUpdate
) -> CreditCardPurchase:
    data = payload.model_dump(exclude_unset=True)

    if "category_id" in data:
        new_cat_id = data["category_id"]
        if new_cat_id is not None:
            category = db.get(Category, new_cat_id)
            if category is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="category not found",
                )
            if category.kind != CategoryKind.expense:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="category kind must be 'expense'",
                )
        purchase.category_id = new_cat_id

    if "amount" in data and data["amount"] is not None:
        currency = db.get(Currency, purchase.currency_code)
        decimals = currency.decimals if currency else 2
        purchase.amount = _round(Decimal(str(data["amount"])), decimals)
    if "description" in data:
        purchase.description = data["description"]
    if "merchant" in data:
        purchase.merchant = data["merchant"]

    db.commit()
    db.refresh(purchase)
    return purchase


def delete_purchase(db: Session, purchase: CreditCardPurchase) -> None:
    try:
        db.delete(purchase)
        db.commit()
    except Exception:
        db.rollback()
        raise


__all__ = [
    "create_purchase",
    "list_purchases",
    "update_purchase",
    "delete_purchase",
]

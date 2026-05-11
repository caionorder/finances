from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    CreditCard,
    CreditCardAcl,
    CreditCardCycle,
    CreditCardPurchase,
    Currency,
    User,
)
from app.models.enums import AclPermission, CardType, CycleStatus, UserRole
from app.schemas.credit_card import (
    CreditCardAclEntryOut,
    CreditCardAclItem,
    CreditCardCreate,
    CreditCardUpdate,
    CreditCardWithSummary,
)
from app.services import audit_service


def list_visible_with_summary(
    db: Session, user: User, include_archived: bool = False
) -> list[CreditCardWithSummary]:
    today = date.today()
    is_admin = user.role == UserRole.admin

    if is_admin:
        stmt = select(CreditCard)
        if not include_archived:
            stmt = stmt.where(CreditCard.is_archived.is_(False))
        stmt = stmt.order_by(CreditCard.id)
        cards = list(db.execute(stmt).scalars().all())
        perm_by_card: dict[int, str] = {c.id: "write" for c in cards}
    else:
        stmt = select(CreditCard, CreditCardAcl.permission).join(
            CreditCardAcl,
            (CreditCardAcl.credit_card_id == CreditCard.id)
            & (CreditCardAcl.user_id == user.id),
        )
        if not include_archived:
            stmt = stmt.where(CreditCard.is_archived.is_(False))
        stmt = stmt.order_by(CreditCard.id)
        rows = db.execute(stmt).all()
        cards = [r[0] for r in rows]
        perm_by_card = {r[0].id: (r[1].value if hasattr(r[1], "value") else r[1]) for r in rows}

    if not cards:
        return []

    card_ids = [c.id for c in cards]

    cycles = (
        db.execute(
            select(CreditCardCycle).where(
                CreditCardCycle.credit_card_id.in_(card_ids),
                CreditCardCycle.period_start <= today,
                CreditCardCycle.period_end >= today,
                CreditCardCycle.status == CycleStatus.open,
            )
        )
        .scalars()
        .all()
    )
    cycles_by_card: dict[int, CreditCardCycle] = {
        c.credit_card_id: c for c in cycles
    }

    # Total agregado por cycle (incluindo compras dos filhos — base do summary do pai)
    sum_by_cycle: dict[int, Decimal] = {}
    # Total POR cartao+cycle (filtrado por credit_card_id — usado pra mostrar gasto
    # individual do cartao adicional)
    sum_by_card_cycle: dict[tuple[int, int], Decimal] = {}
    cycle_ids = [c.id for c in cycles]
    if cycle_ids:
        rows = db.execute(
            select(
                CreditCardPurchase.billing_cycle_id,
                func.coalesce(func.sum(CreditCardPurchase.amount), 0),
            )
            .where(CreditCardPurchase.billing_cycle_id.in_(cycle_ids))
            .group_by(CreditCardPurchase.billing_cycle_id)
        ).all()
        sum_by_cycle = {row[0]: Decimal(row[1] or 0) for row in rows}

        # Breakdown por cartao (pra mostrar gasto individual do adicional)
        rows2 = db.execute(
            select(
                CreditCardPurchase.credit_card_id,
                CreditCardPurchase.billing_cycle_id,
                func.coalesce(func.sum(CreditCardPurchase.amount), 0),
            )
            .where(CreditCardPurchase.billing_cycle_id.in_(cycle_ids))
            .group_by(
                CreditCardPurchase.credit_card_id,
                CreditCardPurchase.billing_cycle_id,
            )
        ).all()
        for cc_id, cyc_id, total in rows2:
            sum_by_card_cycle[(cc_id, cyc_id)] = Decimal(total or 0)

    summary_by_card: dict[int, tuple[Decimal, date | None, Decimal | None]] = {}
    for card in cards:
        if card.parent_card_id is not None:
            continue
        cycle = cycles_by_card.get(card.id)
        total = sum_by_cycle.get(cycle.id, Decimal("0")) if cycle else Decimal("0")
        due = cycle.due_date if cycle else None
        avail = (
            card.limit_amount - total if card.limit_amount is not None else None
        )
        summary_by_card[card.id] = (total, due, avail)

    out: list[CreditCardWithSummary] = []
    for card in cards:
        if card.card_type == CardType.debit:
            total = Decimal("0")
            due = None
            avail = None
        elif card.parent_card_id is not None and card.parent_card_id in summary_by_card:
            # Adicional: due_date e available herdados do pai;
            # total = SEU PROPRIO gasto no cycle do pai (não 0)
            _parent_total, due, avail = summary_by_card[card.parent_card_id]
            parent_cycle = cycles_by_card.get(card.parent_card_id)
            if parent_cycle is not None:
                total = sum_by_card_cycle.get((card.id, parent_cycle.id), Decimal("0"))
            else:
                total = Decimal("0")
        else:
            total, due, avail = summary_by_card.get(
                card.id, (Decimal("0"), None, None)
            )
        out.append(
            CreditCardWithSummary(
                id=card.id,
                name=card.name,
                currency_code=card.currency_code,
                card_type=card.card_type.value,
                limit_amount=card.limit_amount,
                closing_day=card.closing_day,
                due_day=card.due_day,
                payment_account_id=card.payment_account_id,
                parent_card_id=card.parent_card_id,
                is_archived=card.is_archived,
                created_at=card.created_at,
                updated_at=card.updated_at,
                current_cycle_total=total,
                current_cycle_due_date=due,
                available_credit=avail,
                is_additional=card.parent_card_id is not None,
                permission_for_me=perm_by_card.get(card.id),
            )
        )
    return out


def create(db: Session, payload: CreditCardCreate, user: User) -> CreditCard:
    currency = db.get(Currency, payload.currency_code)
    if currency is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown currency_code: {payload.currency_code}",
        )

    card_type = CardType(payload.card_type)

    if card_type == CardType.debit:
        if payload.parent_card_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="debit cards cannot be additional",
            )
        if payload.payment_account_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="debit cards require payment_account_id",
            )
        acc = db.get(Account, payload.payment_account_id)
        if acc is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payment_account not found",
            )
        if acc.currency_code != payload.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="debit card currency must match linked account currency",
            )
        inferred_limit = None
        inferred_closing = None
        inferred_due = None
        inferred_payment_account = payload.payment_account_id
    elif payload.parent_card_id is not None:
        parent = db.get(CreditCard, payload.parent_card_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent card not found",
            )
        if parent.parent_card_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannot create additional of an additional card (max 1 level)",
            )
        if parent.card_type != CardType.credit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="additional card parent must be a credit card",
            )
        if parent.is_archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent card is archived",
            )
        if parent.currency_code != payload.currency_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="additional card must have same currency as parent",
            )
        inferred_limit = parent.limit_amount
        inferred_closing = parent.closing_day
        inferred_due = parent.due_day
        inferred_payment_account = parent.payment_account_id
    else:
        if payload.closing_day is None or payload.due_day is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="closing_day and due_day required for primary credit cards",
            )
        inferred_limit = payload.limit_amount
        inferred_closing = payload.closing_day
        inferred_due = payload.due_day
        inferred_payment_account = payload.payment_account_id

    if card_type != CardType.debit and inferred_payment_account is not None:
        acc = db.get(Account, inferred_payment_account)
        if acc is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payment_account not found",
            )

    card = CreditCard(
        name=payload.name,
        currency_code=payload.currency_code,
        card_type=card_type,
        limit_amount=inferred_limit,
        closing_day=inferred_closing,
        due_day=inferred_due,
        payment_account_id=inferred_payment_account,
        parent_card_id=payload.parent_card_id,
        is_archived=False,
    )
    db.add(card)
    db.flush()
    audit_service.log_action(
        db, user.id, "create", "CreditCard", card.id, payload.model_dump(mode="json")
    )
    db.commit()
    db.refresh(card)
    return card


def update(
    db: Session,
    card: CreditCard,
    payload: CreditCardUpdate,
    current_user: User | None = None,
) -> CreditCard:
    data = payload.model_dump(exclude_unset=True, mode="json")
    if "payment_account_id" in data and data["payment_account_id"] is not None:
        acc = db.get(Account, data["payment_account_id"])
        if acc is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payment_account not found",
            )
    for field in (
        "name",
        "limit_amount",
        "closing_day",
        "due_day",
        "payment_account_id",
        "is_archived",
    ):
        if field in data and data[field] is not None:
            setattr(card, field, data[field])
    if "payment_account_id" in data and data["payment_account_id"] is None:
        card.payment_account_id = None
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "update",
        "CreditCard",
        card.id,
        data,
    )
    db.commit()
    db.refresh(card)
    return card


def archive(db: Session, card: CreditCard, current_user: User | None = None) -> None:
    active_children = db.execute(
        select(CreditCard.id).where(
            CreditCard.parent_card_id == card.id,
            CreditCard.is_archived.is_(False),
        )
    ).first()
    if active_children:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cannot archive: card has active additional cards",
        )
    card.is_archived = True
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "archive",
        "CreditCard",
        card.id,
        None,
    )
    db.commit()


def list_acls(db: Session, card: CreditCard) -> list[CreditCardAclEntryOut]:
    rows = db.execute(
        select(
            CreditCardAcl.user_id,
            CreditCardAcl.permission,
            User.email,
            User.name,
        )
        .join(User, User.id == CreditCardAcl.user_id)
        .where(CreditCardAcl.credit_card_id == card.id)
        .order_by(CreditCardAcl.user_id)
    ).all()
    return [
        CreditCardAclEntryOut(
            user_id=row.user_id,
            user_email=row.email,
            user_name=row.name,
            permission=row.permission,
        )
        for row in rows
    ]


def set_acls(
    db: Session,
    card: CreditCard,
    items: list[CreditCardAclItem],
    current_user: User | None = None,
) -> list[CreditCardAclEntryOut]:
    if len({it.user_id for it in items}) != len(items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="duplicate user_ids in acl set",
        )
    if items:
        user_ids = [it.user_id for it in items]
        existing = set(
            db.execute(select(User.id).where(User.id.in_(user_ids))).scalars().all()
        )
        missing = [uid for uid in user_ids if uid not in existing]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"unknown user_ids: {missing}",
            )

    db.query(CreditCardAcl).filter(CreditCardAcl.credit_card_id == card.id).delete(
        synchronize_session=False
    )
    for item in items:
        db.add(
            CreditCardAcl(
                credit_card_id=card.id,
                user_id=item.user_id,
                permission=item.permission,
            )
        )
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "set_acls",
        "CreditCard",
        card.id,
        {
            "acls": [
                {
                    "user_id": it.user_id,
                    "permission": it.permission.value
                    if hasattr(it.permission, "value")
                    else it.permission,
                }
                for it in items
            ]
        },
    )
    db.commit()
    return list_acls(db, card)


def remove_acl(
    db: Session, card: CreditCard, user_id: int, current_user: User | None = None
) -> None:
    acl = db.get(CreditCardAcl, (card.id, user_id))
    if acl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="acl not found"
        )
    db.delete(acl)
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "remove_acl",
        "CreditCard",
        card.id,
        {"target_user_id": user_id},
    )
    db.commit()


__all__ = [
    "list_visible_with_summary",
    "create",
    "update",
    "archive",
    "list_acls",
    "set_acls",
    "remove_acl",
]

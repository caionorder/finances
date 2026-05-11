from __future__ import annotations

import base64
from decimal import Decimal
from typing import TypedDict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.models import Account, AccountAcl, Category, Transaction, User
from app.models.enums import TransactionKind, UserRole
from app.schemas.common import CursorPage
from app.schemas.transaction import (
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
    TransferCreate,
)
from app.services._search import escape_like


class TransactionFilters(TypedDict, total=False):
    account_id: int | None
    kind: TransactionKind | None
    category_id: int | None
    date_from: object  # date | None — TypedDict não aceita date import circular
    date_to: object
    search: str | None


def _apply_sign(amount: Decimal, kind: TransactionKind) -> Decimal:
    if kind == TransactionKind.income:
        return amount
    return -amount


def _encode_cursor(tx_id: int) -> str:
    return base64.urlsafe_b64encode(str(tx_id).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        return int(decoded)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


def list_transactions(
    db: Session,
    user: User,
    filters: TransactionFilters,
    cursor: str | None,
    limit: int,
) -> CursorPage[TransactionOut]:
    stmt = select(Transaction)

    if user.role != UserRole.admin:
        stmt = stmt.join(
            AccountAcl,
            (AccountAcl.account_id == Transaction.account_id)
            & (AccountAcl.user_id == user.id),
        )

    if filters.get("account_id") is not None:
        stmt = stmt.where(Transaction.account_id == filters["account_id"])
    if filters.get("kind") is not None:
        stmt = stmt.where(Transaction.kind == filters["kind"])
    if filters.get("category_id") is not None:
        stmt = stmt.where(Transaction.category_id == filters["category_id"])
    if filters.get("date_from") is not None:
        stmt = stmt.where(Transaction.date >= filters["date_from"])
    if filters.get("date_to") is not None:
        stmt = stmt.where(Transaction.date <= filters["date_to"])
    search = filters.get("search")
    if search:
        escaped = escape_like(search)
        stmt = stmt.where(
            Transaction.description.like(f"%{escaped}%", escape="\\")
        )

    if cursor is not None:
        cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(Transaction.id < cursor_id)

    stmt = stmt.order_by(Transaction.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[TransactionOut](
        items=[TransactionOut.model_validate(tx) for tx in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def create_single(
    db: Session, account: Account, payload: TransactionCreate, user: User
) -> Transaction:
    if payload.kind == TransactionKind.transfer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="use POST /transactions/transfer for transfers",
        )
    if account.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="account is archived"
        )
    if payload.category_id is not None:
        category = db.get(Category, payload.category_id)
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="category not found"
            )
        if category.kind != payload.kind:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"category kind ({category.kind.value}) must match transaction kind ({payload.kind.value})",
            )

    signed = _apply_sign(payload.amount, payload.kind)
    tx = Transaction(
        account_id=account.id,
        currency_code=account.currency_code,
        amount=signed,
        kind=payload.kind,
        category_id=payload.category_id,
        date=payload.date,
        description=payload.description,
        transfer_pair_id=None,
        created_by_user_id=user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def create_transfer(
    db: Session,
    src: Account,
    dst: Account,
    payload: TransferCreate,
    user: User,
) -> tuple[Transaction, Transaction]:
    if src.id == dst.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source and destination must be different accounts",
        )
    if src.currency_code != dst.currency_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cross-currency transfers are not supported",
        )
    if src.is_archived or dst.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot transfer involving an archived account",
        )

    desc = payload.description or ""
    desc_out = f"Transferencia para {dst.name}" + (f": {desc}" if desc else "")
    desc_in = f"Transferencia de {src.name}" + (f": {desc}" if desc else "")

    out = Transaction(
        account_id=src.id,
        currency_code=src.currency_code,
        amount=-payload.amount,
        kind=TransactionKind.transfer,
        category_id=None,
        date=payload.date,
        description=desc_out[:500],
        transfer_pair_id=None,
        created_by_user_id=user.id,
    )
    inb = Transaction(
        account_id=dst.id,
        currency_code=dst.currency_code,
        amount=payload.amount,
        kind=TransactionKind.transfer,
        category_id=None,
        date=payload.date,
        description=desc_in[:500],
        transfer_pair_id=None,
        created_by_user_id=user.id,
    )
    try:
        db.add(out)
        db.flush()
        inb.transfer_pair_id = out.id
        db.add(inb)
        db.flush()
        out.transfer_pair_id = inb.id
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(out)
    db.refresh(inb)
    return out, inb


def update(db: Session, tx: Transaction, payload: TransactionUpdate) -> Transaction:
    if tx.kind == TransactionKind.transfer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transfer transactions cannot be edited; delete and recreate",
        )
    data = payload.model_dump(exclude_unset=True)

    if "category_id" in data:
        new_cat_id = data["category_id"]
        if new_cat_id is not None:
            category = db.get(Category, new_cat_id)
            if category is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="category not found"
                )
            if category.kind != tx.kind:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="category kind must match transaction kind",
                )
        tx.category_id = new_cat_id

    if "amount" in data and data["amount"] is not None:
        tx.amount = _apply_sign(data["amount"], tx.kind)

    if "date" in data and data["date"] is not None:
        tx.date = data["date"]

    if "description" in data:
        tx.description = data["description"]

    db.commit()
    db.refresh(tx)
    return tx


def delete(db: Session, tx: Transaction) -> None:
    try:
        if tx.transfer_pair_id is not None:
            pair = db.get(Transaction, tx.transfer_pair_id)
            if pair is None:
                # outro processo ja deletou o par; idempotente
                tx.transfer_pair_id = None
                db.delete(tx)
                db.commit()
                return
            pair.transfer_pair_id = None
            tx.transfer_pair_id = None
            db.flush()
            db.delete(pair)
            db.delete(tx)
        else:
            db.delete(tx)
        db.commit()
    except (StaleDataError, IntegrityError):
        db.rollback()
        # idempotente: outra requisicao ja removeu o par
        return
    except Exception:
        db.rollback()
        raise


__all__ = [
    "list_transactions",
    "create_single",
    "create_transfer",
    "update",
    "delete",
]

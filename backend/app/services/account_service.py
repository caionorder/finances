from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, AccountAcl, Currency, Transaction, User
from app.models.enums import AclPermission, UserRole
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountWithBalance,
    AclEntryOut,
    AclItem,
    BalanceResponse,
)
from app.services import audit_service


def list_visible_with_balance(
    db: Session, user: User, include_archived: bool = False
) -> list[AccountWithBalance]:
    """Retorna contas visiveis com current_balance calculado em uma unica query.
    Admin ve todas. Member/viewer vê apenas as que tem ACL row.
    """
    movements = (
        select(
            Transaction.account_id.label("acc_id"),
            func.coalesce(func.sum(Transaction.amount), 0).label("movements_total"),
        )
        .group_by(Transaction.account_id)
        .subquery()
    )

    is_admin = user.role == UserRole.admin

    stmt = select(
        Account,
        func.coalesce(movements.c.movements_total, 0).label("movements_total"),
    ).outerjoin(movements, movements.c.acc_id == Account.id)

    if not include_archived:
        stmt = stmt.where(Account.is_archived.is_(False))

    if not is_admin:
        stmt = stmt.add_columns(AccountAcl.permission.label("user_perm")).join(
            AccountAcl,
            (AccountAcl.account_id == Account.id) & (AccountAcl.user_id == user.id),
        )

    stmt = stmt.order_by(Account.id)

    rows = db.execute(stmt).all()
    out: list[AccountWithBalance] = []
    for row in rows:
        if is_admin:
            account, movements_total = row
            perm: str | None = "write"
        else:
            account, movements_total, user_perm = row
            perm = user_perm.value if hasattr(user_perm, "value") else user_perm
        current_balance = (account.opening_balance or Decimal("0")) + Decimal(movements_total or 0)
        out.append(
            AccountWithBalance(
                id=account.id,
                name=account.name,
                type=account.type,
                currency_code=account.currency_code,
                opening_balance=account.opening_balance,
                notes=account.notes,
                is_archived=account.is_archived,
                created_at=account.created_at,
                updated_at=account.updated_at,
                current_balance=current_balance,
                permission_for_me=perm,
            )
        )
    return out


def create(db: Session, payload: AccountCreate, current_user: User) -> Account:
    currency = db.get(Currency, payload.currency_code)
    if currency is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown currency_code: {payload.currency_code}",
        )
    account = Account(
        name=payload.name,
        type=payload.type,
        currency_code=payload.currency_code,
        opening_balance=payload.opening_balance,
        notes=payload.notes,
        is_archived=False,
    )
    db.add(account)
    db.flush()
    audit_service.log_action(
        db, current_user.id, "create", "Account", account.id, payload.model_dump(mode="json")
    )
    db.commit()
    db.refresh(account)
    return account


def update(
    db: Session, account: Account, payload: AccountUpdate, current_user: User | None = None
) -> Account:
    data = payload.model_dump(exclude_unset=True, mode="json")
    for field in ("name", "type", "opening_balance", "notes", "is_archived"):
        if field in data and data[field] is not None:
            setattr(account, field, data[field])
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "update",
        "Account",
        account.id,
        data,
    )
    db.commit()
    db.refresh(account)
    return account


def archive(db: Session, account: Account, current_user: User | None = None) -> None:
    account.is_archived = True
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "archive",
        "Account",
        account.id,
        None,
    )
    db.commit()


def get_balance(db: Session, account: Account, as_of: date) -> BalanceResponse:
    movements_total = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.account_id == account.id, Transaction.date <= as_of
        )
    ).scalar_one()
    movements_total = Decimal(movements_total or 0)
    current_balance = (account.opening_balance or Decimal("0")) + movements_total
    return BalanceResponse(
        account_id=account.id,
        currency_code=account.currency_code,
        opening_balance=account.opening_balance,
        movements_total=movements_total,
        current_balance=current_balance,
        as_of=as_of,
    )


def list_acls(db: Session, account: Account) -> list[AclEntryOut]:
    rows = db.execute(
        select(
            AccountAcl.user_id,
            AccountAcl.permission,
            User.email,
            User.name,
        )
        .join(User, User.id == AccountAcl.user_id)
        .where(AccountAcl.account_id == account.id)
        .order_by(AccountAcl.user_id)
    ).all()
    return [
        AclEntryOut(
            user_id=row.user_id,
            user_email=row.email,
            user_name=row.name,
            permission=row.permission,
        )
        for row in rows
    ]


def set_acls(
    db: Session,
    account: Account,
    items: list[AclItem],
    current_user: User | None = None,
) -> list[AclEntryOut]:
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

    db.query(AccountAcl).filter(AccountAcl.account_id == account.id).delete(
        synchronize_session=False
    )
    for item in items:
        db.add(
            AccountAcl(
                account_id=account.id,
                user_id=item.user_id,
                permission=item.permission,
            )
        )
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "set_acls",
        "Account",
        account.id,
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
    return list_acls(db, account)


def remove_acl(
    db: Session, account: Account, user_id: int, current_user: User | None = None
) -> None:
    acl = db.get(AccountAcl, (account.id, user_id))
    if acl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="acl not found")
    db.delete(acl)
    audit_service.log_action(
        db,
        current_user.id if current_user else None,
        "remove_acl",
        "Account",
        account.id,
        {"target_user_id": user_id},
    )
    db.commit()


__all__ = [
    "list_visible_with_balance",
    "create",
    "update",
    "archive",
    "get_balance",
    "list_acls",
    "set_acls",
    "remove_acl",
]

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Contract, Customer, Invoice, User
from app.schemas.contract import ContractCreate, ContractOut, ContractUpdate
from app.services import audit_service

# Mutable contract fields (explicit whitelist). customer_id/currency are fixed
# after creation.
_UPDATE_FIELDS = (
    "reference",
    "title",
    "contract_date",
    "service_period_start",
    "service_period_end",
    "scope_description",
    "agreed_rate",
    "rate_unit",
    "payment_terms_days",
    "default_tax_rate",
    "default_discount",
    "is_active",
    "next_period_start",
    "notes",
)


def to_out(c: Contract) -> ContractOut:
    return ContractOut.model_validate(c)


def list_contracts(
    db: Session,
    user: User,
    customer_id: int | None = None,
    is_active: bool | None = None,
) -> list[ContractOut]:
    """List contracts. Globally visible to any authenticated user (decision #6)."""
    stmt = select(Contract)
    if customer_id is not None:
        stmt = stmt.where(Contract.customer_id == customer_id)
    if is_active is not None:
        stmt = stmt.where(Contract.is_active.is_(is_active))
    stmt = stmt.order_by(Contract.id.desc())
    rows = list(db.execute(stmt).scalars().all())
    return [to_out(c) for c in rows]


def get(db: Session, user: User, contract_id: int) -> Contract:
    """Fetch a contract. Globally readable (any authenticated user)."""
    c = db.get(Contract, contract_id)
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contract not found")
    return c


def _ensure_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer not found")
    return customer


def create(db: Session, payload: ContractCreate, user: User) -> Contract:
    _ensure_customer(db, payload.customer_id)
    contract = Contract(
        customer_id=payload.customer_id,
        reference=payload.reference,
        title=payload.title,
        contract_date=payload.contract_date,
        currency_code="USD",
        service_period_start=payload.service_period_start,
        service_period_end=payload.service_period_end,
        scope_description=payload.scope_description,
        agreed_rate=payload.agreed_rate,
        rate_unit=payload.rate_unit,
        payment_terms_days=payload.payment_terms_days,
        default_tax_rate=payload.default_tax_rate,
        default_discount=payload.default_discount,
        is_active=payload.is_active,
        next_period_start=payload.next_period_start,
        notes=payload.notes,
        created_by_user_id=user.id,
    )
    db.add(contract)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="a contract with this reference already exists for the customer",
        ) from exc
    audit_service.log_action(
        db, user.id, "create", "Contract", contract.id, payload.model_dump(mode="json")
    )
    db.commit()
    db.refresh(contract)
    return contract


def update(db: Session, contract: Contract, payload: ContractUpdate, user: User) -> Contract:
    data = payload.model_dump(exclude_unset=True, mode="json")
    for field in _UPDATE_FIELDS:
        if field in data:
            setattr(contract, field, data[field])
    audit_service.log_action(db, user.id, "update", "Contract", contract.id, data)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="a contract with this reference already exists for the customer",
        ) from exc
    db.refresh(contract)
    return contract


def delete(db: Session, contract: Contract, user: User) -> None:
    """Delete a contract. 409 if any invoice still references it."""
    referenced = db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.contract_id == contract.id)
    ).scalar_one()
    if referenced:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="contract is referenced by invoices and cannot be deleted",
        )
    audit_service.log_action(db, user.id, "delete", "Contract", contract.id, None)
    db.delete(contract)
    db.commit()


__all__ = [
    "list_contracts",
    "get",
    "create",
    "update",
    "delete",
    "to_out",
]

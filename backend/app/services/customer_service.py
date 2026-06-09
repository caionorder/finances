from __future__ import annotations

import base64

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Contract, Customer, Invoice, User
from app.schemas.common import CursorPage
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.services import audit_service

# Mutable customer fields (explicit whitelist — never spread model_dump).
_UPDATE_FIELDS = (
    "legal_name",
    "contact_person",
    "email",
    "phone",
    "tax_id",
    "billing_address_line1",
    "billing_address_line2",
    "billing_city",
    "billing_state",
    "billing_postal_code",
    "billing_country",
    "notes",
    "is_archived",
)


def _encode_cursor(value: int) -> str:
    return base64.urlsafe_b64encode(str(value).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        return int(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


def to_out(c: Customer) -> CustomerOut:
    return CustomerOut.model_validate(c)


def list_customers(
    db: Session,
    user: User,
    q: str | None = None,
    include_archived: bool = False,
    cursor: str | None = None,
    limit: int = 50,
) -> CursorPage[CustomerOut]:
    """List customers. Globally visible to any authenticated user (decision #6)."""
    stmt = select(Customer)

    if not include_archived:
        stmt = stmt.where(Customer.is_archived.is_(False))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Customer.legal_name.ilike(like),
                Customer.contact_person.ilike(like),
                Customer.email.ilike(like),
            )
        )
    if cursor is not None:
        stmt = stmt.where(Customer.id < _decode_cursor(cursor))

    stmt = stmt.order_by(Customer.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[CustomerOut](
        items=[to_out(c) for c in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def get(db: Session, user: User, customer_id: int) -> Customer:
    """Fetch a customer. Globally readable (any authenticated user)."""
    c = db.get(Customer, customer_id)
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="customer not found")
    return c


def create(db: Session, payload: CustomerCreate, user: User) -> Customer:
    customer = Customer(
        legal_name=payload.legal_name,
        contact_person=payload.contact_person,
        email=payload.email,
        phone=payload.phone,
        tax_id=payload.tax_id,
        billing_address_line1=payload.billing_address_line1,
        billing_address_line2=payload.billing_address_line2,
        billing_city=payload.billing_city,
        billing_state=payload.billing_state,
        billing_postal_code=payload.billing_postal_code,
        billing_country=payload.billing_country,
        notes=payload.notes,
        is_archived=False,
        created_by_user_id=user.id,
    )
    db.add(customer)
    db.flush()
    audit_service.log_action(
        db, user.id, "create", "Customer", customer.id, payload.model_dump(mode="json")
    )
    db.commit()
    db.refresh(customer)
    return customer


def update(db: Session, customer: Customer, payload: CustomerUpdate, user: User) -> Customer:
    data = payload.model_dump(exclude_unset=True, mode="json")
    for field in _UPDATE_FIELDS:
        if field in data:
            setattr(customer, field, data[field])
    audit_service.log_action(db, user.id, "update", "Customer", customer.id, data)
    db.commit()
    db.refresh(customer)
    return customer


def delete_or_archive(db: Session, customer: Customer, user: User) -> Customer | None:
    """Hard-delete if unreferenced; otherwise archive (HTTP 409 → archive).

    Returns the (now archived) Customer when it was referenced, else ``None``
    after a hard delete.
    """
    referenced = db.execute(
        select(func.count()).select_from(Contract).where(Contract.customer_id == customer.id)
    ).scalar_one()
    referenced += db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.customer_id == customer.id)
    ).scalar_one()

    if referenced:
        if customer.is_archived:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="customer is referenced and already archived",
            )
        customer.is_archived = True
        audit_service.log_action(
            db, user.id, "archive", "Customer", customer.id, {"reason": "referenced"}
        )
        db.commit()
        db.refresh(customer)
        return customer

    audit_service.log_action(db, user.id, "delete", "Customer", customer.id, None)
    db.delete(customer)
    db.commit()
    return None


__all__ = [
    "list_customers",
    "get",
    "create",
    "update",
    "delete_or_archive",
    "to_out",
]

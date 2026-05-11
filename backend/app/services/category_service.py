from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    CreditCardPurchase,
    Factura,
    Payable,
    Receivable,
    Transaction,
)
from app.models.enums import CategoryKind
from app.schemas.category import (
    CategoryCreate,
    CategoryNode,
    CategoryUpdate,
)


def list_all(db: Session) -> list[Category]:
    stmt = select(Category).order_by(Category.kind, Category.sort_order, Category.name)
    return list(db.execute(stmt).scalars().all())


def list_tree(db: Session, kind: CategoryKind | None = None) -> list[CategoryNode]:
    stmt = select(Category).order_by(Category.sort_order, Category.name)
    if kind is not None:
        stmt = stmt.where(Category.kind == kind)
    cats = list(db.execute(stmt).scalars().all())

    nodes: dict[int, CategoryNode] = {}
    for c in cats:
        nodes[c.id] = CategoryNode.model_validate(c)

    roots: list[CategoryNode] = []
    for c in cats:
        node = nodes[c.id]
        if c.parent_id is not None and c.parent_id in nodes:
            nodes[c.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


def _validate_parent(db: Session, parent_id: int | None, kind: CategoryKind) -> Category | None:
    if parent_id is None:
        return None
    parent = db.get(Category, parent_id)
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="parent_id not found"
        )
    if parent.kind != kind:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parent kind must match child kind",
        )
    return parent


def create(db: Session, payload: CategoryCreate) -> Category:
    _validate_parent(db, payload.parent_id, payload.kind)
    category = Category(
        name=payload.name,
        kind=payload.kind,
        parent_id=payload.parent_id,
        icon=payload.icon,
        color=payload.color,
        sort_order=payload.sort_order,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _would_create_cycle(db: Session, category: Category, new_parent_id: int) -> bool:
    if new_parent_id == category.id:
        return True
    cursor_id: int | None = new_parent_id
    visited: set[int] = set()
    while cursor_id is not None:
        if cursor_id == category.id:
            return True
        if cursor_id in visited:
            return False
        visited.add(cursor_id)
        cursor = db.get(Category, cursor_id)
        if cursor is None:
            return False
        cursor_id = cursor.parent_id
    return False


def update(db: Session, category: Category, payload: CategoryUpdate) -> Category:
    data = payload.model_dump(exclude_unset=True)

    if "parent_id" in data:
        new_parent_id = data["parent_id"]
        if new_parent_id is not None:
            if new_parent_id == category.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="category cannot be its own parent",
                )
            parent = db.get(Category, new_parent_id)
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="parent_id not found"
                )
            if parent.kind != category.kind:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="parent kind must match child kind",
                )
            if _would_create_cycle(db, category, new_parent_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="parent change would create cycle",
                )
        category.parent_id = new_parent_id

    for field in ("name", "icon", "color", "sort_order"):
        if field in data and data[field] is not None:
            setattr(category, field, data[field])

    db.commit()
    db.refresh(category)
    return category


def _is_in_use(db: Session, category_id: int) -> bool:
    checks = [
        select(Transaction.id).where(Transaction.category_id == category_id).limit(1),
        select(CreditCardPurchase.id).where(CreditCardPurchase.category_id == category_id).limit(1),
        select(Payable.id).where(Payable.category_id == category_id).limit(1),
        select(Receivable.id).where(Receivable.category_id == category_id).limit(1),
        select(Factura.id).where(Factura.category_id == category_id).limit(1),
    ]
    for stmt in checks:
        if db.execute(stmt).first() is not None:
            return True
    return False


def delete(db: Session, category: Category) -> None:
    children_count = db.execute(
        select(Category.id).where(Category.parent_id == category.id).limit(1)
    ).first()
    if children_count is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="category has children"
        )
    if _is_in_use(db, category.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="category in use"
        )
    db.delete(category)
    db.commit()


__all__ = [
    "list_all",
    "list_tree",
    "create",
    "update",
    "delete",
]

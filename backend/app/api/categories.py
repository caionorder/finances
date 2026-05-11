from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import Category, User
from app.models.enums import CategoryKind, UserRole
from app.schemas.category import (
    CategoryCreate,
    CategoryNode,
    CategoryOut,
    CategoryUpdate,
)
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["categories"])
require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=list[CategoryOut],
    summary="List all categories (flat)",
    description=(
        "Returns the full flat list of categories. Use `GET /categories/tree` for a "
        "nested view filtered by `kind`. Agents should use this endpoint to discover "
        "valid `category_id` values before booking a transaction or purchase."
    ),
)
def list_categories(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
) -> list[Category]:
    return category_service.list_all(db)


@router.get(
    "/tree",
    response_model=list[CategoryNode],
    summary="List categories as a nested tree",
    description=(
        "Returns root categories with their children populated recursively. Pass "
        "`kind=income|expense|transfer` to filter by the category's economic role."
    ),
)
def list_tree(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    kind: CategoryKind | None = None,
) -> list[CategoryNode]:
    return category_service.list_tree(db, kind)


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_category(
    payload: CategoryCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Category:
    return category_service.create(db, payload)


@router.patch(
    "/{category_id}",
    response_model=CategoryOut,
    dependencies=[Depends(require_admin)],
)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category not found")
    return category_service.update(db, category, payload)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_category(
    category_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category not found")
    category_service.delete(db, category)

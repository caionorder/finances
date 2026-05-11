from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CategoryKind


class CategoryBase(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Category display name.",
        examples=["Food & Drinks"],
    )
    kind: CategoryKind = Field(
        ...,
        description="Economic role: `income`, `expense` or `transfer`.",
        examples=["expense"],
    )
    parent_id: int | None = Field(
        None,
        description="Parent category id (for sub-categories). Null for root categories.",
    )
    icon: str | None = Field(
        None,
        max_length=50,
        description="Optional icon key (frontend-defined).",
        examples=["utensils"],
    )
    color: str | None = Field(
        None,
        max_length=20,
        description="Optional hex/CSS color (frontend-defined).",
        examples=["#FF5733"],
    )
    sort_order: int = Field(
        0,
        description="Display order within its parent group. Lower = first.",
    )


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    parent_id: int | None = None
    icon: str | None = None
    color: str | None = None
    sort_order: int | None = None


class CategoryOut(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryNode(CategoryOut):
    children: list["CategoryNode"] = []


CategoryNode.model_rebuild()

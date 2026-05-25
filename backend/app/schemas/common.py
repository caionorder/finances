from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: list[T] = Field(
        ...,
        description=(
            "The page of items. Empty when there are no more results. Each list element "
            "follows the schema of the parameterized type `T`."
        ),
    )
    next_cursor: str | None = Field(
        None,
        description=(
            "Opaque cursor to pass to the next page as `?cursor=...`. `null` when the current "
            "page is the last one."
        ),
        examples=["eyJpZCI6MTIzfQ=="],
    )
    limit: int = Field(
        ...,
        description="The page size requested by the caller (echoed back for convenience).",
        examples=[50],
    )

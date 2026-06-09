from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.common import CursorPage
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["customers"])
require_member_or_admin = require_role(UserRole.admin, UserRole.member)


@router.get(
    "",
    response_model=CursorPage[CustomerOut],
    summary="List billing customers (cursor-paginated)",
    description=(
        "Lists reusable billing customers (US entities) used by commercial invoices.\n\n"
        "**Visibility**: any authenticated user can read (global visibility — decision #6).\n\n"
        "Filter with `q` (matches legal name, contact person or email) and "
        "`include_archived`. Pass the previous response's `next_cursor` back as `?cursor=...`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_customers(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    q: str | None = Query(
        None, description="Case-insensitive search across legal name, contact and email."
    ),
    include_archived: bool = Query(False, description="Include archived customers in the result."),
    cursor: str | None = Query(
        None, description="Opaque cursor from the previous page's `next_cursor`."
    ),
    limit: int = Query(50, ge=1, le=200, description="Max items per page (1-200)."),
) -> CursorPage[CustomerOut]:
    return customer_service.list_customers(
        db, user, q=q, include_archived=include_archived, cursor=cursor, limit=limit
    )


@router.post(
    "",
    response_model=CustomerOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member_or_admin)],
    summary="Create a billing customer",
    description=(
        "Creates a reusable billing customer.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        201: {"description": "Customer created."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        422: {"description": "Validation error."},
    },
)
def create_customer(
    payload: CustomerCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CustomerOut:
    customer = customer_service.create(db, payload, user)
    return customer_service.to_out(customer)


@router.get(
    "/{customer_id}",
    response_model=CustomerOut,
    summary="Get a single customer by id",
    description="Returns the full customer record. Readable by any authenticated user.",
    responses={
        401: {"description": "Missing or invalid access token."},
        404: {"description": "Customer not found."},
    },
)
def get_customer(
    customer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CustomerOut:
    customer = customer_service.get(db, user, customer_id)
    return customer_service.to_out(customer)


@router.patch(
    "/{customer_id}",
    response_model=CustomerOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Update a customer",
    description=(
        "Partial update of a customer's mutable fields.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Customer not found."},
        422: {"description": "Validation error."},
    },
)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CustomerOut:
    customer = customer_service.get(db, user, customer_id)
    updated = customer_service.update(db, customer, payload, user)
    return customer_service.to_out(updated)


@router.delete(
    "/{customer_id}",
    response_model=CustomerOut | None,
    dependencies=[Depends(require_member_or_admin)],
    summary="Delete or archive a customer",
    description=(
        "Hard-deletes the customer when it is not referenced by any contract or invoice. "
        "If it **is** referenced, the customer is archived instead (the response carries the "
        "archived record with HTTP 200). A 204 is returned on a successful hard delete.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Customer was referenced and has been archived."},
        204: {"description": "Customer hard-deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Customer not found."},
        409: {"description": "Customer is referenced and already archived."},
    },
)
def delete_customer(
    customer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    customer = customer_service.get(db, user, customer_id)
    archived = customer_service.delete_or_archive(db, customer, user)
    if archived is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return customer_service.to_out(archived)

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.contract import ContractCreate, ContractOut, ContractUpdate
from app.services import contract_service

router = APIRouter(prefix="/contracts", tags=["contracts"])
require_member_or_admin = require_role(UserRole.admin, UserRole.member)


@router.get(
    "",
    response_model=list[ContractOut],
    summary="List contracts",
    description=(
        "Lists contracts (agreements linking a customer to billing terms).\n\n"
        "**Visibility**: any authenticated user can read (global visibility — decision #6).\n\n"
        "Filter with `customer_id` and `is_active`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_contracts(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    customer_id: int | None = Query(None, description="Restrict to a single customer."),
    is_active: bool | None = Query(None, description="Filter by active flag."),
) -> list[ContractOut]:
    return contract_service.list_contracts(db, user, customer_id=customer_id, is_active=is_active)


@router.post(
    "",
    response_model=ContractOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member_or_admin)],
    summary="Create a contract",
    description=(
        "Creates a contract for a customer. `reference` must be unique per customer.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        201: {"description": "Contract created."},
        400: {"description": "Referenced customer does not exist."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        409: {"description": "A contract with this reference already exists for the customer."},
        422: {"description": "Validation error."},
    },
)
def create_contract(
    payload: ContractCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ContractOut:
    contract = contract_service.create(db, payload, user)
    return contract_service.to_out(contract)


@router.get(
    "/{contract_id}",
    response_model=ContractOut,
    summary="Get a single contract by id",
    description="Returns the full contract record. Readable by any authenticated user.",
    responses={
        401: {"description": "Missing or invalid access token."},
        404: {"description": "Contract not found."},
    },
)
def get_contract(
    contract_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ContractOut:
    contract = contract_service.get(db, user, contract_id)
    return contract_service.to_out(contract)


@router.patch(
    "/{contract_id}",
    response_model=ContractOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Update a contract",
    description=(
        "Partial update of a contract's mutable fields. `customer_id` and `currency_code` are "
        "fixed after creation.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Contract not found."},
        409: {"description": "A contract with this reference already exists for the customer."},
        422: {"description": "Validation error."},
    },
)
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ContractOut:
    contract = contract_service.get(db, user, contract_id)
    updated = contract_service.update(db, contract, payload, user)
    return contract_service.to_out(updated)


@router.delete(
    "/{contract_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_member_or_admin)],
    summary="Delete a contract",
    description=(
        "Permanently removes a contract. Returns 409 if any invoice still references it.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        204: {"description": "Contract deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Contract not found."},
        409: {"description": "Contract is referenced by invoices and cannot be deleted."},
    },
)
def delete_contract(
    contract_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    contract = contract_service.get(db, user, contract_id)
    contract_service.delete(db, contract, user)

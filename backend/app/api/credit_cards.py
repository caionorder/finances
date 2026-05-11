from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from sqlalchemy import select

from app.core.deps import (
    get_current_user,
    get_db,
    require_credit_card_access,
    require_role,
)
from app.models import CreditCard, CreditCardAcl, User
from app.models.enums import AclPermission, CycleStatus, UserRole
from app.schemas.credit_card import (
    CreditCardAclEntryOut,
    CreditCardAclSetRequest,
    CreditCardCreate,
    CreditCardOut,
    CreditCardUpdate,
    CreditCardWithSummary,
    CycleOut,
)
from app.schemas.credit_card_purchase import PurchaseOut
from app.services import credit_card_service, cycle_service

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])
require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=list[CreditCardWithSummary],
    summary="List credit cards visible to the caller (with cycle summary)",
    description=(
        "Returns every credit/debit card the caller can `read`, each enriched with a "
        "summary of the **current billing cycle** (total accrued, due date, "
        "available credit when `limit_amount` is set).\n\n"
        "Pass `include_archived=true` to also list archived cards. The response is the "
        "starting point for any agent looking to **discover available cards** before "
        "booking purchases."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
    },
)
def list_credit_cards(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    include_archived: bool = Query(False, description="Include archived (soft-deleted) cards."),
) -> list[CreditCardWithSummary]:
    return credit_card_service.list_visible_with_summary(
        db, user, include_archived=include_archived
    )


@router.post(
    "",
    response_model=CreditCardOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    summary="Create a new credit/debit card (admin only)",
    description=(
        "Creates a card pinned to a single `currency_code`. Set `closing_day` and "
        "`due_day` to enable automatic billing cycle generation. `parent_card_id` "
        "models additional/secondary cards that share the parent's billing cycle."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller is not an admin."},
        422: {"description": "Validation error."},
    },
)
def create_credit_card(
    payload: CreditCardCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CreditCard:
    return credit_card_service.create(db, payload, user)


@router.get(
    "/{credit_card_id}",
    response_model=CreditCardOut,
    summary="Get a credit card by id",
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller has no read access to this card."},
        404: {"description": "Card not found."},
    },
)
def get_credit_card(
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.read))],
) -> CreditCard:
    return card


@router.get("/{credit_card_id}/children", response_model=list[CreditCardOut])
def list_children(
    credit_card_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CreditCard]:
    parent = db.get(CreditCard, credit_card_id)
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found"
        )
    if user.role != UserRole.admin:
        acl = db.get(CreditCardAcl, (credit_card_id, user.id))
        if acl is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="forbidden"
            )
    children = (
        db.execute(
            select(CreditCard)
            .where(CreditCard.parent_card_id == credit_card_id)
            .order_by(CreditCard.id)
        )
        .scalars()
        .all()
    )
    return list(children)


@router.patch("/{credit_card_id}", response_model=CreditCardOut)
def update_credit_card(
    payload: CreditCardUpdate,
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.write))],
    user: Annotated[User, Depends(get_current_user)],
) -> CreditCard:
    return credit_card_service.update(db, card, payload, user)


@router.delete(
    "/{credit_card_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def archive_credit_card(
    credit_card_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    card = db.get(CreditCard, credit_card_id)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found"
        )
    credit_card_service.archive(db, card, user)


@router.get(
    "/{credit_card_id}/acls",
    response_model=list[CreditCardAclEntryOut],
    dependencies=[Depends(require_admin)],
)
def list_acls(
    credit_card_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[CreditCardAclEntryOut]:
    card = db.get(CreditCard, credit_card_id)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found"
        )
    return credit_card_service.list_acls(db, card)


@router.put(
    "/{credit_card_id}/acls",
    response_model=list[CreditCardAclEntryOut],
    dependencies=[Depends(require_admin)],
)
def set_acls(
    credit_card_id: int,
    payload: CreditCardAclSetRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CreditCardAclEntryOut]:
    card = db.get(CreditCard, credit_card_id)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found"
        )
    return credit_card_service.set_acls(db, card, payload.acls, user)


@router.delete(
    "/{credit_card_id}/acls/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def remove_acl(
    credit_card_id: int,
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    card = db.get(CreditCard, credit_card_id)
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="credit card not found"
        )
    credit_card_service.remove_acl(db, card, user_id, current)


@router.get(
    "/{credit_card_id}/cycles",
    response_model=list[CycleOut],
    summary="List billing cycles of a credit card",
    description=(
        "Returns billing cycles for the card, optionally filtered by `status` "
        "(`open`/`closed`/`paid`) and a month range (`from_month`, `to_month` in "
        "`YYYY-MM` format)."
    ),
)
def list_cycles(
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.read))],
    status: CycleStatus | None = None,
    from_month: str | None = None,
    to_month: str | None = None,
) -> list[CycleOut]:
    return cycle_service.list_cycles(
        db, card, status_filter=status, from_month=from_month, to_month=to_month
    )


@router.get(
    "/{credit_card_id}/cycles/current",
    response_model=CycleOut,
    summary="Get the currently open billing cycle for a card",
    description=(
        "Returns the single `open` cycle of the card — i.e. the one a new purchase "
        "would land on when booked today. Useful for agents that need to know which "
        "cycle they are affecting."
    ),
)
def get_current_cycle(
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.read))],
) -> CycleOut:
    return cycle_service.get_current_cycle(db, card)


@router.get(
    "/{credit_card_id}/cycles/{cycle_id}",
    response_model=CycleOut,
)
def get_cycle_detail(
    cycle_id: int,
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.read))],
) -> CycleOut:
    return cycle_service.get_cycle_detail(db, card, cycle_id)


@router.get(
    "/{credit_card_id}/cycles/{cycle_id}/purchases",
    response_model=list[PurchaseOut],
)
def list_cycle_purchases(
    cycle_id: int,
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[CreditCard, Depends(require_credit_card_access(AclPermission.read))],
) -> list[PurchaseOut]:
    rows = cycle_service.list_cycle_purchases(db, card, cycle_id)
    return [PurchaseOut.model_validate(p) for p in rows]

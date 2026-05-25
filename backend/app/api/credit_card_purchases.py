from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import (
    get_current_user,
    get_db,
    require_credit_card_access,
)
from app.models import CreditCard, CreditCardAcl, CreditCardPurchase, User
from app.models.enums import AclPermission, UserRole
from app.schemas.common import CursorPage
from app.schemas.credit_card_purchase import (
    PurchaseCreate,
    PurchaseOut,
    PurchaseSeriesCreatedResponse,
    PurchaseUpdate,
)
from app.services import purchase_service

card_router = APIRouter(prefix="/credit-cards", tags=["credit-card-purchases"])
purchase_router = APIRouter(
    prefix="/credit-card-purchases", tags=["credit-card-purchases"]
)


def _check_card_perm(
    db: Session,
    user: User,
    credit_card_id: int,
    permission: AclPermission,
) -> None:
    if user.role == UserRole.admin:
        return
    acl = db.get(CreditCardAcl, (credit_card_id, user.id))
    if acl is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="no access to this credit card",
        )
    if permission == AclPermission.write and acl.permission != AclPermission.write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="read-only access"
        )


@card_router.post(
    "/{credit_card_id}/purchases",
    response_model=PurchaseSeriesCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Book a purchase on a credit card (with optional installments)",
    description=(
        "Creates a purchase on the given credit card. When `installments > 1`, the "
        "service generates **N child purchase rows** (one per installment) plus a "
        "parent row, all linked via `parent_purchase_id` / `series_id`.\n\n"
        "* `amount` is the **total** purchase value — installments are derived by "
        "splitting it evenly (cents are rounded to the first installment).\n"
        "* `purchase_date` controls which `BillingCycle` the FIRST installment falls "
        "into; subsequent installments are placed on the next cycles in sequence.\n"
        "* `currency_code` is inherited from the card; do not send it.\n"
        "* `merchant` is free text (max 255 chars). Used as the human-readable label.\n\n"
        "**ACL**: caller needs `write` permission on the card (or admin).\n\n"
        "**Idempotency**: this endpoint is not idempotent — callers (e.g. agents) MUST "
        "deduplicate before posting (recommended: hash of `merchant + amount + purchase_date`)."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on the card."},
        404: {"description": "Credit card not found."},
        422: {"description": "Validation error (amount <= 0, installments > 72, unknown category, ...)."},
    },
    openapi_extra={
        "x-codeSamples": [
            {
                "lang": "shell",
                "label": "curl",
                "source": (
                    "curl -X POST https://api.example.com/api/credit-cards/1/purchases \\\n"
                    "  -H 'Authorization: Bearer $ACCESS_TOKEN' \\\n"
                    "  -H 'Content-Type: application/json' \\\n"
                    "  -d '{\n"
                    "        \"merchant\": \"Amazon\",\n"
                    "        \"amount\": \"599.90\",\n"
                    "        \"purchase_date\": \"2026-05-25\",\n"
                    "        \"installments\": 3\n"
                    "      }'"
                ),
            },
            {
                "lang": "python",
                "label": "httpx",
                "source": (
                    "import httpx\n\n"
                    "card_id = 1\n"
                    "r = httpx.post(\n"
                    "    f'https://api.example.com/api/credit-cards/{card_id}/purchases',\n"
                    "    headers={'Authorization': f'Bearer {access_token}'},\n"
                    "    json={\n"
                    "        'merchant': 'Amazon',\n"
                    "        'amount': '599.90',\n"
                    "        'purchase_date': '2026-05-25',\n"
                    "        'installments': 3,\n"
                    "    },\n"
                    ")\n"
                    "r.raise_for_status()\n"
                    "print(r.json())"
                ),
            },
        ],
    },
)
def create_purchase(
    payload: PurchaseCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    card: Annotated[
        CreditCard, Depends(require_credit_card_access(AclPermission.write))
    ],
) -> PurchaseSeriesCreatedResponse:
    return purchase_service.create_purchase(db, card, payload, user)


@card_router.get(
    "/{credit_card_id}/purchases",
    response_model=CursorPage[PurchaseOut],
    summary="List purchases on a credit card (cursor-paginated)",
    description=(
        "Returns purchases booked on the given card. Pass `cycle_id` to scope to a "
        "single billing cycle. Use the response's `next_cursor` to paginate.\n\n"
        "**ACL**: caller needs `read` permission on the card."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks read access on the card."},
        404: {"description": "Credit card not found."},
    },
)
def list_purchases(
    db: Annotated[Session, Depends(get_db)],
    card: Annotated[
        CreditCard, Depends(require_credit_card_access(AclPermission.read))
    ],
    cycle_id: int | None = None,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> CursorPage[PurchaseOut]:
    return purchase_service.list_purchases(db, card, cycle_id, cursor, limit)


@purchase_router.get(
    "/{purchase_id}",
    response_model=PurchaseOut,
    summary="Get a single credit-card purchase by id",
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks read access on the purchase's card."},
        404: {"description": "Purchase not found."},
    },
)
def get_purchase(
    purchase_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CreditCardPurchase:
    purchase = db.get(CreditCardPurchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="purchase not found"
        )
    _check_card_perm(db, user, purchase.credit_card_id, AclPermission.read)
    return purchase


@purchase_router.patch(
    "/{purchase_id}",
    response_model=PurchaseOut,
    summary="Update mutable fields of a credit-card purchase",
    description=(
        "Updates `amount`, `description`, `merchant` or `category_id`. The purchase "
        "date and installment placement cannot be edited — delete and recreate instead."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on the card."},
        404: {"description": "Purchase not found."},
    },
)
def update_purchase(
    purchase_id: int,
    payload: PurchaseUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CreditCardPurchase:
    purchase = db.get(CreditCardPurchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="purchase not found"
        )
    _check_card_perm(db, user, purchase.credit_card_id, AclPermission.write)
    return purchase_service.update_purchase(db, purchase, payload)


@purchase_router.delete(
    "/{purchase_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a credit-card purchase",
    description=(
        "Deletes a purchase. If the purchase is the parent of an installment series, "
        "**all child installments are deleted** as well."
    ),
    responses={
        401: {"description": "Missing or invalid JWT bearer token."},
        403: {"description": "Caller lacks write access on the card."},
        404: {"description": "Purchase not found."},
    },
)
def delete_purchase(
    purchase_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    purchase = db.get(CreditCardPurchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="purchase not found"
        )
    _check_card_perm(db, user, purchase.credit_card_id, AclPermission.write)
    purchase_service.delete_purchase(db, purchase)

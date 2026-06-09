from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models import User
from app.models.enums import UserRole
from app.schemas.issuer_profile import IssuerProfileOut, IssuerProfileUpsert
from app.services import issuer_profile_service

router = APIRouter(prefix="/settings/issuer", tags=["issuer-settings"])
require_admin = require_role(UserRole.admin)


@router.get(
    "",
    response_model=IssuerProfileOut,
    dependencies=[Depends(require_admin)],
    summary="Get the issuer profile (admin only)",
    description=(
        "Returns the singleton issuer profile (id=1): entity details, beneficiary/intermediary "
        "wire instructions, the receiving account, the bank receiving fee, the default income "
        "category and the foreign-tax-status footnote.\n\n"
        "**Authorization**: admin only — these fields are wire-fraud sensitive (control H2)."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        404: {"description": "Issuer profile not configured yet."},
    },
)
def get_issuer(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> IssuerProfileOut:
    profile = issuer_profile_service.get(db, user)
    return issuer_profile_service.to_out(profile)


@router.put(
    "",
    response_model=IssuerProfileOut,
    dependencies=[Depends(require_admin)],
    summary="Create or replace the issuer profile (admin only)",
    description=(
        "Upserts the singleton issuer profile (id=1). Validates that:\n\n"
        "* at least one of `account_number` / `iban` is present;\n"
        "* any intermediary field requires `intermediary_bank_name` + `intermediary_swift_bic`;\n"
        "* `swift_bic`/`intermediary_swift_bic` match the SWIFT/BIC format;\n"
        "* `receiving_account_id` (if set) points at a non-archived USD account;\n"
        "* `default_income_category_id` (if set) is an income category.\n\n"
        "**Authorization**: admin only (control H2). Bank/tax field values are redacted in the "
        "audit log (control H3)."
    ),
    responses={
        200: {"description": "Issuer profile created or replaced."},
        400: {"description": "Validation error on reconciliation fields (account/category)."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller is not an admin."},
        422: {"description": "Validation error (invalid SWIFT, missing bank account, ...)."},
    },
)
def upsert_issuer(
    payload: IssuerProfileUpsert,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> IssuerProfileOut:
    profile = issuer_profile_service.upsert(db, payload, user)
    return issuer_profile_service.to_out(profile)

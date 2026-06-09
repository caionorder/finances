from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Category, IssuerProfile, User
from app.models.enums import CategoryKind
from app.schemas.issuer_profile import IssuerProfileOut, IssuerProfileUpsert
from app.services import audit_service

ISSUER_ID = 1

# Every column the PUT body owns (explicit whitelist — id/timestamps excluded).
_UPSERT_FIELDS = (
    "legal_name",
    "ruc",
    "address_line1",
    "address_line2",
    "city",
    "country",
    "email",
    "phone",
    "bank_name",
    "bank_address",
    "bank_country",
    "swift_bic",
    "account_number",
    "iban",
    "intermediary_bank_name",
    "intermediary_swift_bic",
    "intermediary_account_number",
    "intermediary_bank_country",
    "receiving_account_id",
    "bank_receiving_fee",
    "default_income_category_id",
    "wire_reference_instructions",
    "default_payment_terms_days",
    "tax_status_note",
)


def to_out(p: IssuerProfile) -> IssuerProfileOut:
    return IssuerProfileOut.model_validate(p)


def get(db: Session, user: User) -> IssuerProfile:
    """Fetch the singleton issuer profile (id=1). 404 if not configured yet."""
    profile = db.get(IssuerProfile, ISSUER_ID)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="issuer profile not configured",
        )
    return profile


def get_or_none(db: Session) -> IssuerProfile | None:
    """Return the singleton issuer profile if it exists, else ``None``.

    Read-only: never fabricates a placeholder — the profile is created on first
    PUT (named ``get_or_none`` to avoid implying a row is guaranteed; M7).
    """
    return db.get(IssuerProfile, ISSUER_ID)


def _validate_reconciliation(db: Session, payload: IssuerProfileUpsert) -> None:
    if payload.receiving_account_id is not None:
        acc = db.get(Account, payload.receiving_account_id)
        if acc is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="receiving_account_id does not reference an existing account",
            )
        if acc.is_archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="receiving account is archived",
            )
        if acc.currency_code != "USD":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="receiving account must be a USD account",
            )
    if payload.default_income_category_id is not None:
        cat = db.get(Category, payload.default_income_category_id)
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="default_income_category_id does not reference an existing category",
            )
        if cat.kind != CategoryKind.income:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="default income category must be of kind 'income'",
            )


def upsert(db: Session, payload: IssuerProfileUpsert, user: User) -> IssuerProfile:
    """Create-or-replace the singleton issuer profile (id=1)."""
    _validate_reconciliation(db, payload)
    data = payload.model_dump(mode="json")

    profile = db.get(IssuerProfile, ISSUER_ID)
    action = "update"
    if profile is None:
        action = "create"
        profile = IssuerProfile(id=ISSUER_ID)
        db.add(profile)

    for field in _UPSERT_FIELDS:
        setattr(profile, field, data[field])

    # Audit only field names of sensitive bank/tax data (values redacted by
    # SENSITIVE_KEYS). Non-sensitive fields keep their values.
    audit_service.log_action(db, user.id, action, "IssuerProfile", ISSUER_ID, data)
    db.commit()
    db.refresh(profile)
    return profile


__all__ = [
    "ISSUER_ID",
    "get",
    "get_or_none",
    "upsert",
    "to_out",
]

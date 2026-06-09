from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin


class IssuerProfile(Base, TimestampMixin):
    """Singleton (id=1) issuer entity + wire + reconciliation config."""

    __tablename__ = "issuer_profiles"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # --- Entity ---
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ruc: Mapped[str] = mapped_column(String(20), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="PY")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # --- Beneficiary bank (Continental) ---
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bank_country: Mapped[str] = mapped_column(String(2), nullable=False, default="PY")
    swift_bic: Mapped[str] = mapped_column(String(20), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    iban: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # --- Intermediary / correspondent (US) ---
    intermediary_bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    intermediary_swift_bic: Mapped[str | None] = mapped_column(String(20), nullable=True)
    intermediary_account_number: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    intermediary_bank_country: Mapped[str | None] = mapped_column(
        String(2), nullable=True, default="US"
    )

    # --- Reconciliation (decisions #2/#4/#7) ---
    receiving_account_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    bank_receiving_fee: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("44")
    )
    default_income_category_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Terms / tax ---
    wire_reference_instructions: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    default_payment_terms_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    tax_status_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)

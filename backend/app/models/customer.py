from sqlalchemy import BigInteger, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin


class Customer(Base, TimestampMixin):
    """Reusable billing customer (US entity) for commercial invoices."""

    __tablename__ = "customers"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # EIN
    billing_address_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_city: Mapped[str] = mapped_column(String(120), nullable=False)
    billing_state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    billing_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    billing_country: Mapped[str] = mapped_column(
        String(2), nullable=False, default="US"
    )
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

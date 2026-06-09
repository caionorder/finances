from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin
from app.models.enums import InvoiceStatus


class Invoice(Base, TimestampMixin):
    """Commercial invoice header. Mutable while ``draft``; frozen at issue.

    ``net_amount`` (the auto-created Receivable value) is NOT stored: it is
    derived as ``total - bank_fee_amount`` (decision #7).
    """

    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("number", name="uq_invoices_number"),
        Index("ix_invoices_status_due_date", "status", "due_date"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # --- Identity ---
    # NULL while draft; immutable after issue. uq_invoices_number is the backstop.
    number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, native_enum=False, length=50),
        nullable=False,
        default=InvoiceStatus.draft,
        index=True,
    )

    # --- FKs ---
    customer_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    contract_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("contracts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    currency_code: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("currencies.code", ondelete="RESTRICT"),
        nullable=False,
        default="USD",
    )
    category_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    # The net-amount Receivable auto-created on issue (decision #7).
    receivable_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("receivables.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # --- Dates ---
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    service_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # --- Money rollups (frozen at issue) ---
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    discount_total: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    tax_total: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    # Snapshot of the bank receiving fee applied at issue (default 44).
    bank_fee_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("44")
    )

    # --- Snapshots (JSON, frozen at issue) ---
    issuer_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    customer_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # --- Text ---
    po_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    terms: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # --- PDF ---
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pdf_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # --- Lifecycle ---
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLineItem.position",
    )


class InvoiceLineItem(Base):
    """A single billable line on an invoice. Created-at only (no update tracking)."""

    __tablename__ = "invoice_line_items"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("1")
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(7, 4), nullable=False, default=Decimal("0")
    )
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    line_tax: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")

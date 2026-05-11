"""Model for individual payment records against a Payable."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PayablePayment(Base):
    """Tracks each partial or full payment made against a Payable.

    A Payable may accumulate multiple PayablePayment rows, one per call
    to mark_as_paid.  The sum of all payments' ``amount`` values equals
    ``Payable.paid_amount``.
    """

    __tablename__ = "payable_payments"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    payable_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("payables.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    transaction_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    paid_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    payable: Mapped["Payable"] = relationship(back_populates="payments")  # type: ignore[name-defined]  # noqa: F821

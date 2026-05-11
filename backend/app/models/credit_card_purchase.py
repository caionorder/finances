from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin


class CreditCardPurchase(Base, TimestampMixin):
    __tablename__ = "credit_card_purchases"
    __table_args__ = (
        Index(
            "ix_credit_card_purchases_card_date",
            "credit_card_id",
            "purchase_date",
        ),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    credit_card_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("credit_cards.id", ondelete="RESTRICT"),
        nullable=False,
    )
    currency_code: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("currencies.code", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    installment_n: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    installment_of: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    parent_purchase_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("credit_card_purchases.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    billing_cycle_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("credit_card_cycles.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

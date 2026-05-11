from datetime import date
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin
from app.models.enums import AclPermission, CardType, CycleStatus


class CreditCard(Base, TimestampMixin):
    __tablename__ = "credit_cards"
    __table_args__ = (
        Index("ix_credit_cards_parent_card_id", "parent_card_id"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("currencies.code", ondelete="RESTRICT"),
        nullable=False,
    )
    limit_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    closing_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_account_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    parent_card_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("credit_cards.id", ondelete="RESTRICT"),
        nullable=True,
    )
    card_type: Mapped[CardType] = mapped_column(
        Enum(CardType, native_enum=False, length=20),
        nullable=False,
        default=CardType.credit,
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    parent: Mapped["CreditCard | None"] = relationship(
        "CreditCard",
        remote_side="CreditCard.id",
        foreign_keys="CreditCard.parent_card_id",
        back_populates="children",
    )
    children: Mapped[list["CreditCard"]] = relationship(
        "CreditCard",
        foreign_keys="CreditCard.parent_card_id",
        back_populates="parent",
    )


class CreditCardAcl(Base, TimestampMixin):
    __tablename__ = "credit_card_acls"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    credit_card_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("credit_cards.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission: Mapped[AclPermission] = mapped_column(
        Enum(AclPermission, native_enum=False, length=50), nullable=False
    )


class CreditCardCycle(Base, TimestampMixin):
    __tablename__ = "credit_card_cycles"
    __table_args__ = (
        UniqueConstraint("credit_card_id", "period_start", name="uq_cc_cycle_card_period"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    credit_card_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("credit_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    status: Mapped[CycleStatus] = mapped_column(
        Enum(CycleStatus, native_enum=False, length=50),
        nullable=False,
        default=CycleStatus.open,
    )

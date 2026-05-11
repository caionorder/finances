from datetime import date
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin
from app.models.enums import (
    IndexRef,
    InvestmentType,
    Liquidity,
    MovementType,
    RateKind,
    RatePeriod,
)


class Investment(Base, TimestampMixin):
    __tablename__ = "investments"
    __table_args__ = (
        Index("ix_investments_account_id", "account_id"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[InvestmentType] = mapped_column(
        Enum(InvestmentType, native_enum=False, length=30), nullable=False
    )
    account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    currency_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False
    )
    principal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    maturity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    rate_value: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    rate_period: Mapped[RatePeriod] = mapped_column(
        Enum(RatePeriod, native_enum=False, length=20), nullable=False
    )
    rate_kind: Mapped[RateKind] = mapped_column(
        Enum(RateKind, native_enum=False, length=30),
        nullable=False,
        default=RateKind.fixed,
    )
    index_ref: Mapped[IndexRef | None] = mapped_column(
        Enum(IndexRef, native_enum=False, length=20), nullable=True
    )
    liquidity: Mapped[Liquidity] = mapped_column(
        Enum(Liquidity, native_enum=False, length=20),
        nullable=False,
        default=Liquidity.daily,
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    movements: Mapped[list["InvestmentMovement"]] = relationship(
        "InvestmentMovement",
        back_populates="investment",
        cascade="all, delete-orphan",
    )


class InvestmentMovement(Base, TimestampMixin):
    __tablename__ = "investment_movements"
    __table_args__ = (
        Index("ix_inv_movements_investment_date", "investment_id", "date"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("investments.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[MovementType] = mapped_column(
        Enum(MovementType, native_enum=False, length=20), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    investment: Mapped["Investment"] = relationship(
        "Investment", back_populates="movements"
    )

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin


class FxRate(Base, TimestampMixin):
    """Cotacao de uma moeda (base) em termos de outra (quote).

    rate = quanto custa 1 base em quote. Ex: BTC->USD rate=80000 significa 1 BTC = 80000 USD.
    """

    __tablename__ = "fx_rates"
    __table_args__ = (
        Index("ix_fx_rates_pair_fetched", "base_code", "quote_code", "fetched_at"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    base_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("currencies.code", ondelete="CASCADE"), nullable=False
    )
    quote_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("currencies.code", ondelete="CASCADE"), nullable=False
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="coingecko")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

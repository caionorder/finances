from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Currency(Base):
    __tablename__ = "currencies"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(8), nullable=False)
    decimals: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    is_crypto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

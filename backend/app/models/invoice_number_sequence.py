from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InvoiceNumberSequence(Base):
    """Single-row (id=1) monotonic counter for invoice numbers.

    Allocated under ``SELECT ... FOR UPDATE`` at issue time:
    ``last_number += 1`` then ``number = f"{prefix}-{last_number:06d}"``.
    Seeded with ``last_number=100`` so the first invoice is ``INV-000101``.
    """

    __tablename__ = "invoice_number_sequences"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False, default="INV")
    last_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

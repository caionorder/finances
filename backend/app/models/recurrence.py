from datetime import date

from sqlalchemy import JSON, BigInteger, Boolean, Date, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin
from app.models.enums import RecurrenceKind


class Recurrence(Base, TimestampMixin):
    __tablename__ = "recurrences"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[RecurrenceKind] = mapped_column(
        Enum(RecurrenceKind, native_enum=False, length=50), nullable=False
    )
    rule_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    template_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    next_run_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

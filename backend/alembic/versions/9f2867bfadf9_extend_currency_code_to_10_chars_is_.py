"""extend currency code to 10 chars + is_crypto + seed cripto

Revision ID: 9f2867bfadf9
Revises: dfd45b55c4f3
Create Date: 2026-05-11 09:29:15.437538

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9f2867bfadf9'
down_revision: Union[str, Sequence[str], None] = 'dfd45b55c4f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_TABLES = [
    "accounts",
    "credit_cards",
    "transactions",
    "credit_card_purchases",
    "payables",
    "receivables",
    "facturas",
    "investments",
]


def _discover_fks(conn):
    rows = conn.execute(sa.text(
        """
        SELECT TABLE_NAME, CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND COLUMN_NAME = 'currency_code'
          AND REFERENCED_TABLE_NAME = 'currencies'
        """
    )).fetchall()
    return [(r[0], r[1]) for r in rows]


def upgrade() -> None:
    conn = op.get_bind()

    fk_data = _discover_fks(conn)

    for table, name in fk_data:
        op.drop_constraint(name, table, type_="foreignkey")

    op.alter_column(
        "currencies",
        "code",
        existing_type=sa.String(3),
        type_=sa.String(10),
        existing_nullable=False,
    )

    for table in FK_TABLES:
        op.alter_column(
            table,
            "currency_code",
            existing_type=sa.String(3),
            type_=sa.String(10),
            existing_nullable=False,
        )

    op.add_column(
        "currencies",
        sa.Column(
            "is_crypto",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    for table in FK_TABLES:
        op.create_foreign_key(
            f"fk_{table}_currency_code_currencies",
            table,
            "currencies",
            ["currency_code"],
            ["code"],
            ondelete="RESTRICT",
        )

    op.execute(
        """
        INSERT INTO currencies (code, symbol, decimals, name, is_crypto) VALUES
        ('BTC', '₿', 8, 'Bitcoin', 1),
        ('USDT', '$', 6, 'Tether USD', 1)
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    op.execute("DELETE FROM currencies WHERE code IN ('BTC', 'USDT') AND is_crypto = 1")

    fk_data = _discover_fks(conn)
    for table, name in fk_data:
        op.drop_constraint(name, table, type_="foreignkey")

    op.drop_column("currencies", "is_crypto")

    for table in FK_TABLES:
        op.alter_column(
            table,
            "currency_code",
            existing_type=sa.String(10),
            type_=sa.String(3),
            existing_nullable=False,
        )

    op.alter_column(
        "currencies",
        "code",
        existing_type=sa.String(10),
        type_=sa.String(3),
        existing_nullable=False,
    )

    for table in FK_TABLES:
        op.create_foreign_key(
            f"fk_{table}_currency_code_currencies",
            table,
            "currencies",
            ["currency_code"],
            ["code"],
            ondelete="RESTRICT",
        )

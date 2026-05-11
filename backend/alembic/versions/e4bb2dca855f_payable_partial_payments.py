"""payable partial payments

Revision ID: e4bb2dca855f
Revises: 7491d432f104
Create Date: 2026-05-11 13:42:33.790497

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "e4bb2dca855f"
down_revision: Union[str, Sequence[str], None] = "7491d432f104"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add paid_amount to payables, create payable_payments, backfill."""

    # 1. Add paid_amount column to payables
    op.add_column(
        "payables",
        sa.Column(
            "paid_amount",
            sa.Numeric(18, 4),
            nullable=False,
            server_default="0",
        ),
    )

    # 2. Create payable_payments table
    op.create_table(
        "payable_payments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("payable_id", sa.BigInteger(), nullable=False),
        sa.Column("transaction_id", sa.BigInteger(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["payable_id"],
            ["payables.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(
        "ix_payable_payments_payable_id",
        "payable_payments",
        ["payable_id"],
        unique=False,
    )

    # 3. Backfill: for each payable with paid_at IS NOT NULL, create a payment record
    #    and update paid_amount = amount
    conn = op.get_bind()

    paid_payables = conn.execute(
        sa.text(
            "SELECT id, amount, paid_at, transaction_id, updated_at "
            "FROM payables WHERE paid_at IS NOT NULL"
        )
    ).fetchall()

    for row in paid_payables:
        conn.execute(
            sa.text(
                "INSERT INTO payable_payments "
                "(payable_id, transaction_id, amount, paid_at, created_at, created_by_user_id) "
                "VALUES (:payable_id, :transaction_id, :amount, :paid_at, :created_at, NULL)"
            ),
            {
                "payable_id": row.id,
                "transaction_id": row.transaction_id,
                "amount": row.amount,
                "paid_at": row.paid_at,
                "created_at": row.updated_at,
            },
        )

    conn.execute(
        sa.text(
            "UPDATE payables SET paid_amount = amount WHERE paid_at IS NOT NULL"
        )
    )


def downgrade() -> None:
    """Downgrade: drop payable_payments table and paid_amount column."""
    op.drop_index("ix_payable_payments_payable_id", table_name="payable_payments")
    op.drop_table("payable_payments")
    op.drop_column("payables", "paid_amount")

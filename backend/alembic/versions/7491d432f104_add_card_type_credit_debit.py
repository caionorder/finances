"""add card_type credit/debit

Revision ID: 7491d432f104
Revises: 2c79e2a25a17
Create Date: 2026-05-11 11:46:56.597730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7491d432f104'
down_revision: Union[str, Sequence[str], None] = '2c79e2a25a17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "credit_cards",
        sa.Column("card_type", sa.String(20), nullable=False, server_default="credit"),
    )
    op.alter_column(
        "credit_cards", "card_type",
        existing_type=sa.String(20),
        server_default=None,
        existing_nullable=False,
    )
    # Debit cards do not have closing_day / due_day — relax NOT NULL.
    op.alter_column(
        "credit_cards", "closing_day",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "credit_cards", "due_day",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "credit_cards", "due_day",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "credit_cards", "closing_day",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column("credit_cards", "card_type")

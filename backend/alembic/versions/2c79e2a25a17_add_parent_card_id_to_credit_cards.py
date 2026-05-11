"""add parent_card_id to credit_cards

Revision ID: 2c79e2a25a17
Revises: 1bedb43d443e
Create Date: 2026-05-11 10:20:21.158017

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c79e2a25a17'
down_revision: Union[str, Sequence[str], None] = '1bedb43d443e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "credit_cards",
        sa.Column("parent_card_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_credit_cards_parent_card_id",
        "credit_cards",
        ["parent_card_id"],
    )
    op.create_foreign_key(
        "fk_credit_cards_parent_card_id",
        "credit_cards",
        "credit_cards",
        ["parent_card_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_credit_cards_parent_card_id", "credit_cards", type_="foreignkey"
    )
    op.drop_index("ix_credit_cards_parent_card_id", "credit_cards")
    op.drop_column("credit_cards", "parent_card_id")

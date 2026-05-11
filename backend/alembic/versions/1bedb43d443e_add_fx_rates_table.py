"""add fx_rates table

Revision ID: 1bedb43d443e
Revises: 9f2867bfadf9
Create Date: 2026-05-11 09:30:02.604332

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1bedb43d443e'
down_revision: Union[str, Sequence[str], None] = '9f2867bfadf9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fx_rates',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('base_code', sa.String(length=10), nullable=False),
        sa.Column('quote_code', sa.String(length=10), nullable=False),
        sa.Column('rate', sa.Numeric(precision=24, scale=8), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['base_code'], ['currencies.code'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['quote_code'], ['currencies.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )
    op.create_index(
        'ix_fx_rates_pair_fetched',
        'fx_rates',
        ['base_code', 'quote_code', 'fetched_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_fx_rates_pair_fetched', table_name='fx_rates')
    op.drop_table('fx_rates')

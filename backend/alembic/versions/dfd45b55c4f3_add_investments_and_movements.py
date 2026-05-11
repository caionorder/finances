"""add investments and movements

Revision ID: dfd45b55c4f3
Revises: 6f8ef3390d98
Create Date: 2026-05-11 09:16:30.806637

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'dfd45b55c4f3'
down_revision: Union[str, Sequence[str], None] = '6f8ef3390d98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'investments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.Enum('cdb', 'lci', 'lca', 'tesouro', 'poupanca', 'fundo', 'acoes', 'cripto', 'outros', name='investmenttype', native_enum=False, length=30), nullable=False),
        sa.Column('account_id', sa.BigInteger(), nullable=True),
        sa.Column('currency_code', sa.String(length=3), nullable=False),
        sa.Column('principal', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('maturity_date', sa.Date(), nullable=True),
        sa.Column('rate_value', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('rate_period', sa.Enum('monthly', 'semiannual', 'annual', name='rateperiod', native_enum=False, length=20), nullable=False),
        sa.Column('rate_kind', sa.Enum('fixed', 'percent_of_index', 'index_plus', name='ratekind', native_enum=False, length=30), nullable=False),
        sa.Column('index_ref', sa.Enum('cdi', 'selic', 'ipca', 'igpm', name='indexref', native_enum=False, length=20), nullable=True),
        sa.Column('liquidity', sa.Enum('daily', 'on_maturity', name='liquidity', native_enum=False, length=20), nullable=False),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False),
        sa.Column('created_by_user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['currency_code'], ['currencies.code'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )
    op.create_index('ix_investments_account_id', 'investments', ['account_id'], unique=False)
    op.create_table(
        'investment_movements',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('investment_id', sa.BigInteger(), nullable=False),
        sa.Column('type', sa.Enum('deposit', 'withdrawal', 'interest', name='movementtype', native_enum=False, length=20), nullable=False),
        sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('transaction_id', sa.BigInteger(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_by_user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['investment_id'], ['investments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )
    op.create_index('ix_inv_movements_investment_date', 'investment_movements', ['investment_id', 'date'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_inv_movements_investment_date', table_name='investment_movements')
    op.drop_table('investment_movements')
    op.drop_index('ix_investments_account_id', table_name='investments')
    op.drop_table('investments')

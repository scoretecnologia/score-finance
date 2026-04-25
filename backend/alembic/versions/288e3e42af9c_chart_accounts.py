"""chart_accounts

Revision ID: 288e3e42af9c
Revises: fb4eacf32d0e
Create Date: 2026-04-25 08:34:37.346239

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '288e3e42af9c'
down_revision: Union[str, Sequence[str], None] = 'fb4eacf32d0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # chart_accounts table
    op.create_table('chart_accounts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('company_id', sa.UUID(), nullable=False),
    sa.Column('category_id', sa.UUID(), nullable=False),
    sa.Column('created_by_user_id', sa.UUID(), nullable=True),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=True),
    sa.Column('icon', sa.String(length=50), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    
    # categories
    op.add_column('categories', sa.Column('is_synthetic', sa.Boolean(), server_default='false', nullable=False))
    
    # transactions
    op.add_column('transactions', sa.Column('chart_account_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'transactions', 'chart_accounts', ['chart_account_id'], ['id'])
    
    # budgets
    op.add_column('budgets', sa.Column('chart_account_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'budgets', 'chart_accounts', ['chart_account_id'], ['id'])
    # In earlier versions category_id might be non-nullable, but now it's optional
    op.alter_column('budgets', 'category_id', existing_type=sa.UUID(), nullable=True)
    
    # recurring_transactions
    op.add_column('recurring_transactions', sa.Column('chart_account_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'recurring_transactions', 'chart_accounts', ['chart_account_id'], ['id'])


def downgrade() -> None:
    # recurring_transactions
    op.drop_constraint(None, 'recurring_transactions', type_='foreignkey')
    op.drop_column('recurring_transactions', 'chart_account_id')
    
    # budgets
    op.alter_column('budgets', 'category_id', existing_type=sa.UUID(), nullable=False)
    op.drop_constraint(None, 'budgets', type_='foreignkey')
    op.drop_column('budgets', 'chart_account_id')
    
    # transactions
    op.drop_constraint(None, 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'chart_account_id')
    
    # categories
    op.drop_column('categories', 'is_synthetic')
    
    # chart_accounts
    op.drop_table('chart_accounts')

"""fix_import_logs_tenant_id

Revision ID: fb4eacf32d0e
Revises: 033
Create Date: 2026-04-25 08:09:04.819447

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb4eacf32d0e'
down_revision: Union[str, Sequence[str], None] = '033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename column and index
    op.alter_column('import_logs', 'user_id', new_column_name='company_id')
    op.drop_index('ix_import_logs_user_id', table_name='import_logs')
    op.create_index('ix_import_logs_company_id', 'import_logs', ['company_id'])

    # Update Foreign Key: drop FK to users, add FK to companies
    # Note: postgres naming convention for sa.ForeignKey("users.id") in create_table is usually table_column_fkey
    op.drop_constraint('import_logs_user_id_fkey', 'import_logs', type_='foreignkey')
    op.create_foreign_key(
        'import_logs_company_id_fkey', 'import_logs', 'companies',
        ['company_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('import_logs_company_id_fkey', 'import_logs', type_='foreignkey')
    op.create_foreign_key(
        'import_logs_user_id_fkey', 'import_logs', 'users',
        ['user_id'], ['id']
    )
    op.drop_index('ix_import_logs_company_id', table_name='import_logs')
    op.create_index('ix_import_logs_user_id', 'import_logs', ['user_id'])
    op.alter_column('import_logs', 'company_id', new_column_name='user_id')

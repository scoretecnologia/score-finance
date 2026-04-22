"""multi_tenant_companies

Revision ID: 032
Revises: 031
Create Date: 2026-04-21

Adiciona suporte multi-tenant:
  - Cria tabela 'companies'
  - Cria tabela 'company_members'
  - Troca user_id → company_id em todas as tabelas de negócio
  - Mantém user_id em bank_connections (auditoria)
  - Adiciona created_by_user_id em categories e category_groups (auditoria)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Tabela companies ────────────────────────────────────────────────
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=True, unique=True),
        sa.Column("cnpj", sa.String(18), nullable=True),
        sa.Column("plan", sa.String(20), server_default="free", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── 2. Tabela company_members ──────────────────────────────────────────
    op.create_table(
        "company_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "invited_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("company_id", "user_id", name="uq_company_member"),
    )
    op.create_index("ix_company_members_company_id", "company_members", ["company_id"])
    op.create_index("ix_company_members_user_id", "company_members", ["user_id"])

    # ── 3. Adicionar company_id nas tabelas de negócio ─────────────────────
    tables_replace_user_id = [
        "accounts",
        "transactions",
        "budgets",
        "goals",
        "assets",
        "rules",
        "payees",
        "payee_mapping",
        "recurring_transactions",
    ]

    for table in tables_replace_user_id:
        op.add_column(
            table,
            sa.Column(
                "company_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("companies.id", ondelete="CASCADE"),
                nullable=True,  # nullable durante a transição; ajustamos abaixo
            ),
        )
        op.create_index(f"ix_{table}_company_id", table, ["company_id"])

    # categories e category_groups: adiciona company_id + created_by_user_id
    for table in ["categories", "category_groups"]:
        op.add_column(
            table,
            sa.Column(
                "company_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        op.add_column(
            table,
            sa.Column(
                "created_by_user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_company_id", table, ["company_id"])

    # bank_connections: adiciona company_id (mantém user_id)
    op.add_column(
        "bank_connections",
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_bank_connections_company_id", "bank_connections", ["company_id"])

    # ── 4. Remover FKs user_id→users nas tabelas de negócio ───────────────
    # (banco está vazio, então apenas dropamos e recriamos sem FK para users)
    for table in tables_replace_user_id + ["categories", "category_groups"]:
        # Drop a coluna user_id (sem dados, sem risco)
        op.drop_column(table, "user_id")

    # ── 5. Ajustar UniqueConstraints que usavam user_id ────────────────────
    # budgets: dropar índice e constraint (usando SQL condicional para evitar erro se não existir)
    op.execute("DROP INDEX IF EXISTS ix_budgets_recurring_lookup")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_budget_per_category_month_type'
                  AND conrelid = 'budgets'::regclass
            ) THEN
                ALTER TABLE budgets DROP CONSTRAINT uq_budget_per_category_month_type;
            END IF;
        END $$;
    """)
    op.create_unique_constraint(
        "uq_budget_per_category_month_type",
        "budgets",
        ["company_id", "category_id", "month", "is_recurring"],
    )
    op.create_index(
        "ix_budgets_recurring_lookup",
        "budgets",
        ["company_id", "category_id", "month"],
        postgresql_where=sa.text("is_recurring = true"),
    )

    # recurring_transactions: idem
    op.execute("DROP INDEX IF EXISTS ix_recurring_transactions_user_id")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_recurring_tx'
                  AND conrelid = 'recurring_transactions'::regclass
            ) THEN
                ALTER TABLE recurring_transactions DROP CONSTRAINT uq_recurring_tx;
            END IF;
        END $$;
    """)
    op.create_unique_constraint(
        "uq_recurring_tx",
        "recurring_transactions",
        ["company_id", "description", "frequency", "start_date"],
    )


def downgrade() -> None:
    # Recria user_id nas tabelas de negócio e remove company_id
    tables_had_user_id = [
        "accounts", "transactions", "budgets", "goals", "assets",
        "rules", "payees", "payee_mapping", "recurring_transactions",
        "categories", "category_groups",
    ]

    for table in tables_had_user_id:
        op.add_column(
            table,
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id"),
                nullable=True,
            ),
        )
        op.drop_index(f"ix_{table}_company_id", table_name=table)
        op.drop_column(table, "company_id")

    for table in ["categories", "category_groups"]:
        op.drop_column(table, "created_by_user_id")

    op.drop_index("ix_bank_connections_company_id", table_name="bank_connections")
    op.drop_column("bank_connections", "company_id")

    # Restaura constraints com user_id
    op.drop_constraint("uq_budget_per_category_month_type", "budgets", type_="unique")
    op.create_unique_constraint(
        "uq_budget_per_category_month_type",
        "budgets",
        ["user_id", "category_id", "month", "is_recurring"],
    )
    op.drop_constraint("uq_recurring_tx", "recurring_transactions", type_="unique")
    op.create_unique_constraint(
        "uq_recurring_tx",
        "recurring_transactions",
        ["user_id", "description", "frequency", "start_date"],
    )

    op.drop_index("ix_company_members_user_id", table_name="company_members")
    op.drop_index("ix_company_members_company_id", table_name="company_members")
    op.drop_table("company_members")
    op.drop_table("companies")

import uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category_group import CategoryGroup
from app.models.category import Category
from app.models.chart_account import ChartAccount
from app.schemas.chart_of_accounts import ChartOfAccountsRow


class DuplicateChartAccountError(Exception):
    pass


def _norm(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    return s if s else None


async def import_chart_of_accounts(
    session: AsyncSession,
    company_id: uuid.UUID,
    rows: list[ChartOfAccountsRow],
    *,
    skip_duplicates: bool = True,
) -> tuple[int, int, int, int]:
    existing_groups = await session.execute(
        select(CategoryGroup).where(CategoryGroup.company_id == company_id)
    )
    group_by_name: dict[str, CategoryGroup] = {
        g.name.strip().lower(): g for g in existing_groups.scalars().all() if g.name
    }

    existing_categories = await session.execute(
        select(Category).where(Category.company_id == company_id)
    )
    cat_by_key: dict[tuple[Optional[uuid.UUID], str], Category] = {}
    for c in existing_categories.scalars().all():
        if not c.name:
            continue
        cat_by_key[(c.group_id, c.name.strip().lower())] = c

    existing_accounts = await session.execute(
        select(ChartAccount).where(ChartAccount.company_id == company_id)
    )
    acct_keys: set[tuple[uuid.UUID, str]] = set()
    for a in existing_accounts.scalars().all():
        key = (a.category_id, (a.code or a.name).strip().lower())
        acct_keys.add(key)

    group_pos_result = await session.execute(
        select(func.coalesce(func.max(CategoryGroup.position), 0)).where(CategoryGroup.company_id == company_id)
    )
    next_group_position = int(group_pos_result.scalar_one() or 0)

    acct_pos_result = await session.execute(
        select(func.coalesce(func.max(ChartAccount.position), 0)).where(ChartAccount.company_id == company_id)
    )
    next_account_position = int(acct_pos_result.scalar_one() or 0)

    imported_groups = 0
    imported_categories = 0
    imported_accounts = 0
    skipped_accounts = 0

    for row in rows:
        group_name = _norm(row.group_name)
        category_name = _norm(row.category_name)
        account_name = _norm(row.account_name)

        if not category_name:
            raise ValueError("category_name is required")
        if not account_name:
            raise ValueError("account_name is required")

        group_id: Optional[uuid.UUID] = None
        if group_name:
            g_key = group_name.lower()
            group = group_by_name.get(g_key)
            if not group:
                next_group_position += 1
                group = CategoryGroup(
                    company_id=company_id,
                    name=group_name,
                    icon="folder",
                    color="#6B7280",
                    position=next_group_position,
                    is_system=False,
                )
                session.add(group)
                await session.flush()
                group_by_name[g_key] = group
                imported_groups += 1
            group_id = group.id

        c_key = (group_id, category_name.lower())
        category = cat_by_key.get(c_key)
        if not category:
            category = Category(
                company_id=company_id,
                group_id=group_id,
                name=category_name,
                icon="circle-help",
                color="#6B7280",
                is_system=False,
                is_synthetic=True,
            )
            session.add(category)
            await session.flush()
            cat_by_key[c_key] = category
            imported_categories += 1

        acct_key = (category.id, account_name.lower())
        if acct_key in acct_keys:
            if skip_duplicates:
                skipped_accounts += 1
                continue
            raise DuplicateChartAccountError("A chart account already exists")

        next_account_position += 1
        account = ChartAccount(
            company_id=company_id,
            category_id=category.id,
            name=account_name,
            code=_norm(row.code),
            icon=category.icon,
            color=category.color,
            position=next_account_position,
            is_system=False,
        )
        session.add(account)
        acct_keys.add(acct_key)
        imported_accounts += 1

    if imported_groups or imported_categories or imported_accounts:
        await session.commit()

    return imported_groups, imported_categories, imported_accounts, skipped_accounts


async def copy_chart_of_accounts(
    session: AsyncSession,
    target_company_id: uuid.UUID,
    source_company_id: uuid.UUID,
    *,
    skip_duplicates: bool = True,
) -> tuple[int, int, int, int]:
    """Replica grupos, categorias e contas analíticas de outra empresa.

    Preserva código, ícone, cor e ordem dos itens de origem. Itens que já
    existem na empresa de destino (mesmo nome de grupo, mesma categoria dentro
    do grupo, mesma conta dentro da categoria) são reaproveitados; contas
    duplicadas são ignoradas ou geram erro conforme ``skip_duplicates``.
    """
    if source_company_id == target_company_id:
        raise ValueError("source company must be different from target company")

    src_groups = (
        await session.execute(
            select(CategoryGroup)
            .where(CategoryGroup.company_id == source_company_id)
            .order_by(CategoryGroup.position, CategoryGroup.name)
        )
    ).scalars().all()
    src_categories = (
        await session.execute(
            select(Category)
            .where(Category.company_id == source_company_id)
            .order_by(Category.position, Category.code, Category.name)
        )
    ).scalars().all()
    src_accounts = (
        await session.execute(
            select(ChartAccount)
            .where(ChartAccount.company_id == source_company_id)
            .order_by(ChartAccount.position, ChartAccount.code, ChartAccount.name)
        )
    ).scalars().all()

    if not src_categories and not src_accounts:
        raise ValueError("source company has no chart of accounts")

    # Índices do destino, com as mesmas chaves de deduplicação da importação
    existing_groups = await session.execute(
        select(CategoryGroup).where(CategoryGroup.company_id == target_company_id)
    )
    group_by_name: dict[str, CategoryGroup] = {
        g.name.strip().lower(): g for g in existing_groups.scalars().all() if g.name
    }

    existing_categories = await session.execute(
        select(Category).where(Category.company_id == target_company_id)
    )
    cat_by_key: dict[tuple[Optional[uuid.UUID], str], Category] = {}
    for c in existing_categories.scalars().all():
        if c.name:
            cat_by_key[(c.group_id, c.name.strip().lower())] = c

    existing_accounts = await session.execute(
        select(ChartAccount).where(ChartAccount.company_id == target_company_id)
    )
    acct_keys: set[tuple[uuid.UUID, str]] = {
        (a.category_id, (a.code or a.name).strip().lower()) for a in existing_accounts.scalars().all()
    }

    group_pos_result = await session.execute(
        select(func.coalesce(func.max(CategoryGroup.position), 0)).where(CategoryGroup.company_id == target_company_id)
    )
    next_group_position = int(group_pos_result.scalar_one() or 0)
    cat_pos_result = await session.execute(
        select(func.coalesce(func.max(Category.position), 0)).where(Category.company_id == target_company_id)
    )
    next_category_position = int(cat_pos_result.scalar_one() or 0)
    acct_pos_result = await session.execute(
        select(func.coalesce(func.max(ChartAccount.position), 0)).where(ChartAccount.company_id == target_company_id)
    )
    next_account_position = int(acct_pos_result.scalar_one() or 0)

    imported_groups = 0
    imported_categories = 0
    imported_accounts = 0
    skipped_accounts = 0

    # 1. Grupos
    group_map: dict[uuid.UUID, CategoryGroup] = {}
    for sg in src_groups:
        g_name = _norm(sg.name)
        if not g_name:
            continue
        group = group_by_name.get(g_name.lower())
        if not group:
            next_group_position += 1
            group = CategoryGroup(
                company_id=target_company_id,
                name=g_name,
                code=_norm(sg.code),
                icon=sg.icon,
                color=sg.color,
                position=next_group_position,
                is_system=False,
            )
            session.add(group)
            await session.flush()
            group_by_name[g_name.lower()] = group
            imported_groups += 1
        group_map[sg.id] = group

    # 2. Categorias
    category_map: dict[uuid.UUID, Category] = {}
    for sc in src_categories:
        c_name = _norm(sc.name)
        if not c_name:
            continue
        target_group = group_map.get(sc.group_id) if sc.group_id else None
        group_id = target_group.id if target_group else None
        c_key = (group_id, c_name.lower())
        category = cat_by_key.get(c_key)
        if not category:
            next_category_position += 1
            category = Category(
                company_id=target_company_id,
                group_id=group_id,
                name=c_name,
                code=_norm(sc.code),
                icon=sc.icon,
                color=sc.color,
                position=next_category_position,
                is_system=False,
                is_synthetic=sc.is_synthetic,
            )
            session.add(category)
            await session.flush()
            cat_by_key[c_key] = category
            imported_categories += 1
        category_map[sc.id] = category

    # 3. Contas analíticas
    for sa in src_accounts:
        a_name = _norm(sa.name)
        category = category_map.get(sa.category_id)
        if not a_name or not category:
            continue
        acct_key = (category.id, (_norm(sa.code) or a_name).lower())
        if acct_key in acct_keys:
            if skip_duplicates:
                skipped_accounts += 1
                continue
            raise DuplicateChartAccountError("A chart account already exists")

        if not category.is_synthetic:
            category.is_synthetic = True

        next_account_position += 1
        session.add(
            ChartAccount(
                company_id=target_company_id,
                category_id=category.id,
                name=a_name,
                code=_norm(sa.code),
                icon=sa.icon,
                color=sa.color,
                position=next_account_position,
                is_system=False,
            )
        )
        acct_keys.add(acct_key)
        imported_accounts += 1

    if imported_groups or imported_categories or imported_accounts:
        await session.commit()

    return imported_groups, imported_categories, imported_accounts, skipped_accounts

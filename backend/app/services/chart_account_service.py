import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chart_account import ChartAccount
from app.models.category import Category
from app.schemas.chart_account import ChartAccountCreate, ChartAccountUpdate


async def get_chart_accounts(session: AsyncSession, company_id: uuid.UUID) -> list[ChartAccount]:
    result = await session.execute(
        select(ChartAccount)
        .where(ChartAccount.company_id == company_id)
        .order_by(ChartAccount.position, ChartAccount.name)
    )
    return list(result.scalars().all())


async def get_chart_account(session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID) -> Optional[ChartAccount]:
    result = await session.execute(
        select(ChartAccount).where(ChartAccount.id == account_id, ChartAccount.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_chart_account(session: AsyncSession, company_id: uuid.UUID, data: ChartAccountCreate) -> ChartAccount:
    # Validate category exists and is synthetic
    cat_result = await session.execute(
        select(Category).where(Category.id == data.category_id, Category.company_id == company_id)
    )
    category = cat_result.scalar_one_or_none()
    if not category:
        raise ValueError("Category not found")
    if not category.is_synthetic:
        raise ValueError("Cannot add chart account to an analytical category. Category must be synthetic.")

    chart_account = ChartAccount(company_id=company_id, **data.model_dump())
    session.add(chart_account)
    await session.commit()
    await session.refresh(chart_account)
    return chart_account


async def update_chart_account(
    session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID, data: ChartAccountUpdate
) -> Optional[ChartAccount]:
    chart_account = await get_chart_account(session, account_id, company_id)
    if not chart_account:
        return None

    if data.category_id is not None and data.category_id != chart_account.category_id:
        # Validate new category
        cat_result = await session.execute(
            select(Category).where(Category.id == data.category_id, Category.company_id == company_id)
        )
        category = cat_result.scalar_one_or_none()
        if not category:
            raise ValueError("Category not found")
        if not category.is_synthetic:
            raise ValueError("Cannot move chart account to an analytical category. Category must be synthetic.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(chart_account, key, value)

    await session.commit()
    await session.refresh(chart_account)
    return chart_account


async def delete_chart_account(session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID) -> bool:
    chart_account = await get_chart_account(session, account_id, company_id)
    if not chart_account or chart_account.is_system:
        return False

    await session.delete(chart_account)
    await session.commit()
    return True

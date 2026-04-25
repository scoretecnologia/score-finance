import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.category import Category
from app.models.category_group import CategoryGroup
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetUpdate, BudgetVsActual
from app.services.admin_service import get_credit_card_accounting_mode
from app.services.dashboard_service import _get_recurring_projections
from app.services.fx_rate_service import convert
from app.core.config import get_settings


def _primary_amount_expr():
    """Amount in primary currency: uses amount_primary when available, falls back to amount."""
    return func.coalesce(Transaction.amount_primary, Transaction.amount)


async def _build_budget_map(
    session: AsyncSession, company_id: uuid.UUID, month_start: date
) -> dict[str, tuple[Decimal, bool]]:
    """Build a map of chart_account_id -> (amount, is_recurring) for the given month.

    Resolution order:
    1. Month-specific override (is_recurring=false, month=M) takes priority
    2. Most recent recurring default (is_recurring=true, month<=M) as fallback
    """
    budget_map: dict[str, tuple[Decimal, bool]] = {}

    # Query 1: Get effective recurring defaults (most recent per account where month <= M)
    max_month_subq = (
        select(
            Budget.chart_account_id,
            func.max(Budget.month).label("max_month"),
        )
        .where(
            Budget.company_id == company_id,
            Budget.is_recurring == True,  # noqa: E712
            Budget.month <= month_start,
            Budget.chart_account_id.isnot(None),
        )
        .group_by(Budget.chart_account_id)
        .subquery()
    )

    recurring_result = await session.execute(
        select(Budget)
        .join(
            max_month_subq,
            and_(
                Budget.chart_account_id == max_month_subq.c.chart_account_id,
                Budget.month == max_month_subq.c.max_month,
            ),
        )
        .where(
            Budget.company_id == company_id,
            Budget.is_recurring == True,  # noqa: E712
        )
    )
    for b in recurring_result.scalars().all():
        budget_map[str(b.chart_account_id)] = (b.amount, True)

    # Query 2: Month-specific overrides
    overrides_result = await session.execute(
        select(Budget).where(
            Budget.company_id == company_id,
            Budget.is_recurring == False,  # noqa: E712
            Budget.month == month_start,
            Budget.chart_account_id.isnot(None),
        )
    )
    for b in overrides_result.scalars().all():
        budget_map[str(b.chart_account_id)] = (b.amount, False)

    return budget_map


async def get_budgets(
    session: AsyncSession, company_id: uuid.UUID, month: Optional[date] = None
) -> list[Budget]:
    if not month:
        query = select(Budget).where(Budget.company_id == company_id)
        result = await session.execute(query.order_by(Budget.month.desc()))
        return list(result.scalars().all())

    month_start = month.replace(day=1)

    # Get month-specific overrides
    overrides_result = await session.execute(
        select(Budget).where(
            Budget.company_id == company_id,
            Budget.is_recurring == False,  # noqa: E712
            Budget.month == month_start,
        )
    )
    overrides = list(overrides_result.scalars().all())
    override_category_ids = {str(b.category_id) for b in overrides}

    # Get effective recurring defaults for this month
    max_month_subq = (
        select(
            Budget.category_id,
            func.max(Budget.month).label("max_month"),
        )
        .where(
            Budget.company_id == company_id,
            Budget.is_recurring == True,  # noqa: E712
            Budget.month <= month_start,
        )
        .group_by(Budget.category_id)
        .subquery()
    )

    recurring_result = await session.execute(
        select(Budget)
        .join(
            max_month_subq,
            and_(
                Budget.category_id == max_month_subq.c.category_id,
                Budget.month == max_month_subq.c.max_month,
            ),
        )
        .where(
            Budget.company_id == company_id,
            Budget.is_recurring == True,  # noqa: E712
        )
    )
    recurring = [
        b for b in recurring_result.scalars().all()
        if str(b.category_id) not in override_category_ids
    ]

    return sorted(overrides + recurring, key=lambda b: b.month, reverse=True)


async def get_budget(
    session: AsyncSession, budget_id: uuid.UUID, company_id: uuid.UUID
) -> Optional[Budget]:
    result = await session.execute(
        select(Budget).where(Budget.id == budget_id, Budget.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_budget(
    session: AsyncSession, company_id: uuid.UUID, data: BudgetCreate
) -> Budget:
    budget = Budget(
        company_id=company_id,
        category_id=data.category_id,
        chart_account_id=data.chart_account_id,
        amount=data.amount,
        month=data.month.replace(day=1),
        is_recurring=data.is_recurring,
    )
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return budget


async def update_budget(
    session: AsyncSession, budget_id: uuid.UUID, company_id: uuid.UUID, data: BudgetUpdate
) -> Optional[Budget]:
    budget = await get_budget(session, budget_id, company_id)
    if not budget:
        return None

    if budget.is_recurring and data.effective_month:
        effective = data.effective_month.replace(day=1)
        if effective != budget.month:
            # Create a new recurring record with new effective-from month
            new_budget = Budget(
                company_id=budget.company_id,
                category_id=budget.category_id,
                amount=data.amount if data.amount is not None else budget.amount,
                month=effective,
                is_recurring=True,
            )
            session.add(new_budget)
            await session.commit()
            await session.refresh(new_budget)
            return new_budget

    # Update in place (non-recurring, or same effective-from month)
    for key, value in data.model_dump(exclude_unset=True, exclude={"effective_month"}).items():
        setattr(budget, key, value)

    await session.commit()
    await session.refresh(budget)
    return budget


async def delete_budget(
    session: AsyncSession, budget_id: uuid.UUID, company_id: uuid.UUID
) -> bool:
    budget = await get_budget(session, budget_id, company_id)
    if not budget:
        return False

    await session.delete(budget)
    await session.commit()
    return True


async def get_budget_vs_actual(
    session: AsyncSession, company_id: uuid.UUID, month: Optional[date] = None
) -> list[BudgetVsActual]:
    if not month:
        month = date.today().replace(day=1)

    month_start = month.replace(day=1)
    if month.month == 12:
        month_end = month.replace(year=month.year + 1, month=1, day=1)
    else:
        month_end = month.replace(month=month.month + 1, day=1)

    # Previous month range
    if month_start.month == 1:
        prev_month_start = month_start.replace(year=month_start.year - 1, month=12)
    else:
        prev_month_start = month_start.replace(month=month_start.month - 1)
    prev_month_end = month_start

    # Get all chart accounts for this user with their categories and groups
    from app.models.chart_account import ChartAccount
    stmt = (
        select(ChartAccount, Category, CategoryGroup)
        .join(Category, ChartAccount.category_id == Category.id)
        .outerjoin(CategoryGroup, Category.group_id == CategoryGroup.id)
        .where(ChartAccount.company_id == company_id)
    )
    res = await session.execute(stmt)
    all_accounts = res.all()

    if not all_accounts:
        return []

    # Get budgets for this month (with recurring resolution)
    budget_map = await _build_budget_map(session, company_id, month_start)

    # Get user's primary currency
    user = await session.get(User, company_id)
    primary_currency = user.primary_currency if user else get_settings().default_currency
    accounting_mode = await get_credit_card_accounting_mode(session)
    report_date = (
        Transaction.effective_date if accounting_mode == "accrual" else Transaction.date
    )

    # Get actual spending by chart account for this month
    spending_result = await session.execute(
        select(
            Transaction.chart_account_id,
            func.sum(_primary_amount_expr()),
        )
        .where(
            Transaction.company_id == company_id,
            Transaction.type == "debit",
            report_date >= month_start,
            report_date < month_end,
            Transaction.chart_account_id.isnot(None),
            Transaction.transfer_pair_id.is_(None),
        )
        .group_by(Transaction.chart_account_id)
    )
    spending_map: dict[str, Decimal] = {}
    for row in spending_result.all():
        spending_map[str(row[0])] = abs(row[1] or Decimal("0"))

    # Get previous month spending by chart account
    prev_spending_result = await session.execute(
        select(
            Transaction.chart_account_id,
            func.sum(_primary_amount_expr()),
        )
        .where(
            Transaction.company_id == company_id,
            Transaction.type == "debit",
            report_date >= prev_month_start,
            report_date < prev_month_end,
            Transaction.chart_account_id.isnot(None),
            Transaction.transfer_pair_id.is_(None),
        )
        .group_by(Transaction.chart_account_id)
    )
    prev_spending_map: dict[str, Decimal] = {}
    for row in prev_spending_result.all():
        prev_spending_map[str(row[0])] = abs(row[1] or Decimal("0"))

    comparisons = []
    for chart_acc, category, group in all_accounts:
        acc_id = str(chart_acc.id)
        actual = spending_map.get(acc_id, Decimal("0"))
        prev_actual = prev_spending_map.get(acc_id, Decimal("0"))
        budget_entry = budget_map.get(acc_id)
        budget_amount = budget_entry[0] if budget_entry else None
        is_recurring = budget_entry[1] if budget_entry else False

        # Skip accounts with no spending and no budget
        if actual == 0 and prev_actual == 0 and budget_amount is None:
            continue

        percentage = None
        if budget_amount and budget_amount > 0:
            percentage = round(float(actual / budget_amount * 100), 1)

        comparisons.append(BudgetVsActual(
            chart_account_id=chart_acc.id,
            category_id=category.id,
            category_name=chart_acc.name, # Use analytical account name
            category_icon=chart_acc.icon,
            category_color=chart_acc.color,
            group_id=group.id if group else None,
            group_name=group.name if group else None,
            budget_amount=budget_amount,
            actual_amount=actual,
            prev_month_amount=prev_actual,
            percentage_used=percentage,
            is_recurring=is_recurring,
        ))

    return sorted(comparisons, key=lambda x: float(x.actual_amount), reverse=True)

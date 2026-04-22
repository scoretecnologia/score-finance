from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, SpendingByCategory, MonthlyTrend, ProjectedTransaction, BalanceHistory
from app.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    month: Optional[date] = Query(None),
    balance_date: Optional[date] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await dashboard_service.get_summary(session, user.id, month, balance_date)


@router.get("/spending-by-category", response_model=list[SpendingByCategory])
async def get_spending_by_category(
    month: Optional[date] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await dashboard_service.get_spending_by_category(session, user.id, month)


@router.get("/monthly-trend", response_model=list[MonthlyTrend])
async def get_monthly_trend(
    months: int = Query(6, ge=1, le=12),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await dashboard_service.get_monthly_trend(session, user.id, months)


@router.get("/balance-history", response_model=BalanceHistory)
async def get_balance_history(
    month: Optional[date] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await dashboard_service.get_balance_history(session, user.id, month)


@router.get("/projected-transactions", response_model=list[ProjectedTransaction])
async def get_projected_transactions(
    month: Optional[date] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await dashboard_service.get_projected_transactions(session, user.id, month)

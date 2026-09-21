from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.tenant import get_current_company
from app.models.company import Company
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.report import ReportResponse
from app.schemas.dre import DREResponse, DREDrilldownResponse
from app.services import report_service, dre_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/net-worth", response_model=ReportResponse)
async def get_net_worth(
    months: int = Query(12, ge=1, le=24),
    interval: str = Query("monthly", pattern="^(daily|weekly|monthly|yearly)$"),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await report_service.get_net_worth_report(
        session, company.id, months, interval, user.primary_currency
    )


@router.get("/income-expenses", response_model=ReportResponse)
async def get_income_expenses(
    months: int = Query(12, ge=1, le=24),
    interval: str = Query("monthly", pattern="^(daily|weekly|monthly|yearly)$"),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await report_service.get_income_expenses_report(
        session, company.id, months, interval, user.primary_currency
    )


@router.get("/dre", response_model=DREResponse)
async def get_dre(
    year: int = Query(2026, ge=2000, le=2100),
    regime: str = Query("competencia", pattern="^(competencia|caixa)$"),
    cost_center_id: Optional[uuid.UUID] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await dre_service.get_dre_data(
        session=session,
        company_id=company.id,
        year=year,
        regime=regime,
        cost_center_id=cost_center_id,
    )


@router.get("/dre/drilldown", response_model=DREDrilldownResponse)
async def get_dre_drilldown(
    row_key: str = Query(..., description="Chave da linha na árvore da DRE"),
    year: int = Query(2026, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    regime: str = Query("caixa", pattern="^(competencia|caixa)$"),
    cost_center_id: Optional[uuid.UUID] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await dre_service.get_dre_drilldown(
        session=session,
        company_id=company.id,
        year=year,
        row_key=row_key,
        month=month,
        regime=regime,
        cost_center_id=cost_center_id,
    )



import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.tenant import get_current_company
from app.models.company import Company
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.chart_account import ChartAccountCreate, ChartAccountRead, ChartAccountUpdate
from app.services import chart_account_service

router = APIRouter(prefix="/api/chart-accounts", tags=["chart-accounts"])


@router.get("", response_model=list[ChartAccountRead])
async def list_chart_accounts(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await chart_account_service.get_chart_accounts(session, company.id)


@router.post("", response_model=ChartAccountRead, status_code=status.HTTP_201_CREATED)
async def create_chart_account(
    data: ChartAccountCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    try:
        return await chart_account_service.create_chart_account(session, company.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{account_id}", response_model=ChartAccountRead)
async def update_chart_account(
    account_id: uuid.UUID,
    data: ChartAccountUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    try:
        chart_account = await chart_account_service.update_chart_account(session, account_id, company.id, data)
        if not chart_account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart account not found")
        return chart_account
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chart_account(
    account_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    deleted = await chart_account_service.delete_chart_account(session, account_id, company.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chart account not found or is a system account",
        )

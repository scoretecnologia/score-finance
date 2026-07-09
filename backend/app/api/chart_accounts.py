import uuid

from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.tenant import get_current_company, require_role
from app.models.company import Company
from app.models.transaction import Transaction
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.chart_account import (
    BulkChartAccountDeleteRequest,
    BulkChartAccountDeleteResult,
    BulkChartAccountBlockedItem,
    BulkChartAccountUpdateRequest,
    BulkChartAccountUpdateResult,
    ChartAccountCreate,
    ChartAccountRead,
    ChartAccountUpdate,
)
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
    company: Company = Depends(require_role("owner", "admin")),
):
    try:
        return await chart_account_service.create_chart_account(session, company.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/bulk-delete", response_model=BulkChartAccountDeleteResult)
async def bulk_delete_chart_accounts(
    data: BulkChartAccountDeleteRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin")),
):
    from app.models.chart_account import ChartAccount

    result = await session.execute(
        select(ChartAccount).where(
            ChartAccount.id.in_(data.ids),
            ChartAccount.company_id == company.id,
        )
    )
    accounts = result.scalars().all()

    # Check which accounts have linked transactions
    tx_result = await session.execute(
        select(Transaction.chart_account_id).where(
            Transaction.chart_account_id.in_(data.ids),
            Transaction.company_id == company.id,
        )
    )
    linked_ids = {row[0] for row in tx_result.all()}

    deleted: list[uuid.UUID] = []
    blocked: list[BulkChartAccountBlockedItem] = []

    for acc in accounts:
        if acc.is_system:
            blocked.append(BulkChartAccountBlockedItem(
                id=acc.id, name=acc.name, reason="Conta do sistema não pode ser excluída"
            ))
        elif acc.id in linked_ids:
            blocked.append(BulkChartAccountBlockedItem(
                id=acc.id, name=acc.name,
                reason="Possui lançamentos vinculados. Desvincule antes de excluir."
            ))
        else:
            await session.delete(acc)
            deleted.append(acc.id)

    await session.commit()
    return BulkChartAccountDeleteResult(deleted=deleted, blocked=blocked)


@router.patch("/bulk-update", response_model=BulkChartAccountUpdateResult)
async def bulk_update_chart_accounts(
    data: BulkChartAccountUpdateRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin")),
):
    from app.models.chart_account import ChartAccount

    values = {}
    if data.icon is not None:
        values["icon"] = data.icon
    if data.color is not None:
        values["color"] = data.color
    if not values:
        return BulkChartAccountUpdateResult(updated=0)

    result = await session.execute(
        update(ChartAccount)
        .where(
            ChartAccount.id.in_(data.ids),
            ChartAccount.company_id == company.id,
        )
        .values(**values)
    )
    await session.commit()
    return BulkChartAccountUpdateResult(updated=result.rowcount)


@router.patch("/{account_id}", response_model=ChartAccountRead)
async def update_chart_account(
    account_id: uuid.UUID,
    data: ChartAccountUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin")),
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
    company: Company = Depends(require_role("owner", "admin")),
):
    deleted = await chart_account_service.delete_chart_account(session, account_id, company.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chart account not found or is a system account",
        )

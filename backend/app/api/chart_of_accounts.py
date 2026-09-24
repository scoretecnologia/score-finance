from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.database import get_async_session
from app.core.tenant import get_current_company, require_role
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.models.user import User
from app.schemas.chart_of_accounts import (
    ChartOfAccountsCopyRequest,
    ChartOfAccountsImportRequest,
    ChartOfAccountsImportResult,
)
from app.services import chart_of_accounts_service
from app.services.chart_of_accounts_service import DuplicateChartAccountError

router = APIRouter(prefix="/api/chart-of-accounts", tags=["chart-of-accounts"])


@router.post("/import", response_model=ChartOfAccountsImportResult)
async def import_chart_of_accounts(
    payload: ChartOfAccountsImportRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    try:
        (
            imported_groups,
            imported_categories,
            imported_accounts,
            skipped_accounts,
        ) = await chart_of_accounts_service.import_chart_of_accounts(
            session,
            company.id,
            payload.rows,
            skip_duplicates=payload.skip_duplicates,
        )
        return {
            "imported_groups": imported_groups,
            "imported_categories": imported_categories,
            "imported_accounts": imported_accounts,
            "skipped_accounts": skipped_accounts,
        }
    except DuplicateChartAccountError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/copy", response_model=ChartOfAccountsImportResult)
async def copy_chart_of_accounts(
    payload: ChartOfAccountsCopyRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin")),
):
    """Copia o plano de contas de outra empresa da qual o usuário também é membro."""
    if payload.source_company_id == company.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A empresa de origem deve ser diferente da empresa atual.",
        )

    if not user.is_superuser:
        membership = await session.execute(
            select(CompanyMember).where(
                CompanyMember.company_id == payload.source_company_id,
                CompanyMember.user_id == user.id,
                CompanyMember.accepted_at.is_not(None),
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você não tem acesso à empresa de origem.",
            )

    source = await session.execute(
        select(Company).where(Company.id == payload.source_company_id, Company.is_active == True)  # noqa: E712
    )
    if source.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa de origem não encontrada.")

    try:
        (
            imported_groups,
            imported_categories,
            imported_accounts,
            skipped_accounts,
        ) = await chart_of_accounts_service.copy_chart_of_accounts(
            session,
            company.id,
            payload.source_company_id,
            skip_duplicates=payload.skip_duplicates,
        )
    except DuplicateChartAccountError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {
        "imported_groups": imported_groups,
        "imported_categories": imported_categories,
        "imported_accounts": imported_accounts,
        "skipped_accounts": skipped_accounts,
    }

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.database import get_async_session
from app.core.tenant import get_current_company
from app.models.company import Company
from app.models.user import User
from app.schemas.chart_of_accounts import ChartOfAccountsImportRequest, ChartOfAccountsImportResult
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


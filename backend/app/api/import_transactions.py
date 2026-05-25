import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.tenant import get_current_company
from app.models.company import Company
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.transaction import TransactionImportPreview, TransactionImportRequest
from app.services import import_service
from app.services import account_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transactions", tags=["import"])


@router.post("/import/preview", response_model=TransactionImportPreview)
async def preview_import(
    file: UploadFile = File(...),
    date_format: Optional[str] = Form(None),
    flip_amount: bool = Form(False),
    inflow_column: Optional[str] = Form(None),
    outflow_column: Optional[str] = Form(None),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    content = await file.read()
    filename = file.filename or ""

    logger.info(
        "Import preview requested: filename=%s, size=%d bytes, content_type=%s",
        filename, len(content), file.content_type,
    )

    try:
        if filename.lower().endswith('.ofx') or filename.lower().endswith('.qfx'):
            transactions = import_service.parse_ofx(content)
            detected_format = "ofx"
        elif filename.lower().endswith('.qif'):
            transactions = import_service.parse_qif(content)
            detected_format = "qif"
        elif filename.lower().endswith('.xml') or filename.lower().endswith('.camt'):
            transactions = import_service.parse_camt(content)
            detected_format = "camt"
        elif filename.lower().endswith('.csv'):
            transactions = import_service.parse_csv(
                content,
                date_format=date_format,
                flip_amount=flip_amount,
                inflow_column=inflow_column,
                outflow_column=outflow_column,
            )
            detected_format = "csv"
        elif filename.lower().endswith('.xls') or filename.lower().endswith('.xlsx'):
            transactions = import_service.parse_excel(
                content,
                date_format=date_format,
                flip_amount=flip_amount,
                inflow_column=inflow_column,
                outflow_column=outflow_column,
            )
            detected_format = "excel"
        else:
            # Try to detect format
            try:
                transactions = import_service.parse_ofx(content)
                detected_format = "ofx"
            except Exception:
                try:
                    transactions = import_service.parse_qif(content)
                    detected_format = "qif"
                except Exception:
                    try:
                        transactions = import_service.parse_camt(content)
                        detected_format = "camt"
                    except Exception:
                        try:
                            transactions = import_service.parse_excel(
                                content,
                                date_format=date_format,
                                flip_amount=flip_amount,
                                inflow_column=inflow_column,
                                outflow_column=outflow_column,
                            )
                            detected_format = "excel"
                        except Exception:
                            transactions = import_service.parse_csv(content)
                            detected_format = "csv"
    except Exception as e:
        logger.error(
            "Failed to parse import file: filename=%s, size=%d bytes, "
            "content_type=%s, first_100_bytes=%r, error=%s",
            filename, len(content), file.content_type,
            content[:100], e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse file: {str(e)}",
        )

    logger.info(
        "Import preview parsed: filename=%s, format=%s, transactions=%d",
        filename, detected_format, len(transactions),
    )

    return TransactionImportPreview(transactions=transactions, detected_format=detected_format)


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_transactions(
    data: TransactionImportRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    # Verify account belongs to user
    account = await account_service.get_account(session, data.account_id, company.id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    imported, skipped, import_log_id = await import_service.import_transactions(
        session, company.id, data.account_id, data.transactions, "import",
        filename=data.filename, detected_format=data.detected_format,
    )

    return {"imported": imported, "skipped": skipped, "import_log_id": str(import_log_id)}


@router.post("/import/stream")
async def import_transactions_stream(
    data: TransactionImportRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    """Import transactions with real-time progress via Server-Sent Events."""
    # Verify account belongs to user
    account = await account_service.get_account(session, data.account_id, company.id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    async def event_generator():
        try:
            async for progress in import_service.import_transactions_streamed(
                session, company.id, data.account_id, data.transactions, "import",
                filename=data.filename, detected_format=data.detected_format,
            ):
                yield f"data: {json.dumps(progress)}\n\n"
        except Exception as e:
            logger.error("Streaming import error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'phase': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/import/check-duplicates", response_model=list[bool])
async def check_import_duplicates(
    data: TransactionImportRequest,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    from sqlalchemy import select
    from app.models.transaction import Transaction

    account = await account_service.get_account(session, data.account_id, company.id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    results = []
    for txn_data in data.transactions:
        if txn_data.external_id:
            existing = await session.execute(
                select(Transaction.id).where(
                    Transaction.account_id == data.account_id,
                    Transaction.external_id == txn_data.external_id,
                ).limit(1)
            )
        else:
            existing = await session.execute(
                select(Transaction.id).where(
                    Transaction.account_id == data.account_id,
                    Transaction.date == txn_data.date,
                    Transaction.amount == txn_data.amount,
                    Transaction.type == txn_data.type,
                    Transaction.description == txn_data.description,
                ).limit(1)
            )
        
        # Using first() instead of scalar_one_or_none() to avoid MultipleResultsFound crashes
        if existing.scalars().first():
            results.append(True)
        else:
            results.append(False)

    return results

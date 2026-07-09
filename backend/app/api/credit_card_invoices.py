import uuid
from typing import List, Optional, Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.core.auth import current_active_user
from app.models.company import Company
from app.models.category import Category
from app.models.credit_card_invoice import CreditCardInvoice
from app.models.user import User
from app.core.tenant import get_current_company, require_role
from app.schemas.credit_card_invoice import CreditCardInvoice as CreditCardInvoiceSchema

router = APIRouter()


@router.get("", response_model=List[CreditCardInvoiceSchema])
async def get_invoices(
    account_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    query = select(CreditCardInvoice).options(selectinload(CreditCardInvoice.account)).where(CreditCardInvoice.company_id == company.id)
    
    if account_id:
        query = query.where(CreditCardInvoice.account_id == account_id)
    if status:
        query = query.where(CreditCardInvoice.status == status)
        
    query = query.order_by(CreditCardInvoice.month_reference.desc())
    
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/{invoice_id}", response_model=CreditCardInvoiceSchema)
async def get_invoice(
    invoice_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    query = select(CreditCardInvoice).where(
        CreditCardInvoice.id == invoice_id,
        CreditCardInvoice.company_id == company.id
    )
    result = await session.execute(query)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        
    return invoice

from app.schemas.transaction import TransactionRead

@router.get("/{invoice_id}/transactions", response_model=List[TransactionRead])
async def get_invoice_transactions(
    invoice_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    from app.models.transaction import Transaction
    query_inv = select(CreditCardInvoice.id).where(
        CreditCardInvoice.id == invoice_id,
        CreditCardInvoice.company_id == company.id
    )
    result_inv = await session.execute(query_inv)
    if not result_inv.scalar_one_or_none():
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    query = (
        select(Transaction)
        .options(
            selectinload(Transaction.category).selectinload(Category.chart_accounts),
            selectinload(Transaction.chart_account),
            selectinload(Transaction.cost_center),
        )
        .where(
            Transaction.invoice_id == invoice_id,
            Transaction.company_id == company.id
        )
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    )
    
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/{invoice_id}/recalculate", response_model=CreditCardInvoiceSchema)
async def recalculate_invoice(
    invoice_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin", "member")),
):
    from app.services.credit_card_invoice_service import recalculate_invoice_paid_amount
    from fastapi import HTTPException, status as http_status

    # Verify invoice belongs to company
    query_inv = select(CreditCardInvoice).where(
        CreditCardInvoice.id == invoice_id,
        CreditCardInvoice.company_id == company.id
    )
    result_inv = await session.execute(query_inv)
    invoice = result_inv.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    await recalculate_invoice_paid_amount(session, invoice_id)
    await session.commit()
    await session.refresh(invoice)
    return invoice

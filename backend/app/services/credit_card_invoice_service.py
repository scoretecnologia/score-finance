import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit_card_invoice import CreditCardInvoice
from app.models.transaction import Transaction


async def recalculate_invoice_paid_amount(session: AsyncSession, invoice_id: uuid.UUID) -> None:
    """
    Recalculates the total_amount, paid_amount, transaction_count and status of a CreditCardInvoice.
    If the invoice has no transactions left, it deletes the invoice.
    """
    # Get the invoice
    invoice_result = await session.execute(
        select(CreditCardInvoice).where(CreditCardInvoice.id == invoice_id)
    )
    invoice = invoice_result.scalar_one_or_none()
    
    if not invoice:
        return
        
    # Get transaction stats for this invoice
    # total_amount: sum of credit transactions
    # paid_amount: sum of debit transactions
    # count: total transactions
    stats_result = await session.execute(
        select(
            func.count(Transaction.id),
            func.sum(Transaction.amount).filter(Transaction.type == "credit"),
            func.sum(Transaction.amount).filter(Transaction.type == "debit")
        ).where(Transaction.invoice_id == invoice_id)
    )
    count, total_amount, paid_amount = stats_result.one()
    
    count = count or 0
    
    if count == 0:
        await session.delete(invoice)
        return
        
    invoice.transaction_count = count
    invoice.total_amount = total_amount or Decimal('0.00')
    invoice.paid_amount = paid_amount or Decimal('0.00')
    
    if invoice.paid_amount >= invoice.total_amount and invoice.total_amount > 0:
        invoice.status = "PAID"
    elif invoice.paid_amount > 0:
        invoice.status = "PARTIALLY_PAID"
    else:
        invoice.status = "OPEN"

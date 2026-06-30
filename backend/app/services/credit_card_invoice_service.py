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
        
    # Get all transactions linked to this invoice
    tx_result = await session.execute(
        select(Transaction).where(Transaction.invoice_id == invoice_id)
    )
    txs = tx_result.scalars().all()
    
    count = len(txs)
    
    if count == 0:
        await session.delete(invoice)
        await session.flush()
        return
    
    total_amount = Decimal('0.00')
    paid_amount = Decimal('0.00')
    
    for tx in txs:
        # Transactions on the same account as the invoice:
        #   debit  = expense (purchase on the card)
        #   credit = payment (refund/payment credited to the card)
        # Transactions from other accounts:
        #   always treated as payments (money transferred TO the card)
        if tx.account_id == invoice.account_id:
            if tx.type == "debit":
                total_amount += tx.amount
            else:
                paid_amount += tx.amount
        else:
            paid_amount += tx.amount
    
    invoice.transaction_count = count
    invoice.total_amount = total_amount
    invoice.paid_amount = paid_amount
    
    if invoice.paid_amount >= invoice.total_amount and invoice.total_amount > 0:
        invoice.status = "PAID"
    elif invoice.paid_amount > 0:
        invoice.status = "PARTIALLY_PAID"
    else:
        invoice.status = "OPEN"

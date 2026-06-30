import asyncio
import os
import sys
from sqlalchemy import select, delete, func

# Add the backend directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import async_session_maker
from app.models.credit_card_invoice import CreditCardInvoice
from app.models.transaction import Transaction
from app.services.credit_card_invoice_service import recalculate_invoice_paid_amount

async def cleanup():
    print("Starting deep cleanup of ALL credit card invoices...")
    async with async_session_maker() as session:
        # Get all invoices
        stmt = select(CreditCardInvoice.id)
        result = await session.execute(stmt)
        invoice_ids = result.scalars().all()
        
        print(f"Found {len(invoice_ids)} total invoices. Checking their actual transaction count...")
        
        deleted_count = 0
        updated_count = 0
        for inv_id in invoice_ids:
            # Check actual transaction count
            count_stmt = select(func.count(Transaction.id)).where(Transaction.invoice_id == inv_id)
            count_res = await session.execute(count_stmt)
            actual_count = count_res.scalar()
            
            if actual_count == 0:
                print(f"Invoice {inv_id} has 0 actual transactions. Deleting...")
                # Delete it directly
                del_stmt = delete(CreditCardInvoice).where(CreditCardInvoice.id == inv_id)
                await session.execute(del_stmt)
                deleted_count += 1
            else:
                # Force recalculate to fix any wrong amounts (due to previous bug)
                await recalculate_invoice_paid_amount(session, inv_id)
                updated_count += 1
                
        await session.commit()
        
        print(f"Successfully deleted {deleted_count} orphaned invoices.")
        print(f"Successfully recalculated {updated_count} valid invoices.")

if __name__ == "__main__":
    asyncio.run(cleanup())

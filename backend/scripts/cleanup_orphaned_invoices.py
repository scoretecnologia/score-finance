import asyncio
import os
import sys
from sqlalchemy import select, delete

# Add the backend directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import async_session_maker
from app.models.credit_card_invoice import CreditCardInvoice

async def cleanup():
    print("Starting cleanup of orphaned credit card invoices...")
    async with async_session_maker() as session:
        # Find all invoices with transaction_count = 0
        stmt = select(CreditCardInvoice).where(CreditCardInvoice.transaction_count == 0)
        result = await session.execute(stmt)
        orphaned_invoices = result.scalars().all()
        
        count = len(orphaned_invoices)
        if count == 0:
            print("No orphaned invoices found.")
            return

        print(f"Found {count} orphaned invoices. Deleting...")
        
        # Delete them
        delete_stmt = delete(CreditCardInvoice).where(CreditCardInvoice.transaction_count == 0)
        await session.execute(delete_stmt)
        await session.commit()
        
        print(f"Successfully deleted {count} orphaned invoices.")

if __name__ == "__main__":
    asyncio.run(cleanup())

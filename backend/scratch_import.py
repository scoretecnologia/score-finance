import asyncio
from decimal import Decimal
import uuid
from datetime import date
from app.core.database import async_session_maker
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionBase
from app.services.import_service import import_transactions

async def test():
    async with async_session_maker() as session:
        # Get an account and company
        from app.models.account import Account
        from sqlalchemy import select
        account = (await session.execute(select(Account).limit(1))).scalar_one_or_none()
        if not account:
            print("No account found")
            return
            
        company_id = account.company_id
        
        txn_data = TransactionBase(
            description="Test Duplicate",
            amount=Decimal("10.00"),
            date=date.today(),
            type="credit",
            external_id="ext-12345"
        )
        
        # Import once
        imp1, skip1, log_id1 = await import_transactions(
            session, account.company_id, account.id, [txn_data], "ofx"
        )
        print(f"First import: imported={imp1}, skipped={skip1}")
        
        # Import again
        imp2, skip2, log_id2 = await import_transactions(
            session, account.company_id, account.id, [txn_data], "ofx"
        )
        print(f"Second import: imported={imp2}, skipped={skip2}")

if __name__ == "__main__":
    asyncio.run(test())

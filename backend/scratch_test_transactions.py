
import asyncio
import uuid
import sys
import os

# Add the current directory to sys.path so we can import 'app'
sys.path.append(os.getcwd())

from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings
from app.services import transaction_service
from app.models.company import Company
from sqlalchemy import select

async def main():
    settings = get_settings()
    # Update DB URL to work from outside Docker if needed
    db_url = settings.database_url
    if "db:5432" in db_url:
        db_url = db_url.replace("db:5432", "localhost:5432")
    
    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Get a company_id from the database
        res = await session.execute(select(Company).limit(1))
        company = res.scalar_one_or_none()
        if not company:
            print("No company found")
            return
        
        print(f"Testing with company_id: {company.id}")
        try:
            transactions, total = await transaction_service.get_transactions(
                session, company.id, page=1, limit=20
            )
            print(f"Success! Found {len(transactions)} transactions, total {total}")
            for tx in transactions[:5]:
                print(f"Transaction: {tx.id}, Category: {tx.category.name if tx.category else 'None'}")
                if tx.category:
                    # Accessing chart_accounts to trigger lazy loading if selectinload failed
                    print(f"  Chart Accounts: {len(tx.category.chart_accounts)}")
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

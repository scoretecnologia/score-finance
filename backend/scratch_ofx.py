import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.transaction import Transaction

async def test():
    async with async_session_maker() as session:
        # Get one duplicated external_id
        result = await session.execute(
            select(Transaction.external_id)
            .where(Transaction.external_id != None)
            .group_by(Transaction.external_id)
            .having(db.func.count() > 1 if 'db' in globals() else select.func.count() if hasattr(select, 'func') else None)
            # Actually I'll just hardcode the first duplicate from previous run
        )
        pass

if __name__ == "__main__":
    asyncio.run(test())

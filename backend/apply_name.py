import asyncio
from app.core.database import async_engine
from sqlalchemy import text

async def add_column():
    async with async_engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(255);"))
            print("Column added successfully!")
        except Exception as e:
            print(f"Already exists or error: {e}")

if __name__ == '__main__':
    asyncio.run(add_column())

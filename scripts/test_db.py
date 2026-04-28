import asyncio
import os
import sys
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Adicionar o diretório raiz ao sys.path para importar app
sys.path.append(os.getcwd())

async def test_connection():
    # Tenta ler do backend/.env manualmente se necessário
    db_url = None
    env_path = os.path.join("backend", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip()
    
    if not db_url:
        print("❌ Erro: DATABASE_URL não encontrada no backend/.env")
        return

    print(f"--- Testando conexão com: {db_url[:30]}... ---")
    
    try:
        engine = create_async_engine(db_url, connect_args={"statement_cache_size": 0})
        async_session = async_sessionmaker(engine, class_=AsyncSession)
        
        async with async_session() as session:
            # Teste simples de query
            from app.models.user import User
            result = await session.execute(select(func.count(User.id)))
            count = result.scalar()
            print(f"✅ Conexão bem sucedida!")
            print(f"📊 Total de usuários encontrados na tabela 'user': {count}")
            
            if count == 0:
                print("⚠️  Aviso: O banco está conectado, mas a tabela de usuários está VAZIA.")
                print("Isso explica por que o sistema abre no /setup.")
            else:
                print("🚀 O sistema deveria estar abrindo no /login.")
                
    except Exception as e:
        print(f"❌ Erro ao conectar ao banco de dados: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())

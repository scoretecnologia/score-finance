import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select

from app.worker import celery_app
from app.core.database import async_session_maker
from app.models.bank_connection import BankConnection
from app.services import connection_service

logger = logging.getLogger(__name__)

STALE_THRESHOLD = timedelta(hours=4)


async def _sync_all() -> int:
    """Find stale connections and sync each one."""
    cutoff = datetime.now(timezone.utc) - STALE_THRESHOLD
    synced = 0

    async with async_session_maker() as session:
        result = await session.execute(
            select(BankConnection.id, BankConnection.user_id, BankConnection.last_sync_at).where(
                BankConnection.status.in_(["active", "error"]),
                (BankConnection.last_sync_at < cutoff) | (BankConnection.last_sync_at.is_(None)),
            )
        )
        connections = result.all()

    logger.info(
        "Sync check: found %d stale connections (cutoff=%s)",
        len(connections),
        cutoff.isoformat(),
    )

    for conn_id, user_id, last_sync in connections:
        try:
            logger.info("Syncing connection %s (last_sync=%s)", conn_id, last_sync)
            await _sync_one(conn_id, user_id)
            synced += 1
        except Exception:
            logger.exception("Background sync failed for connection %s", conn_id)

    return synced


async def _sync_one(connection_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Sync a single connection. Error status is set by sync_connection itself."""
    async with async_session_maker() as session:
        await connection_service.sync_connection(session, connection_id, user_id)


@celery_app.task(name="app.tasks.sync_tasks.sync_all_connections")
def sync_all_connections() -> dict:
    """Celery task: sync all stale bank connections."""
    synced = asyncio.run(_sync_all())
    logger.info("Background sync complete: %d connections synced", synced)
    return {"synced": synced}


@celery_app.task(name="app.tasks.sync_tasks.sync_single_connection")
def sync_single_connection(connection_id: str, user_id: str) -> dict:
    """Celery task: sync a single connection (used for on-demand dispatch)."""
    try:
        asyncio.run(_sync_one(uuid.UUID(connection_id), uuid.UUID(user_id)))
        return {"status": "ok", "connection_id": connection_id}
    except Exception as e:
        logger.exception("Sync task failed for connection %s", connection_id)
        return {"status": "error", "connection_id": connection_id, "error": str(e)}

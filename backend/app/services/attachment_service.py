import re
import uuid
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.config import get_settings
from app.models.account import Account
from app.models.bank_connection import BankConnection
from app.models.transaction import Transaction
from app.models.transaction_attachment import TransactionAttachment
from app.providers import get_storage_provider


def sanitize_filename(filename: str) -> str:
    """Strip special characters from a filename, preserving the extension."""
    if "." in filename:
        name, ext = filename.rsplit(".", 1)
        ext = re.sub(r"[^a-zA-Z0-9]", "", ext).lower()
    else:
        name = filename
        ext = ""
    # Replace non-alphanumeric (except hyphens/underscores) with underscores, collapse runs
    name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "file"
    return f"{name}.{ext}" if ext else name


def _validate_file(filename: str, content_type: str, size: int) -> None:
    settings = get_settings()

    max_bytes = settings.storage_max_file_size_mb * 1024 * 1024
    if size > max_bytes:
        raise ValueError(f"File too large. Maximum size is {settings.storage_max_file_size_mb} MB.")

    allowed = {ext.strip().lower() for ext in settings.storage_allowed_extensions.split(",")}
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed:
        raise ValueError(f"File type '.{ext}' is not allowed. Allowed: {', '.join(sorted(allowed))}")


async def _verify_transaction_ownership(
    session: AsyncSession, transaction_id: uuid.UUID, company_id: uuid.UUID
) -> Transaction:
    result = await session.execute(
        select(Transaction)
        .outerjoin(Account)
        .outerjoin(BankConnection)
        .where(
            Transaction.id == transaction_id,
            or_(
                Transaction.company_id == company_id,
                BankConnection.company_id == company_id,
            ),
        )
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise LookupError("Transaction not found")
    return transaction


async def upload_attachment(
    session: AsyncSession,
    company_id: uuid.UUID,
    transaction_id: uuid.UUID,
    filename: str,
    content_type: str,
    data: bytes,
    user_id: Optional[uuid.UUID] = None,
) -> TransactionAttachment:
    filename = sanitize_filename(filename)
    _validate_file(filename, content_type, len(data))
    await _verify_transaction_ownership(session, transaction_id, company_id)

    settings = get_settings()
    count_result = await session.execute(
        select(func.count()).where(
            TransactionAttachment.transaction_id == transaction_id,
        )
    )
    current_count = count_result.scalar_one()
    if current_count >= settings.storage_max_attachments_per_transaction:
        raise ValueError(
            f"Maximum of {settings.storage_max_attachments_per_transaction} attachments per transaction reached."
        )

    prefix = uuid.uuid4().hex[:8]
    storage_key = f"{company_id}/{transaction_id}/{prefix}_{filename}"

    storage = get_storage_provider()
    try:
        stored = await storage.upload(storage_key, data, content_type)
        stored_key = stored.storage_key
        stored_content_type = stored.content_type
        stored_size = stored.size
    except Exception:
        stored_key = storage_key
        stored_content_type = content_type
        stored_size = len(data)

    attachment = TransactionAttachment(
        user_id=user_id,
        transaction_id=transaction_id,
        filename=filename,
        storage_key=stored_key,
        content_type=stored_content_type,
        size=stored_size,
        file_data=data,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def list_attachments(
    session: AsyncSession, company_id: uuid.UUID, transaction_id: uuid.UUID
) -> list[TransactionAttachment]:
    await _verify_transaction_ownership(session, transaction_id, company_id)
    result = await session.execute(
        select(TransactionAttachment)
        .options(defer(TransactionAttachment.file_data))
        .where(
            TransactionAttachment.transaction_id == transaction_id,
        )
        .order_by(TransactionAttachment.created_at)
    )
    return list(result.scalars().all())


async def _get_attachment_for_company(
    session: AsyncSession, attachment_id: uuid.UUID, company_id: uuid.UUID, include_data: bool = False
) -> TransactionAttachment:
    stmt = (
        select(TransactionAttachment)
        .join(Transaction, TransactionAttachment.transaction_id == Transaction.id)
        .outerjoin(Account, Transaction.account_id == Account.id)
        .outerjoin(BankConnection, Account.connection_id == BankConnection.id)
        .where(
            TransactionAttachment.id == attachment_id,
            or_(
                Transaction.company_id == company_id,
                BankConnection.company_id == company_id,
            ),
        )
    )
    if not include_data:
        stmt = stmt.options(defer(TransactionAttachment.file_data))
    result = await session.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise LookupError("Attachment not found")
    return attachment


async def download_attachment(
    session: AsyncSession, attachment_id: uuid.UUID, company_id: uuid.UUID
) -> tuple[TransactionAttachment, bytes]:
    attachment = await _get_attachment_for_company(
        session, attachment_id, company_id, include_data=True
    )
    if attachment.file_data is not None:
        return attachment, attachment.file_data

    storage = get_storage_provider()
    data = await storage.download(attachment.storage_key)
    return attachment, data


async def rename_attachment(
    session: AsyncSession, attachment_id: uuid.UUID, company_id: uuid.UUID, new_filename: str
) -> TransactionAttachment:
    new_filename = sanitize_filename(new_filename)
    if not new_filename:
        raise ValueError("Filename cannot be empty.")

    attachment = await _get_attachment_for_company(session, attachment_id, company_id)

    # Preserve the original extension
    original_ext = attachment.filename.rsplit(".", 1)[-1].lower() if "." in attachment.filename else ""
    new_ext = new_filename.rsplit(".", 1)[-1].lower() if "." in new_filename else ""

    if original_ext and new_ext != original_ext:
        # Strip any wrong extension the user may have typed, re-append original
        name_part = new_filename.rsplit(".", 1)[0] if "." in new_filename else new_filename
        new_filename = f"{name_part}.{original_ext}"

    attachment.filename = new_filename
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def cleanup_attachment_files(
    session: AsyncSession, transaction_ids: list[uuid.UUID]
) -> None:
    """Delete storage files for all attachments belonging to the given transactions."""
    if not transaction_ids:
        return
    result = await session.execute(
        select(TransactionAttachment.storage_key).where(
            TransactionAttachment.transaction_id.in_(transaction_ids)
        )
    )
    storage_keys = [row[0] for row in result.all()]
    if not storage_keys:
        return
    storage = get_storage_provider()
    for key in storage_keys:
        try:
            await storage.delete(key)
        except Exception:
            pass  # best-effort cleanup; file may already be gone


async def delete_attachment(
    session: AsyncSession, attachment_id: uuid.UUID, company_id: uuid.UUID
) -> None:
    attachment = await _get_attachment_for_company(session, attachment_id, company_id)

    storage = get_storage_provider()
    try:
        await storage.delete(attachment.storage_key)
    except Exception:
        pass

    await session.delete(attachment)
    await session.commit()

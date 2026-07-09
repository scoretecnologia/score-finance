from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import current_active_user
from app.core.tenant import get_current_company, require_role
from app.core.database import get_async_session
from app.models.company import Company
from app.models.company_setting import CompanySetting
from app.models.user import User
from app.schemas.company_setting import CompanySettingRead, CompanySettingUpdate

from app.core.config import get_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/attachments")
async def get_attachment_settings():
    """Return attachment configuration for this instance."""
    settings = get_settings()
    allowed = [ext.strip().lower() for ext in settings.storage_allowed_extensions.split(",") if ext.strip()]
    return {
        "allowed_extensions": allowed,
        "max_file_size_mb": settings.storage_max_file_size_mb,
        "max_attachments_per_transaction": settings.storage_max_attachments_per_transaction,
    }

@router.get("/ai", response_model=CompanySettingRead)
async def get_ai_settings(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    result = await session.execute(
        select(CompanySetting).where(
            CompanySetting.company_id == company.id,
            CompanySetting.key == "gemini_api_key"
        )
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI settings not found")
        
    return setting


@router.post("/ai", response_model=CompanySettingRead)
async def update_ai_settings(
    setting_in: CompanySettingUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(require_role("owner", "admin")),
):
    result = await session.execute(
        select(CompanySetting).where(
            CompanySetting.company_id == company.id,
            CompanySetting.key == "gemini_api_key"
        )
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        setting.value = setting_in.value
    else:
        setting = CompanySetting(
            company_id=company.id,
            key="gemini_api_key",
            value=setting_in.value
        )
        session.add(setting)
        
    await session.commit()
    await session.refresh(setting)
    
    return setting

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.tenant import get_current_company
from app.models.company import Company
from app.core.database import get_async_session
from app.models.user import User
from app.schemas.category_group import CategoryGroupCreate, CategoryGroupRead, CategoryGroupUpdate
from app.services import category_group_service

router = APIRouter(prefix="/api/category-groups", tags=["category-groups"])


@router.get("", response_model=list[CategoryGroupRead])
async def list_groups(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await category_group_service.get_groups(session, company.id)


@router.post("", response_model=CategoryGroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    data: CategoryGroupCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    return await category_group_service.create_group(session, company.id, data)


@router.patch("/{group_id}", response_model=CategoryGroupRead)
async def update_group(
    group_id: uuid.UUID,
    data: CategoryGroupUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    group = await category_group_service.update_group(session, group_id, company.id, data)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    deleted = await category_group_service.delete_group(session, group_id, company.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group not found or is a system group",
        )

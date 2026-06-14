import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.auth import current_active_user
from app.core.tenant import get_current_company
from app.models.cost_center import CostCenter
from app.models.user import User
from app.models.company import Company
from app.schemas.cost_center import CostCenterCreate, CostCenterRead, CostCenterUpdate

router = APIRouter(prefix="/api/cost-centers", tags=["cost-centers"])

@router.get("", response_model=List[CostCenterRead])
async def list_cost_centers(
    is_active: bool = Query(None, description="Filter by active status"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    stmt = select(CostCenter).where(CostCenter.company_id == company.id)
    if is_active is not None:
        stmt = stmt.where(CostCenter.is_active == is_active)
    
    stmt = stmt.order_by(CostCenter.code.asc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=CostCenterRead)
async def create_cost_center(
    cost_center_in: CostCenterCreate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    cost_center = CostCenter(
        **cost_center_in.model_dump(),
        company_id=company.id
    )
    db.add(cost_center)
    await db.commit()
    await db.refresh(cost_center)
    return cost_center


@router.patch("/{cost_center_id}", response_model=CostCenterRead)
async def update_cost_center(
    cost_center_id: uuid.UUID,
    cost_center_in: CostCenterUpdate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    stmt = select(CostCenter).where(
        CostCenter.id == cost_center_id,
        CostCenter.company_id == company.id
    )
    result = await db.execute(stmt)
    cost_center = result.scalar_one_or_none()
    
    if not cost_center:
        raise HTTPException(status_code=404, detail="Cost center not found")

    update_data = cost_center_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cost_center, field, value)

    await db.commit()
    await db.refresh(cost_center)
    return cost_center


@router.delete("/{cost_center_id}")
async def delete_cost_center(
    cost_center_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
    company: Company = Depends(get_current_company),
):
    stmt = select(CostCenter).where(
        CostCenter.id == cost_center_id,
        CostCenter.company_id == company.id
    )
    result = await db.execute(stmt)
    cost_center = result.scalar_one_or_none()
    
    if not cost_center:
        raise HTTPException(status_code=404, detail="Cost center not found")

    # Soft delete (inactivate)
    cost_center.is_active = False
    await db.commit()
    return {"status": "success"}

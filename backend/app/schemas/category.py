import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.chart_account import ChartAccountRead


class CategoryBase(BaseModel):
    name: str
    code: Optional[str] = None
    icon: str = "circle-help"
    color: str = "#6B7280"
    position: int = 0
    is_synthetic: bool = False


class CategoryCreate(CategoryBase):
    group_id: Optional[uuid.UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    group_id: Optional[uuid.UUID] = None


class CategoryRead(CategoryBase):
    id: uuid.UUID
    company_id: uuid.UUID
    group_id: Optional[uuid.UUID] = None
    is_system: bool
    chart_accounts: list[ChartAccountRead] = []

    model_config = ConfigDict(from_attributes=True)

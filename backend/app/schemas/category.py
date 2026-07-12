import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.chart_account import ChartAccountRead


class CategoryBase(BaseModel):
    name: str
    code: Optional[str] = None
    icon: str = "circle-help"
    color: str = "#6B7280"
    position: int = 0
    is_synthetic: bool = False

    @field_validator('code', mode='before')
    @classmethod
    def empty_string_to_none(cls, v: Optional[str]) -> Optional[str]:
        return None if v == "" else v


class CategoryCreate(CategoryBase):
    group_id: Optional[uuid.UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    group_id: Optional[uuid.UUID] = None

    @field_validator('code', mode='before')
    @classmethod
    def empty_string_to_none(cls, v: Optional[str]) -> Optional[str]:
        return None if v == "" else v


class CategoryRead(CategoryBase):
    id: uuid.UUID
    company_id: uuid.UUID
    group_id: Optional[uuid.UUID] = None
    is_system: bool
    chart_accounts: list[ChartAccountRead] = []

    model_config = ConfigDict(from_attributes=True)

import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChartAccountBase(BaseModel):
    name: str
    code: Optional[str] = None
    icon: str = "circle-dot"
    color: str = "#6B7280"
    position: int = 0


class ChartAccountCreate(ChartAccountBase):
    category_id: uuid.UUID


class ChartAccountUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    category_id: Optional[uuid.UUID] = None


class ChartAccountRead(ChartAccountBase):
    id: uuid.UUID
    company_id: uuid.UUID
    category_id: uuid.UUID
    is_system: bool

    model_config = ConfigDict(from_attributes=True)

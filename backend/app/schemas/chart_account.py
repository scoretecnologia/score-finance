import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class ChartAccountBase(BaseModel):
    name: str
    code: Optional[str] = None
    icon: str = "circle-dot"
    color: str = "#6B7280"
    position: int = 0

    @field_validator('code', mode='before')
    @classmethod
    def empty_string_to_none(cls, v: Optional[str]) -> Optional[str]:
        return None if v == "" else v


class ChartAccountCreate(ChartAccountBase):
    category_id: uuid.UUID


class ChartAccountUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    category_id: Optional[uuid.UUID] = None

    @field_validator('code', mode='before')
    @classmethod
    def empty_string_to_none(cls, v: Optional[str]) -> Optional[str]:
        return None if v == "" else v


class ChartAccountRead(ChartAccountBase):
    id: uuid.UUID
    company_id: uuid.UUID
    category_id: uuid.UUID
    is_system: bool

    model_config = ConfigDict(from_attributes=True)


class BulkChartAccountDeleteRequest(BaseModel):
    ids: list[uuid.UUID]


class BulkChartAccountBlockedItem(BaseModel):
    id: uuid.UUID
    name: str
    reason: str


class BulkChartAccountDeleteResult(BaseModel):
    deleted: list[uuid.UUID]
    blocked: list[BulkChartAccountBlockedItem]


class BulkChartAccountUpdateRequest(BaseModel):
    ids: list[uuid.UUID]
    icon: Optional[str] = None
    color: Optional[str] = None


class BulkChartAccountUpdateResult(BaseModel):
    updated: int

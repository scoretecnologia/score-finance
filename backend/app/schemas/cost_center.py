import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

class CostCenterBase(BaseModel):
    name: str = Field(..., max_length=255)
    is_active: bool = True

class CostCenterCreate(CostCenterBase):
    pass

class CostCenterUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None

class CostCenterRead(CostCenterBase):
    id: uuid.UUID
    company_id: uuid.UUID
    code: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

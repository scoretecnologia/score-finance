from datetime import datetime
import uuid
from pydantic import BaseModel, ConfigDict


class CompanySettingBase(BaseModel):
    key: str
    value: str | None = None


class CompanySettingCreate(CompanySettingBase):
    pass


class CompanySettingUpdate(BaseModel):
    value: str | None = None


class CompanySettingRead(CompanySettingBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

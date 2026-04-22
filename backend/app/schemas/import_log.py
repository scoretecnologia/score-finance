import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ImportLogRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    account_id: uuid.UUID
    account_name: Optional[str] = None
    filename: str
    format: str
    transaction_count: int
    total_credit: Decimal
    total_debit: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

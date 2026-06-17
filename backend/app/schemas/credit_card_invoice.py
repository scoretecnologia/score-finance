import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CreditCardInvoiceBase(BaseModel):
    month_reference: str
    total_amount: Decimal
    paid_amount: Decimal
    transaction_count: int
    status: str


class CreditCardInvoiceCreate(CreditCardInvoiceBase):
    account_id: uuid.UUID


class CreditCardInvoiceUpdate(BaseModel):
    total_amount: Optional[Decimal] = None
    paid_amount: Optional[Decimal] = None
    status: Optional[str] = None
    transaction_count: Optional[int] = None


class CreditCardInvoice(CreditCardInvoiceBase):
    id: uuid.UUID
    company_id: uuid.UUID
    account_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    account: Optional['AccountRead'] = None

    model_config = ConfigDict(from_attributes=True)

from app.schemas.account import AccountRead
CreditCardInvoice.model_rebuild()

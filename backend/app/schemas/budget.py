import uuid
from datetime import date as _Date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BudgetCreate(BaseModel):
    category_id: Optional[uuid.UUID] = None
    chart_account_id: Optional[uuid.UUID] = None
    amount: Decimal
    month: _Date  # First day of month
    is_recurring: bool = False


class BudgetUpdate(BaseModel):
    amount: Optional[Decimal] = None
    effective_month: Optional[_Date] = None


class BudgetRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    category_id: Optional[uuid.UUID] = None
    chart_account_id: Optional[uuid.UUID] = None
    amount: Decimal
    month: _Date
    is_recurring: bool

    model_config = ConfigDict(from_attributes=True)


class BudgetVsActual(BaseModel):
    category_id: Optional[uuid.UUID] = None
    chart_account_id: Optional[uuid.UUID] = None
    category_name: str
    category_icon: str
    category_color: str
    group_id: Optional[uuid.UUID] = None
    group_name: Optional[str] = None
    budget_amount: Optional[Decimal] = None
    actual_amount: Decimal
    prev_month_amount: Decimal = Decimal("0")
    percentage_used: Optional[float] = None
    is_recurring: bool = False

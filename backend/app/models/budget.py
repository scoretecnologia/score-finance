import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.company import Company


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("company_id", "category_id", "month", "is_recurring", name="uq_budget_per_category_month_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2))
    month: Mapped[date] = mapped_column(Date)  # First day of month
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    currency: Mapped[Optional[str]] = mapped_column(String(3), server_default="BRL", nullable=True)
    amount_primary: Mapped[Optional[Decimal]] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship()
    category: Mapped["Category"] = relationship()

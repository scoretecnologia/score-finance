import uuid
from datetime import date as _date, datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.account import Account
    from app.models.company import Company
    from app.models.transaction import Transaction


class CreditCardInvoice(Base):
    __tablename__ = "credit_card_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    
    month_reference: Mapped[str] = mapped_column(String(7), nullable=False) # e.g., "2026-06"
    
    total_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=Decimal("0.00"))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=Decimal("0.00"))
    
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    
    status: Mapped[str] = mapped_column(String(20), default="OPEN")  # OPEN, PARTIALLY_PAID, PAID
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship()
    account: Mapped["Account"] = relationship()
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="invoice")

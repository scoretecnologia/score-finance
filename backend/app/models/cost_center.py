import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import event

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.transaction import Transaction


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    code: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship()
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="cost_center")


@event.listens_for(CostCenter, "before_insert")
def _generate_code(mapper, connection, target):  # type: ignore
    if getattr(target, "code", None) is None:
        # Find the max code for this company
        stmt = select(CostCenter.code).where(CostCenter.company_id == target.company_id).order_by(CostCenter.code.desc()).limit(1)
        max_code = connection.scalar(stmt)
        target.code = (max_code or 0) + 1

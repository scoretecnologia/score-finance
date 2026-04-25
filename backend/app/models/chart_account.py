import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.company import Company
    from app.models.user import User


class ChartAccount(Base):
    """Nível 3 do Plano de Contas (Conta).

    Sempre analítica — pode receber lançamentos (transactions, budgets).
    Pertence a uma Category (nível 2) que deve ser sintética.
    """

    __tablename__ = "chart_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"))
    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # ex.: "3.1.01"
    icon: Mapped[str] = mapped_column(String(50), default="circle-dot")
    color: Mapped[str] = mapped_column(String(7), default="#6B7280")
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    company: Mapped["Company"] = relationship()
    category: Mapped["Category"] = relationship(back_populates="chart_accounts")
    created_by: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by_user_id])

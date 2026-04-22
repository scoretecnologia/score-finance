from typing import TYPE_CHECKING, Optional

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.company_member import CompanyMember
    from app.models.bank_connection import BankConnection


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    preferences: Mapped[Optional[dict]] = mapped_column(
        JSON,
        default=lambda: {
            "language": "pt-BR",
            "date_format": "DD/MM/YYYY",
            "timezone": "America/Sao_Paulo",
            "currency_display": "BRL",
        },
    )

    totp_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default=None)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    categories: Mapped[list] = relationship("Category", back_populates="created_by", foreign_keys="Category.created_by_user_id")
    category_groups: Mapped[list] = relationship("CategoryGroup", back_populates="created_by", foreign_keys="CategoryGroup.created_by_user_id")
    bank_connections: Mapped[list["BankConnection"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    company_memberships: Mapped[list["CompanyMember"]] = relationship(foreign_keys="CompanyMember.user_id", back_populates="user")

    @property
    def primary_currency(self) -> str:
        """Return the user's configured primary currency."""
        from app.core.config import get_settings
        return (self.preferences or {}).get("currency_display", get_settings().default_currency)

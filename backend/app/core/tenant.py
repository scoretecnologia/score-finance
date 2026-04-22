"""
Dependências de contexto para multi-tenancy.

Uso nas rotas:
    company = Depends(get_current_company)
    # ou verificando role mínimo:
    company = Depends(require_role("admin"))
"""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.core.auth import current_active_user
from app.models.user import User


async def get_current_company(
    company_id: uuid.UUID,
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> Company:
    """
    Valida que o usuário autenticado é membro da empresa informada.
    O company_id deve ser passado como query param ou path param na rota.
    Retorna o objeto Company se o acesso for válido.
    """
    # Se o usuário for master (superuser), ele tem acesso irrestrito a todas as empresas
    if current_user.is_superuser:
        result = await db.execute(select(Company).where(Company.id == company_id, Company.is_active == True))
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Empresa não encontrada.")
        return company

    # Verifica se a empresa existe e o usuário é membro
    result = await db.execute(
        select(CompanyMember)
        .where(
            CompanyMember.company_id == company_id,
            CompanyMember.user_id == current_user.id,
            CompanyMember.accepted_at.is_not(None),
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem acesso a esta empresa.",
        )

    result = await db.execute(select(Company).where(Company.id == company_id, Company.is_active == True))
    company = result.scalar_one_or_none()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada.",
        )

    return company


def require_role(*allowed_roles: str):
    """
    Factory de dependência para exigir um papel mínimo na empresa.

    Uso:
        company = Depends(require_role("admin", "owner"))
    """
    async def dependency(
        company_id: uuid.UUID,
        current_user: Annotated[User, Depends(current_active_user)],
        db: Annotated[AsyncSession, Depends(get_async_session)],
    ) -> Company:
        if current_user.is_superuser:
            result = await db.execute(select(Company).where(Company.id == company_id))
            company = result.scalar_one_or_none()
            if not company:
                raise HTTPException(status_code=404, detail="Empresa não encontrada.")
            return company

        result = await db.execute(
            select(CompanyMember)
            .where(
                CompanyMember.company_id == company_id,
                CompanyMember.user_id == current_user.id,
                CompanyMember.accepted_at.is_not(None),
            )
        )
        member = result.scalar_one_or_none()

        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você não tem acesso a esta empresa.",
            )

        if member.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Esta ação requer um dos seguintes papéis: {', '.join(allowed_roles)}.",
            )

        result = await db.execute(select(Company).where(Company.id == company_id))
        return result.scalar_one()

    return dependency

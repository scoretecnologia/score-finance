"""
Rotas de gerenciamento de Empresas e Membros.

Endpoints:
  POST   /companies                         → Criar empresa (vira owner)
  GET    /companies/me                      → Listar empresas do usuário logado
  GET    /companies/{company_id}            → Detalhes da empresa
  PATCH  /companies/{company_id}            → Editar empresa (owner/admin)
  POST   /companies/{company_id}/members    → Convidar membro por e-mail
  GET    /companies/{company_id}/members    → Listar membros
  PATCH  /companies/{company_id}/members/{member_id}  → Alterar role
  DELETE /companies/{company_id}/members/{member_id}  → Remover membro
  POST   /companies/invites/accept          → Aceitar convite (por invite token)
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.core.tenant import get_current_company, require_role
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.models.user import User
from app.core.auth import current_active_user

router = APIRouter(prefix="/companies", tags=["companies"])

# ── Schemas ────────────────────────────────────────────────────────────────────


class CompanyCreate(BaseModel):
    name: str
    cnpj: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    cnpj: Optional[str] = None


class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: Optional[str]
    cnpj: Optional[str]
    plan: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    role: str
    invited_at: datetime
    accepted_at: Optional[datetime]

    class Config:
        from_attributes = True


class InviteMember(BaseModel):
    email: EmailStr
    role: str = "member"  # member | admin | viewer


class UpdateMemberRole(BaseModel):
    role: str


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_slug(name: str, company_id: uuid.UUID) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{str(company_id)[:8]}"


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> Company:
    """Cria uma nova empresa. O usuário que cria vira owner automaticamente."""
    company = Company(
        id=uuid.uuid4(),
        name=body.name,
        cnpj=body.cnpj,
    )
    company.slug = _make_slug(body.name, company.id)
    db.add(company)
    await db.flush()  # Garante que o ID existe antes de criar o membro

    member = CompanyMember(
        company_id=company.id,
        user_id=current_user.id,
        role="owner",
        invited_by=current_user.id,
        accepted_at=datetime.now(timezone.utc),  # owner já é aceito automaticamente
    )
    db.add(member)
    await db.commit()
    await db.refresh(company)
    return company


@router.get("/me", response_model=list[CompanyOut])
async def list_my_companies(
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> list[Company]:
    if current_user.is_superuser:
        result = await db.execute(select(Company).where(Company.is_active == True))
    else:
        result = await db.execute(
            select(Company)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .where(
                CompanyMember.user_id == current_user.id,
                CompanyMember.accepted_at.is_not(None),
                Company.is_active == True,
            )
        )
    return list(result.scalars().all())


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(
    company: Annotated[Company, Depends(get_current_company)],
) -> Company:
    """Detalhes de uma empresa (requer ser membro)."""
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
async def update_company(
    body: CompanyUpdate,
    company: Annotated[Company, Depends(require_role("owner", "admin"))],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> Company:
    """Edita nome ou CNPJ da empresa (requer owner ou admin)."""
    if body.name is not None:
        company.name = body.name
    if body.cnpj is not None:
        company.cnpj = body.cnpj
    await db.commit()
    await db.refresh(company)
    return company


@router.get("/{company_id}/members", response_model=list[MemberOut])
async def list_members(
    company: Annotated[Company, Depends(get_current_company)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> list[CompanyMember]:
    """Lista todos os membros da empresa."""
    result = await db.execute(
        select(CompanyMember).where(CompanyMember.company_id == company.id)
    )
    return list(result.scalars().all())


@router.post("/{company_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: InviteMember,
    company: Annotated[Company, Depends(require_role("owner", "admin"))],
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> CompanyMember:
    """
    Convida um usuário por e-mail.
    O usuário precisa já ter uma conta no sistema.
    O convite fica pendente (accepted_at = NULL) até ser aceito.
    """
    if body.role not in ("owner", "admin", "member", "viewer"):
        raise HTTPException(status_code=400, detail="Role inválido.")
    if body.role == "owner":
        raise HTTPException(status_code=400, detail="Não é possível convidar outro owner.")

    # Busca o usuário pelo e-mail
    result = await db.execute(select(User).where(User.email == body.email))
    invited_user = result.scalar_one_or_none()
    if not invited_user:
        raise HTTPException(
            status_code=404,
            detail="Usuário não encontrado. Peça para ele criar uma conta primeiro.",
        )

    # Verifica se já é membro
    result = await db.execute(
        select(CompanyMember).where(
            CompanyMember.company_id == company.id,
            CompanyMember.user_id == invited_user.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Usuário já é membro desta empresa.")

    member = CompanyMember(
        company_id=company.id,
        user_id=invited_user.id,
        role=body.role,
        invited_by=current_user.id,
        # accepted_at = None → convite pendente
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.patch("/{company_id}/members/{member_id}", response_model=MemberOut)
async def update_member_role(
    member_id: uuid.UUID,
    body: UpdateMemberRole,
    company: Annotated[Company, Depends(require_role("owner", "admin"))],
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> CompanyMember:
    """Altera o papel de um membro (owner/admin apenas)."""
    result = await db.execute(
        select(CompanyMember).where(
            CompanyMember.id == member_id, CompanyMember.company_id == company.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    if member.role == "owner":
        raise HTTPException(status_code=403, detail="Não é possível alterar o papel do owner.")
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=400, detail="Role inválido.")

    member.role = body.role
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{company_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    member_id: uuid.UUID,
    company: Annotated[Company, Depends(require_role("owner", "admin"))],
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> None:
    """Remove um membro da empresa. O owner não pode ser removido."""
    result = await db.execute(
        select(CompanyMember).where(
            CompanyMember.id == member_id, CompanyMember.company_id == company.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    if member.role == "owner":
        raise HTTPException(status_code=403, detail="O owner não pode ser removido.")

    await db.delete(member)
    await db.commit()


@router.post("/invites/accept", response_model=MemberOut)
async def accept_invite(
    company_id: uuid.UUID,
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> CompanyMember:
    """Aceita um convite pendente para uma empresa."""
    result = await db.execute(
        select(CompanyMember).where(
            CompanyMember.company_id == company_id,
            CompanyMember.user_id == current_user.id,
            CompanyMember.accepted_at.is_(None),
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Convite não encontrado ou já aceito.")

    member.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(member)
    return member

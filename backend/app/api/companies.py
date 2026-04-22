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
from app.core.auth import current_active_user, UserManager, get_user_manager

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
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: Optional[str] = None
    user_email: str
    role: str
    invited_at: datetime
    accepted_at: Optional[datetime]

    class Config:
        from_attributes = True


class InviteMember(BaseModel):
    email: EmailStr
    role: str = "member"  # member | admin | viewer
    name: Optional[str] = None
    password: Optional[str] = None # Se fornecido, cria o usuário se não existir


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
        companies = result.scalars().all()
        return [
            CompanyOut(
                id=c.id,
                name=c.name,
                slug=c.slug,
                cnpj=c.cnpj,
                plan=c.plan,
                is_active=c.is_active,
                role="owner",
                created_at=c.created_at,
            ) for c in companies
        ]
    else:
        result = await db.execute(
            select(Company, CompanyMember.role)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .where(
                CompanyMember.user_id == current_user.id,
                CompanyMember.accepted_at.is_not(None),
                Company.is_active == True,
            )
        )
        companies = []
        for company, role in result.all():
            companies.append(
                CompanyOut(
                    id=company.id,
                    name=company.name,
                    slug=company.slug,
                    cnpj=company.cnpj,
                    plan=company.plan,
                    is_active=company.is_active,
                    role=role,
                    created_at=company.created_at,
                )
            )
        return companies


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
        select(CompanyMember, User)
        .join(User, User.id == CompanyMember.user_id)
        .where(CompanyMember.company_id == company.id)
    )
    members = []
    for member, user in result.all():
        members.append(
            MemberOut(
                id=member.id,
                user_id=member.user_id,
                user_name=user.name,
                user_email=user.email,
                role=member.role,
                invited_at=member.invited_at,
                accepted_at=member.accepted_at,
            )
        )
    return members


@router.post("/{company_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: InviteMember,
    company: Annotated[Company, Depends(require_role("owner", "admin"))],
    current_user: Annotated[User, Depends(current_active_user)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> MemberOut:
    """
    Convida um usuário por e-mail.
    Se o usuário não existir e um password for fornecido, cria a conta.
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
        if not body.password:
            raise HTTPException(
                status_code=404,
                detail="Usuário não encontrado. Forneça uma senha para criar a conta dele.",
            )
        
        # Cria o usuário automaticamente
        from fastapi_users.schemas import BaseUserCreate
        create_schema = BaseUserCreate(
            email=body.email,
            password=body.password,
            is_active=True,
            is_verified=True,
        )
        try:
            invited_user = await user_manager.create(create_schema)
            if body.name:
                invited_user.name = body.name
                db.add(invited_user)
                await db.flush()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao criar usuário: {str(e)}")
    
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
        # Se o usuário foi criado agora pelo admin, já marcamos como aceito
        accepted_at=datetime.now(timezone.utc) if body.password else None
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    
    return MemberOut(
        id=member.id,
        user_id=member.user_id,
        user_name=invited_user.name,
        user_email=invited_user.email,
        role=member.role,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )


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
        select(CompanyMember, User).join(User, User.id == CompanyMember.user_id).where(
            CompanyMember.id == member_id, CompanyMember.company_id == company.id
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    
    member, user = row
    if member.role == "owner":
        raise HTTPException(status_code=403, detail="Não é possível alterar o papel do owner.")
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=400, detail="Role inválido.")

    member.role = body.role
    await db.commit()
    await db.refresh(member)
    return MemberOut(
        id=member.id,
        user_id=member.user_id,
        user_name=user.name,
        user_email=user.email,
        role=member.role,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )


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
        select(CompanyMember, User).join(User, User.id == CompanyMember.user_id).where(
            CompanyMember.company_id == company_id,
            CompanyMember.user_id == current_user.id,
            CompanyMember.accepted_at.is_(None),
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Convite não encontrado ou já aceito.")
        
    member, user = row

    member.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(member)
    return MemberOut(
        id=member.id,
        user_id=member.user_id,
        user_name=user.name,
        user_email=user.email,
        role=member.role,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )

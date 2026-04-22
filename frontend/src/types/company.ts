// Tipos de empresa e membros
export interface Company {
  id: string
  name: string
  slug: string | null
  cnpj: string | null
  plan: string
  is_active: boolean
  created_at: string
}

export interface CompanyMember {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  invited_at: string
  accepted_at: string | null
}

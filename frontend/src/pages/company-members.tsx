import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Trash2, Shield, Crown, Eye, User } from 'lucide-react'
import { companies as companiesApi } from '@/lib/api'
import { useCompany } from '@/contexts/company-context'
import type { CompanyMember } from '@/types'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  owner:  { label: 'Dono',         icon: <Crown className="w-3.5 h-3.5" />,  color: 'text-amber-500 bg-amber-500/10' },
  admin:  { label: 'Administrador',icon: <Shield className="w-3.5 h-3.5" />, color: 'text-blue-500 bg-blue-500/10'   },
  member: { label: 'Membro',       icon: <User className="w-3.5 h-3.5" />,   color: 'text-green-500 bg-green-500/10' },
  viewer: { label: 'Visualizador', icon: <Eye className="w-3.5 h-3.5" />,    color: 'text-muted-foreground bg-muted' },
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_LABELS[role] ?? ROLE_LABELS.viewer
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

export default function CompanyMembersPage() {
  const { currentCompany } = useCompany()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [isInviting, setIsInviting] = useState(false)
  const [showCreateFields, setShowCreateFields] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<CompanyMember | null>(null)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['company-members', currentCompany?.id],
    queryFn: () => companiesApi.members.list(currentCompany!.id),
    enabled: !!currentCompany,
  })

  const removeMutation = useMutation({
    mutationFn: ({ memberId }: { memberId: string }) =>
      companiesApi.members.remove(currentCompany!.id, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members'] })
      toast.success('Membro removido.')
    },
    onError: () => toast.error('Erro ao remover membro.'),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, newRole }: { memberId: string; newRole: string }) =>
      companiesApi.members.updateRole(currentCompany!.id, memberId, newRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members'] })
      toast.success('Papel atualizado.')
    },
    onError: () => toast.error('Erro ao atualizar papel.'),
  })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !currentCompany) return
    setIsInviting(true)
    try {
      await companiesApi.members.invite(currentCompany.id, email.trim(), role, name || undefined, password || undefined)
      toast.success(password ? `Usuário ${email} criado e convidado!` : `Convite enviado para ${email}!`)
      setEmail('')
      setName('')
      setPassword('')
      setShowCreateFields(false)
      queryClient.invalidateQueries({ queryKey: ['company-members'] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Erro ao convidar usuário.')
    } finally {
      setIsInviting(false)
    }
  }

  if (!currentCompany) return null

  const acceptedMembers = members.filter(m => m.accepted_at)
  const pendingMembers  = members.filter(m => !m.accepted_at)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Membros da Empresa
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie quem tem acesso à <strong>{currentCompany.name}</strong>.
        </p>
      </div>

      {/* Invite Form */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          Convidar novo membro
        </h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="invite-email"
              type="email"
              placeholder="email@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
            <select
              id="invite-role"
              value={role}
              onChange={e => setRole(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            >
              <option value="admin">Administrador</option>
              <option value="member">Membro</option>
              <option value="viewer">Visualizador</option>
            </select>
            <button
              type="submit"
              id="invite-submit"
              disabled={isInviting || !email.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] whitespace-nowrap"
            >
              {isInviting ? (
                <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  {showCreateFields ? 'Criar e Adicionar' : 'Convidar'}
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateFields(!showCreateFields)}
              className="text-xs text-primary hover:underline"
            >
              {showCreateFields ? '- Ocultar campos de criação' : '+ Criar conta para este e-mail agora'}
            </button>
          </div>

          {showCreateFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Nome do usuário"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Senha Inicial</label>
                <input
                  type="password"
                  placeholder="Defina uma senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={showCreateFields}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                />
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Members List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">
            Membros ativos
            <span className="ml-2 text-xs font-normal text-muted-foreground">({acceptedMembers.length})</span>
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : acceptedMembers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum membro ativo ainda.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {acceptedMembers.map((member: CompanyMember) => (
              <MemberRow
                key={member.id}
                member={member}
                onChangeRole={(newRole) => updateRoleMutation.mutate({ memberId: member.id, newRole })}
                onRemove={() => setMemberToDelete(member)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Pending Invites */}
      {pendingMembers.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-amber-500/5">
            <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Convites pendentes
              <span className="ml-2 text-xs font-normal text-muted-foreground">({pendingMembers.length})</span>
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {pendingMembers.map((member: CompanyMember) => (
              <MemberRow
                key={member.id}
                member={member}
                pending
                onChangeRole={(newRole) => updateRoleMutation.mutate({ memberId: member.id, newRole })}
                onRemove={() => setMemberToDelete(member)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Confirmation Modal */}
      <Dialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Membro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{memberToDelete?.user_name || memberToDelete?.user_email}</strong> desta empresa? 
              O usuário perderá o acesso imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setMemberToDelete(null)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (memberToDelete) {
                  removeMutation.mutate({ memberId: memberToDelete.id })
                  setMemberToDelete(null)
                }
              }}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MemberRow({
  member,
  pending = false,
  onChangeRole,
  onRemove,
}: {
  member: CompanyMember
  pending?: boolean
  onChangeRole: (role: string) => void
  onRemove: () => void
}) {
  const isOwner = member.role === 'owner'

  return (
    <li className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
      {/* Avatar placeholder */}
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
        <User className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {member.user_name || member.user_email || member.user_id}
          {pending && (
            <span className="ml-2 text-xs text-amber-500 font-normal">(aguardando aceite)</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Convidado em {new Date(member.invited_at).toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Role badge / selector */}
      {isOwner ? (
        <RoleBadge role="owner" />
      ) : (
        <select
          value={member.role}
          onChange={e => onChangeRole(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
        >
          <option value="admin">Administrador</option>
          <option value="member">Membro</option>
          <option value="viewer">Visualizador</option>
        </select>
      )}

      {/* Remove button */}
      {!isOwner && (
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remover membro"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  )
}

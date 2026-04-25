import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { categories as categoriesApi, categoryGroups as groupsApi, chartAccounts as accountsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Category, CategoryGroup, ChartAccount } from '@/types'
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { CategoryIcon } from '@/components/category-icon'
import { IconPicker } from '@/components/icon-picker'
import { ConfirmDialog } from '@/components/confirm-dialog'

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
      {children}
    </div>
  )
}
function SectionHeader({ title, titleExtra, action }: { title: string; titleExtra?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {titleExtra}
      </div>
      {action}
    </div>
  )
}

export default function CategoriesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  
  // Dialogs
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  
  // Editing states
  const [editingGroup, setEditingGroup] = useState<CategoryGroup | null>(null)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null)
  
  // Selected parent for creation
  const [selectedParentGroupId, setSelectedParentGroupId] = useState<string>('')
  const [selectedParentCatId, setSelectedParentCatId] = useState<string>('')

  // Form states
  const [formIcon, setFormIcon] = useState('circle-help')
  const [formColor, setFormColor] = useState('#6366f1')

  // Collapse states
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'category' | 'group' | 'account', id: string, name: string } | null>(null)

  const { data: groups } = useQuery({
    queryKey: ['category-groups'],
    queryFn: groupsApi.list,
  })

  // We only fetch categories for those not in any group (if any exist) or flat list
  const { data: categoriesList } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['category-groups'] })
    queryClient.invalidateQueries({ queryKey: ['chart-accounts'] })
  }

  // Group Mutations
  const createGroupMutation = useMutation({
    mutationFn: (g: Partial<CategoryGroup>) => groupsApi.create(g),
    onSuccess: () => { invalidateAll(); setGroupDialogOpen(false); toast.success(t('groups.created')) },
  })
  const updateGroupMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<CategoryGroup> & { id: string }) => groupsApi.update(id, data),
    onSuccess: () => { invalidateAll(); setGroupDialogOpen(false); setEditingGroup(null); toast.success(t('groups.updated')) },
    onError: () => { toast.error(t('common.error')) },
  })
  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => groupsApi.delete(id),
    onSuccess: () => { invalidateAll(); toast.success(t('groups.deleted')) },
  })

  // Category Mutations
  const createCatMutation = useMutation({
    mutationFn: (cat: Partial<Category>) => categoriesApi.create(cat),
    onSuccess: () => { invalidateAll(); setCatDialogOpen(false); toast.success(t('categories.created')) },
  })
  const updateCatMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Category> & { id: string }) => categoriesApi.update(id, data),
    onSuccess: () => { invalidateAll(); setCatDialogOpen(false); setEditingCat(null); toast.success(t('categories.updated')) },
  })
  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => { invalidateAll(); toast.success(t('categories.deleted')) },
  })

  // Account Mutations
  const createAccountMutation = useMutation({
    mutationFn: (acc: Partial<ChartAccount>) => accountsApi.create(acc),
    onSuccess: () => { invalidateAll(); setAccountDialogOpen(false); toast.success(t('chartAccounts.created')) },
    onError: (err: any) => { toast.error(err.response?.data?.detail || t('common.error')) }
  })
  const updateAccountMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<ChartAccount> & { id: string }) => accountsApi.update(id, data),
    onSuccess: () => { invalidateAll(); setAccountDialogOpen(false); setEditingAccount(null); toast.success(t('chartAccounts.updated')) },
    onError: (err: any) => { toast.error(err.response?.data?.detail || t('common.error')) }
  })
  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => { invalidateAll(); toast.success(t('chartAccounts.deleted')) },
  })

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const toggleCatCollapse = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const openGroupDialog = (group: CategoryGroup | null) => {
    setEditingGroup(group)
    setFormIcon(group?.icon ?? 'folder')
    setFormColor(group?.color ?? '#6B7280')
    setGroupDialogOpen(true)
  }

  const openCatDialog = (cat: Category | null, parentGroupId?: string) => {
    setEditingCat(cat)
    setSelectedParentGroupId(cat?.group_id ?? parentGroupId ?? '')
    setFormIcon(cat?.icon ?? 'circle-help')
    setFormColor(cat?.color ?? '#6366f1')
    setCatDialogOpen(true)
  }

  const openAccountDialog = (acc: ChartAccount | null, parentCatId?: string) => {
    setEditingAccount(acc)
    setSelectedParentCatId(acc?.category_id ?? parentCatId ?? '')
    setFormIcon(acc?.icon ?? 'circle-dot')
    setFormColor(acc?.color ?? '#10B981')
    setAccountDialogOpen(true)
  }

  const renderAccountItem = (acc: ChartAccount) => (
    <div key={acc.id} className="flex items-center gap-3 px-4 sm:px-5 pl-10 sm:pl-16 py-2 border-b border-border last:border-0 hover:bg-muted transition-colors">
      <CategoryIcon icon={acc.icon} color={acc.color} size="sm" />
      <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{acc.name}</span>
      {acc.code && (
        <span className="text-xs text-muted-foreground font-mono mr-2 bg-muted-foreground/10 px-1.5 py-0.5 rounded">{acc.code}</span>
      )}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
          onClick={() => openAccountDialog(acc)}
          title={t('common.edit')}
        >
          <Pencil size={13} />
        </button>
        {!acc.is_system && (
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors"
            onClick={() => setDeleteConfirm({ type: 'account', id: acc.id, name: acc.name })}
            title={t('common.delete')}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )

  const renderCategoryItem = (cat: Category) => {
    const isCollapsed = collapsedCats.has(cat.id)
    return (
      <div key={cat.id}>
        <div className="flex items-center gap-3 px-4 sm:px-5 pl-6 sm:pl-10 py-2.5 border-b border-border bg-card hover:bg-muted/30 transition-colors">
          <button
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
            onClick={() => toggleCatCollapse(cat.id)}
          >
            {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
            <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
            <span className="text-sm font-medium text-foreground">{cat.name}</span>
            <span className="text-xs text-muted-foreground ml-2">({cat.chart_accounts?.length || 0})</span>
          </button>
          
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              onClick={() => openAccountDialog(null, cat.id)}
              title={t('chartAccounts.addAccount')}
            >
              <Plus size={13} />
            </button>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              onClick={() => openCatDialog(cat)}
              title={t('common.edit')}
            >
              <Pencil size={13} />
            </button>
            {!cat.is_system && (
              <button
                className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors"
                onClick={() => setDeleteConfirm({ type: 'category', id: cat.id, name: cat.name })}
                title={t('common.delete')}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
        {!isCollapsed && cat.chart_accounts?.map(renderAccountItem)}
      </div>
    )
  }

  const ungrouped = categoriesList?.filter((c) => !c.group_id) ?? []

  return (
    <div>
      <PageHeader section={t('nav.settings')} title={t('chartAccounts.title')} />

      <SectionCard>
        <SectionHeader
          title={t('chartAccounts.title')}
          titleExtra={
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                if (!groups) return
                const allCollapsed = groups.every((g) => collapsedGroups.has(g.id))
                if (allCollapsed) {
                  setCollapsedGroups(new Set())
                  setCollapsedCats(new Set())
                } else {
                  setCollapsedGroups(new Set(groups.map((g) => g.id)))
                  const allCatIds = groups.flatMap(g => g.categories.map(c => c.id))
                  setCollapsedCats(new Set(allCatIds))
                }
              }}
            >
              <ChevronsUpDown size={13} />
              {groups && groups.every((g) => collapsedGroups.has(g.id)) ? t('categories.expandAll') : t('categories.collapseAll')}
            </button>
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => openGroupDialog(null)}>
                <Plus size={13} /> <span className="hidden sm:inline">{t('groups.add')}</span>
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openCatDialog(null)}>
                <Plus size={13} /> <span className="hidden sm:inline">{t('categories.addCategory')}</span>
              </Button>
            </div>
          }
        />
        <div>
          {groups?.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id)
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border bg-muted/40">
                  <button
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => toggleGroupCollapse(group.id)}
                  >
                    {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
                    <CategoryIcon icon={group.icon} color={group.color} size="md" />
                    <span className="text-sm font-semibold" style={{ color: group.color }}>{group.name}</span>
                    <span className="text-xs text-muted-foreground">({group.categories.length})</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      onClick={() => openCatDialog(null, group.id)}
                      title={t('categories.addCategory')}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      onClick={() => openGroupDialog(group)}
                      title={t('common.edit')}
                    >
                      <Pencil size={13} />
                    </button>
                    {!group.is_system && (
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        onClick={() => setDeleteConfirm({ type: 'group', id: group.id, name: group.name })}
                        title={t('common.delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {!isCollapsed && group.categories.map(renderCategoryItem)}
              </div>
            )
          })}
          {ungrouped.length > 0 && (
            <div>
              <div className="px-5 py-3 border-b border-border bg-muted/40">
                <span className="text-sm font-semibold text-muted-foreground">{t('groups.noGroup')}</span>
              </div>
              {ungrouped.map(renderCategoryItem)}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={() => { setGroupDialogOpen(false); setEditingGroup(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? t('groups.edit') : t('groups.new')}</DialogTitle>
          </DialogHeader>
          <form
            key={editingGroup?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const data = {
                name: formData.get('name') as string,
                icon: formData.get('icon') as string,
                color: formData.get('color') as string,
                position: Number(formData.get('position')),
              }
              if (editingGroup) {
                updateGroupMutation.mutate({ id: editingGroup.id, ...data })
              } else {
                createGroupMutation.mutate(data)
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('groups.name')}</Label>
              <Input name="name" defaultValue={editingGroup?.name ?? ''} required />
            </div>
            <div className="space-y-2">
              <Label>{t('groups.position')}</Label>
              <Input type="number" name="position" defaultValue={editingGroup?.position ?? 0} required />
            </div>
            <div className="space-y-2">
              <Label>{t('groups.color')}</Label>
              <Input name="color" type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} required className="h-9 px-2 py-1" />
            </div>
            <div className="space-y-2">
              <Label>{t('groups.icon')}</Label>
              <IconPicker value={formIcon} color={formColor} onChange={setFormIcon} />
              <input type="hidden" name="icon" value={formIcon} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setGroupDialogOpen(false); setEditingGroup(null) }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={() => { setCatDialogOpen(false); setEditingCat(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? t('categories.editCategory') : t('categories.newCategory')}</DialogTitle>
          </DialogHeader>
          <form
            key={editingCat?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const data = {
                name: formData.get('name') as string,
                icon: formData.get('icon') as string,
                color: formData.get('color') as string,
                group_id: (formData.get('group_id') as string) || null,
              }
              if (editingCat) {
                updateCatMutation.mutate({ id: editingCat.id, ...data })
              } else {
                createCatMutation.mutate(data)
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('groups.name')}</Label>
              <Input name="name" defaultValue={editingCat?.name ?? ''} required />
            </div>
            <div className="space-y-2">
              <Label>{t('categories.group')}</Label>
              <select
                name="group_id"
                defaultValue={selectedParentGroupId}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t('categories.noGroup')}</option>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('groups.color')}</Label>
              <Input name="color" type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} required className="h-9 px-2 py-1" />
            </div>
            <div className="space-y-2">
              <Label>{t('groups.icon')}</Label>
              <IconPicker value={formIcon} color={formColor} onChange={setFormIcon} />
              <input type="hidden" name="icon" value={formIcon} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCatDialogOpen(false); setEditingCat(null) }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Chart Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={() => { setAccountDialogOpen(false); setEditingAccount(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? t('chartAccounts.editAccount') : t('chartAccounts.newAccount')}</DialogTitle>
          </DialogHeader>
          <form
            key={editingAccount?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const data = {
                name: formData.get('name') as string,
                code: (formData.get('code') as string) || null,
                icon: formData.get('icon') as string,
                color: formData.get('color') as string,
                category_id: formData.get('category_id') as string,
              }
              if (editingAccount) {
                updateAccountMutation.mutate({ id: editingAccount.id, ...data })
              } else {
                createAccountMutation.mutate(data)
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('groups.name')}</Label>
              <Input name="name" defaultValue={editingAccount?.name ?? ''} required />
            </div>
            <div className="space-y-2">
              <Label>{t('chartAccounts.code')}</Label>
              <Input name="code" defaultValue={editingAccount?.code ?? ''} placeholder="Ex: 3.1.2.05" />
            </div>
            <div className="space-y-2">
              <Label>{t('chartAccounts.category')}</Label>
              <select
                name="category_id"
                defaultValue={selectedParentCatId}
                required
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="" disabled>{t('common.selectCategory')}</option>
                {categoriesList?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('groups.color')}</Label>
              <Input name="color" type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} required className="h-9 px-2 py-1" />
            </div>
            <div className="space-y-2">
              <Label>{t('groups.icon')}</Label>
              <IconPicker value={formIcon} color={formColor} onChange={setFormIcon} />
              <input type="hidden" name="icon" value={formIcon} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAccountDialogOpen(false); setEditingAccount(null) }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteConfirm}
        title={t('common.delete')}
        description={t(
          deleteConfirm?.type === 'group' ? 'groups.confirmDeleteDesc' :
          deleteConfirm?.type === 'category' ? 'categories.confirmDeleteDesc' : 'chartAccounts.confirmDeleteDesc'
        ) || 'Are you sure?'}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          if (!deleteConfirm) return
          if (deleteConfirm.type === 'group') deleteGroupMutation.mutate(deleteConfirm.id)
          else if (deleteConfirm.type === 'category') deleteCatMutation.mutate(deleteConfirm.id)
          else deleteAccountMutation.mutate(deleteConfirm.id)
          setDeleteConfirm(null)
        }}
        onCancel={() => setDeleteConfirm(null)}
        variant="destructive"
      />
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { costCenters as costCentersApi } from '@/lib/api'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { Search, Trash2 } from 'lucide-react'
import type { CostCenter } from '@/types'

export default function CostCentersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)

  const { data: costCentersList, isLoading } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => costCentersApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<CostCenter>) => costCentersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] })
      setDialogOpen(false)
      toast.success(t('costCenters.created'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<CostCenter> & { id: string }) => costCentersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] })
      invalidateFinancialQueries(queryClient)
      setDialogOpen(false)
      setEditingCostCenter(null)
      toast.success(t('costCenters.updated'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => costCentersApi.delete(id),
    onSuccess: () => {
      invalidateFinancialQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] })
      setDialogOpen(false)
      setEditingCostCenter(null)
      toast.success(t('costCenters.deleted'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const openCreate = () => {
    setEditingCostCenter(null)
    setFormName('')
    setFormIsActive(true)
    setDialogOpen(true)
  }

  const openEdit = (cc: CostCenter) => {
    setEditingCostCenter(cc)
    setFormName(cc.name)
    setFormIsActive(cc.is_active)
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (editingCostCenter) {
      updateMutation.mutate({ id: editingCostCenter.id, name: formName, is_active: formIsActive })
    } else {
      createMutation.mutate({ name: formName, is_active: formIsActive })
    }
  }

  // Apenas mostramos os ativos e inativos, a exclusão apenas seta is_active para false.
  // A busca filtra por nome.
  const filtered = (costCentersList ?? []).filter(cc =>
    !search || cc.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        section={t('transactions.section')}
        title={t('costCenters.title')}
        action={
          <Button onClick={openCreate}>
            + {t('costCenters.add')}
          </Button>
        }
      />

      {/* Search */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-3 md:p-4 mb-4">
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            type="text"
            placeholder={t('costCenters.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full md:w-[300px] h-[38px] text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-4">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="text-xs font-medium text-muted-foreground py-3 w-[80px]">{t('costCenters.code')}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground py-3">{t('costCenters.name')}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground py-3 w-[120px]">{t('costCenters.status')}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cc) => (
                <TableRow
                  key={cc.id}
                  className="hover:bg-muted border-b border-border last:border-0"
                >
                  <TableCell className="py-3">
                    <span className="text-sm font-medium text-muted-foreground">{cc.code}</span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="text-sm font-semibold text-foreground">{cc.name}</span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${cc.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500'}`}>
                      {cc.is_active ? t('costCenters.active') : t('costCenters.inactive')}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(cc)}
                    >
                      {t('costCenters.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                    {t('costCenters.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCostCenter ? t('costCenters.edit') : t('costCenters.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t('costCenters.name')}</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>
            {editingCostCenter && (
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <Label htmlFor="isActive" className="cursor-pointer">{t('costCenters.active')}</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

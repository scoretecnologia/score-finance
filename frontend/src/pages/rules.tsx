import { useState, useMemo, useRef } from 'react'
import { getAccountName } from '@/lib/account-utils'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chartAccounts as chartAccountsApi, costCenters as costCentersApi, rules as rulesApi, accounts as accountsApi, payees as payeesApi } from '@/lib/api'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ChartAccount, CostCenter, Payee, Rule, RuleCondition, RuleAction } from '@/types'
import { Trash2, Plus, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Upload, Download, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { ChartAccountSelect } from '@/components/chart-account-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function CategoryCombobox({ 
  value, 
  onChange, 
  categories, 
  placeholder,
  error
}: { 
  value: string; 
  onChange: (val: string) => void; 
  categories: { id: string; name: string }[];
  placeholder?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  
  const selectedCat = categories.find(c => c.id === value)
  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background px-2 text-xs min-w-[220px] flex items-center justify-between text-left truncate",
            error && !value && "border-rose-500 text-rose-500"
          )}
        >
          <span className="truncate block pr-2">{selectedCat ? selectedCat.name : placeholder || "Selecione..."}</span>
          <ArrowUpDown size={12} className="opacity-50 shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex items-center border-b border-border px-3">
          <Search size={14} className="opacity-50" />
          <input
            className="flex-1 h-9 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar categoria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div 
          className="max-h-[200px] overflow-y-auto p-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 && (
            <p className="p-2 text-center text-sm text-muted-foreground">Nenhuma encontrada.</p>
          )}
          {filtered.map(cat => (
            <button
              key={cat.id}
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted/50 transition-colors",
                value === cat.id && "bg-primary/10 text-primary font-medium"
              )}
              onClick={() => {
                onChange(cat.id)
                setOpen(false)
                setSearch('')
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {children}
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {action}
    </div>
  )
}

const CONDITION_FIELDS = [
  { value: 'description', label: 'rules.fieldDescription' },
  { value: 'notes', label: 'rules.fieldNotes' },
  { value: 'amount', label: 'rules.fieldAmount' },
  { value: 'type', label: 'rules.fieldType' },
  { value: 'account_id', label: 'rules.fieldAccount' },
  { value: 'date', label: 'rules.fieldDate' },
] as const

const STRING_OPS = [
  { value: 'contains', label: 'rules.opContains' },
  { value: 'not_contains', label: 'rules.opNotContains' },
  { value: 'equals', label: 'rules.opEquals' },
  { value: 'not_equals', label: 'rules.opNotEquals' },
  { value: 'starts_with', label: 'rules.opStartsWith' },
  { value: 'ends_with', label: 'rules.opEndsWith' },
  { value: 'regex', label: 'rules.opRegex' },
]

const NUMERIC_OPS = [
  { value: 'equals', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
]

function getOpsForField(field: string) {
  if (field === 'amount' || field === 'date') return NUMERIC_OPS
  if (field === 'type') return [{ value: 'equals', label: 'rules.opIs' }]
  return STRING_OPS
}

function conditionSummary(conditions: RuleCondition[], conditionsOp: string, t: (key: string) => string): string {
  const fieldLabel = (f: string) => {
    const key = CONDITION_FIELDS.find(x => x.value === f)?.label
    return key ? t(key) : f
  }
  const opLabel = (f: string, op: string) => {
    const key = getOpsForField(f).find(x => x.value === op)?.label
    return key ? t(key) : op
  }
  const parts = conditions.map(c => `${fieldLabel(c.field)} ${opLabel(c.field, c.op)} "${c.value}"`)
  return parts.join(` ${conditionsOp === 'or' ? t('rules.orOp') : t('rules.andOp')} `) || t('rules.noConditions')
}

function actionSummary(actions: RuleAction[], chartAccounts: ChartAccount[], payeesList: Payee[], costCenters: CostCenter[], t: (key: string) => string): string {
  return actions.map(a => {
    if (a.op === 'set_category') {
      const acc = chartAccounts.find(c => c.id === a.value)
      return acc ? `→ ${acc.name}` : `→ ${t('transactions.category')}`
    }
    if (a.op === 'set_payee') {
      const p = payeesList.find(p => p.id === a.value)
      return p ? `→ ${t('payees.payee')}: ${p.name}` : `→ ${t('payees.payee')}`
    }
    if (a.op === 'set_cost_center') {
      const cc = costCenters.find(c => c.id === a.value)
      return cc ? `→ ${t('transactions.costCenter')}: ${cc.name}` : `→ ${t('transactions.costCenter')}`
    }
    if (a.op === 'append_notes') return `→ ${t('rules.fieldNotes')}: ${a.value}`
    return a.op
  }).join('  ') || t('rules.noActions')
}

export default function RulesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null)

  const { data: chartAccountsList } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: chartAccountsApi.list,
  })



  const { data: accountsList } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  })

  const { data: payeesList } = useQuery({
    queryKey: ['payees'],
    queryFn: payeesApi.list,
  })

  const { data: costCentersList } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => costCentersApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: (data: Omit<Rule, 'id' | 'user_id'>) => rulesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setDialogOpen(false)
      toast.success(t('rules.created'))
    },
    onError: (error: unknown) => {
      const err = error as { response?: { status?: number } }
      if (err?.response?.status === 409) {
        toast.error(t('rules.duplicateName'))
      } else {
        toast.error(t('common.error'))
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Rule> & { id: string }) => rulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setDialogOpen(false)
      setEditing(null)
      toast.success(t('rules.updated'))
    },
    onError: (error: unknown) => {
      const err = error as { response?: { status?: number } }
      if (err?.response?.status === 409) {
        toast.error(t('rules.duplicateName'))
      } else {
        toast.error(t('common.error'))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setDeleteTarget(null)
      toast.success(t('rules.deleted'))
    },
  })

  const applyAllMutation = useMutation({
    mutationFn: () => rulesApi.applyAll(),
    onSuccess: (data) => {
      invalidateFinancialQueries(queryClient)
      toast.success(t('rules.applied', { count: data.applied }))
    },
    onError: () => toast.error(t('common.error')),
  })

  const [page, setPage] = useState(1)

  const { data: rulesList } = useQuery({
    queryKey: ['rules', page],
    queryFn: () => rulesApi.list({ page, limit: 10 }),
    placeholderData: (prev) => prev,
  })

  const chartAccounts = chartAccountsList ?? []
  const payees = payeesList ?? []
  const costCenters = costCentersList ?? []

  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'category'>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedRules = useMemo(() => {
    const list = [...(rulesList?.items ?? [])]
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') {
      return list.sort((a, b) => dir * a.name.localeCompare(b.name))
    }
    if (sortBy === 'category') {
      const getCategoryName = (rule: Rule) => {
        const action = rule.actions.find(a => a.op === 'set_category')
        if (!action) return ''
        const acc = chartAccounts.find(c => c.id === action.value)
        return acc?.name ?? ''
      }
      return list.sort((a, b) => dir * getCategoryName(a).localeCompare(getCategoryName(b)))
    }
    return list.sort((a, b) => dir * (a.priority - b.priority))
  }, [rulesList, chartAccounts, sortBy, sortDir])

  function downloadTemplate() {
    const header = ['Nome da Regra', 'Descrição', 'Tipo', 'Categoria']
    const example = {
      'Nome da Regra': 'Uber',
      'Descrição': 'UBER',
      'Tipo': 'debit',
      'Categoria': 'Transporte',
    }

    const ws = XLSX.utils.json_to_sheet([example], { header })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'rules')
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rules-template.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader section={t('rules.section')} title={t('nav.rules')} />

      <SectionCard>
        <SectionHeader
          title={t('rules.sectionTitle')}
          action={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={downloadTemplate}
              >
                <Download size={12} />
                <span className="hidden sm:inline">{t('rules.downloadTemplate')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload size={12} />
                <span className="hidden sm:inline">{t('rules.importXlsx')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => applyAllMutation.mutate()}
                disabled={applyAllMutation.isPending}
              >
                <RefreshCw size={12} />
                <span className="hidden sm:inline">{t('rules.reapplyAll')}</span>
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditing(null); setDialogOpen(true) }}>
                <Plus size={13} /> <span className="hidden sm:inline">{t('rules.add')}</span>
              </Button>
            </div>
          }
        />
        <div className="px-4 sm:px-5 py-2 bg-muted/50 border-b border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('rules.sortLabel')}</span>
          {(['priority', 'name', 'category'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => {
                if (sortBy === opt) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                else { setSortBy(opt); setSortDir('asc') }
              }}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                sortBy === opt
                  ? 'bg-background border border-border text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              )}
            >
              {t(`rules.sortBy_${opt}`)}
              {sortBy === opt
                ? sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                : <ArrowUpDown size={11} className="opacity-30" />}
            </button>
          ))}
        </div>
        {rulesList && rulesList.items.length > 0 ? (
          <div className="divide-y divide-border">
            {sortedRules.map((rule) => (
              <div
                key={rule.id}
                className="px-4 sm:px-5 py-3 hover:bg-muted transition-colors cursor-pointer"
                onClick={() => { setEditing(rule); setDialogOpen(true) }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                      {!rule.is_active && (
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0 rounded-full">
                          {t('rules.inactive')}
                        </span>
                      )}
                      <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0 rounded-full">
                        p:{rule.priority}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {conditionSummary(rule.conditions, rule.conditions_op, t)}
                    </p>
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      {actionSummary(rule.actions, chartAccounts, payees, costCenters, t)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(rule) }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">{t('rules.empty')}</p>
        )}
      </SectionCard>

      {rulesList && rulesList.total > 10 && (
        <div className="flex items-center justify-center gap-2 pt-4 pb-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(rulesList.total / 10)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(rulesList.total / 10)}
            onClick={() => setPage(page + 1)}
          >
            Próximo
          </Button>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('rules.confirmDeleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('rules.confirmDeleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={!deleteTarget || deleteMutation.isPending}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportRulesDialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} />

      <RuleDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        rule={editing}
        accounts={accountsList ?? []}
        payees={payees}
        costCenters={costCenters}
        onSave={(data) => {
          if (editing) {
            updateMutation.mutate({ id: editing.id, ...data })
          } else {
            createMutation.mutate(data as Omit<Rule, 'id' | 'user_id'>)
          }
        }}
        loading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}

type ParsedRuleRow = {
  id: number
  name: string
  description: string
  type: string
  categoryId: string
}

function ImportRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [step, setStep] = useState<1 | 2>(1)
  const [isImporting, setIsImporting] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedRuleRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string>('')

  const { data: chartAccountsList } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: chartAccountsApi.list,
  })
  const chartAccounts = useMemo(() => {
    return [...(chartAccountsList ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  }, [chartAccountsList])

  async function handleFile(file: File) {
    setIsImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]

      const newRows: ParsedRuleRow[] = []
      rows.forEach((row, idx) => {
        const name = String(row['Nome da Regra'] ?? '').trim()
        if (!name) return

        const description = String(row['Descrição'] ?? '').trim()
        const rawType = String(row['Tipo'] ?? '').trim().toLowerCase()
        const type = rawType === 'crédito' || rawType === 'credito' || rawType === 'credit' ? 'credit' : 'debit'
        
        const categoryName = String(row['Categoria'] ?? '').trim()
        let categoryId = ''
        if (categoryName) {
          const match = chartAccounts.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
          if (match) categoryId = match.id
        }

        newRows.push({
          id: idx,
          name,
          description,
          type,
          categoryId
        })
      })

      if (newRows.length === 0) {
        toast.error(t('rules.importEmpty'))
        return
      }

      setParsedRows(newRows)
      setStep(2)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function toggleAll() {
    if (selectedIds.size === parsedRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(parsedRows.map(r => r.id)))
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function applyBulkCategory() {
    if (!bulkCategory) return
    setParsedRows(prev => prev.map(r => selectedIds.has(r.id) ? { ...r, categoryId: bulkCategory } : r))
  }

  async function handleConfirm() {
    const invalid = parsedRows.some(r => !r.categoryId)
    if (invalid) {
      toast.error('Selecione a categoria para todas as regras.')
      return
    }

    const rulesToImport: Omit<Rule, 'id' | 'user_id'>[] = parsedRows.map(r => {
      const conditions: RuleCondition[] = []
      if (r.description) conditions.push({ field: 'description', op: 'contains', value: r.description })
      conditions.push({ field: 'type', op: 'equals', value: r.type })

      return {
        name: r.name,
        conditions_op: 'and',
        priority: 0,
        is_active: true,
        conditions,
        actions: [{ op: 'set_category', value: r.categoryId }]
      }
    })

    setIsImporting(true)
    try {
      const res = await rulesApi.bulkImport(rulesToImport)
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      const msg = res.skipped > 0
        ? t('rules.importedWithSkipped', { imported: res.imported, skipped: res.skipped })
        : t('rules.imported', { count: res.imported })
      toast.success(msg)
      handleClose()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsImporting(false)
    }
  }

  function handleClose() {
    setStep(1)
    setParsedRows([])
    setSelectedIds(new Set())
    setBulkCategory('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 2 ? 'sm:max-w-6xl max-w-[95vw]' : 'sm:max-w-lg max-w-[95vw]'}>
        <DialogHeader>
          <DialogTitle>{t('rules.importTitle')}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Baixe o template, preencha e importe aqui.</p>
              <div className="text-xs text-muted-foreground font-mono bg-muted/40 rounded-lg p-3 border border-border">
                Nome da Regra, Descrição, Tipo, Categoria
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="gap-2">
                <Upload size={14} />
                {isImporting ? t('common.loading') : t('rules.selectFile')}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-end gap-2 bg-muted/50 p-3 rounded-lg border border-border">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Categorizar selecionados</Label>
                <div className="h-9">
                  <CategoryCombobox
                    value={bulkCategory}
                    onChange={setBulkCategory}
                    categories={chartAccounts}
                    placeholder="Selecione uma categoria..."
                  />
                </div>
              </div>
              <Button variant="secondary" size="sm" className="h-8" onClick={applyBulkCategory}>
                Aplicar
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
                    <tr>
                      <th className="px-3 py-2 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={parsedRows.length > 0 && selectedIds.size === parsedRows.length}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Regra</th>
                      <th className="px-3 py-2 font-medium">Descrição</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Categoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleOne(row.id)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input 
                            className="h-8 text-xs min-w-[160px]" 
                            value={row.name}
                            onChange={(e) => setParsedRows(prev => prev.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input 
                            className="h-8 text-xs min-w-[200px] whitespace-normal" 
                            value={row.description}
                            onChange={(e) => setParsedRows(prev => prev.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs min-w-[120px]"
                            value={row.type}
                            onChange={(e) => setParsedRows(prev => prev.map(r => r.id === row.id ? { ...r, type: e.target.value } : r))}
                          >
                            <option value="debit">Despesa</option>
                            <option value="credit">Receita</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <CategoryCombobox
                            value={row.categoryId}
                            onChange={(val) => setParsedRows(prev => prev.map(r => r.id === row.id ? { ...r, categoryId: val } : r))}
                            categories={chartAccounts}
                            error={true}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
              <Button onClick={handleConfirm} disabled={isImporting}>
                {isImporting ? t('common.loading') : 'Confirmar Importação'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RuleDialog({
  open, onClose, rule, accounts, payees, costCenters, onSave, loading,
}: {
  open: boolean
  onClose: () => void
  rule: Rule | null
  
  accounts: { id: string; name: string }[]
  payees: Payee[]
  costCenters: CostCenter[]
  onSave: (data: Partial<Rule>) => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(rule?.name ?? '')
  const [conditionsOp, setConditionsOp] = useState<'and' | 'or'>(rule?.conditions_op ?? 'and')
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule?.conditions?.length ? rule.conditions as RuleCondition[] : [{ field: 'description', op: 'contains', value: '' }]
  )
  const [actions, setActions] = useState<RuleAction[]>(
    rule?.actions?.length ? rule.actions as RuleAction[] : [{ op: 'set_category', value: '' }]
  )
  const [priority, setPriority] = useState(rule?.priority ?? 0)
  const [isActive, setIsActive] = useState(rule?.is_active ?? true)

  const selectClass = 'border border-border rounded-lg px-2 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

  function updateCondition(i: number, field: keyof RuleCondition, val: string | number) {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  function addCondition() {
    setConditions(prev => [...prev, { field: 'description', op: 'contains', value: '' }])
  }

  function updateAction(i: number, field: keyof RuleAction, val: string) {
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a))
  }

  function removeAction(i: number) {
    setActions(prev => prev.filter((_, idx) => idx !== i))
  }

  function addAction() {
    setActions(prev => [...prev, { op: 'set_category', value: '' }])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ name, conditions_op: conditionsOp, conditions, actions, priority, is_active: isActive })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? t('rules.editRule') : t('rules.newRule')}</DialogTitle>
        </DialogHeader>
        <form key={rule?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-5">
          {/* Name + Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>{t('rules.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Uber" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('rules.priority')}</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('rules.conditions')}</Label>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {(['and', 'or'] as const).map(op => (
                  <button
                    key={op}
                    type="button"
                    className={cn(
                      'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                      conditionsOp === op ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setConditionsOp(op)}
                  >
                    {op === 'and' ? t('rules.andOp') : t('rules.orOp')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${selectClass} w-32 shrink-0`}
                    value={cond.field}
                    onChange={(e) => updateCondition(i, 'field', e.target.value)}
                  >
                    {CONDITION_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{t(f.label)}</option>
                    ))}
                  </select>
                  <select
                    className={`${selectClass} w-32 shrink-0`}
                    value={cond.op}
                    onChange={(e) => updateCondition(i, 'op', e.target.value)}
                  >
                    {getOpsForField(cond.field).map(o => (
                      <option key={o.value} value={o.value}>{t(o.label)}</option>
                    ))}
                  </select>
                  {cond.field === 'type' ? (
                    <select
                      className={`${selectClass} flex-1`}
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, 'value', e.target.value)}
                    >
                      <option value="debit">{t('rules.typeExpense')}</option>
                      <option value="credit">{t('rules.typeIncome')}</option>
                    </select>
                  ) : cond.field === 'account_id' ? (
                    <select
                      className={`${selectClass} flex-1`}
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, 'value', e.target.value)}
                    >
                      <option value="">{t('rules.selectAccount')}</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{getAccountName(acc)}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      className="flex-1 h-8 text-sm"
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, 'value', e.target.value)}
                      placeholder={cond.field === 'amount' ? '0.00' : cond.field === 'date' ? 'YYYY-MM-DD' : t('rules.valuePlaceholder')}
                      type={cond.field === 'amount' ? 'number' : cond.field === 'date' ? 'date' : 'text'}
                    />
                  )}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-rose-500 transition-colors shrink-0"
                    onClick={() => removeCondition(i)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                onClick={addCondition}
              >
                <Plus size={12} /> {t('rules.addCondition')}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label>{t('rules.actions')}</Label>
            <div className="space-y-2">
              {actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${selectClass} w-40 shrink-0`}
                    value={action.op}
                    onChange={(e) => updateAction(i, 'op', e.target.value)}
                  >
                    <option value="set_category">{t('rules.setCategory')}</option>
                    <option value="set_payee">{t('rules.setPayee')}</option>
                    <option value="set_cost_center">{t('rules.setCostCenter')}</option>
                    <option value="append_notes">{t('rules.appendNotes')}</option>
                  </select>
                  {action.op === 'set_category' ? (
                    <ChartAccountSelect
                      className={`${selectClass} flex-1`}
                      value={action.value}
                      onChange={(e) => updateAction(i, 'value', e.target.value)}
                    />
                  ) : action.op === 'set_payee' ? (
                    <select
                      className={`${selectClass} flex-1`}
                      value={action.value}
                      onChange={(e) => updateAction(i, 'value', e.target.value)}
                      required
                    >
                      <option value="">{t('rules.selectPayee')}</option>
                      {payees.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ) : action.op === 'set_cost_center' ? (
                    <select
                      className={`${selectClass} flex-1`}
                      value={action.value}
                      onChange={(e) => updateAction(i, 'value', e.target.value)}
                      required
                    >
                      <option value="">{t('rules.selectCostCenter')}</option>
                      {costCenters.filter(cc => cc.is_active).map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      className="flex-1 h-8 text-sm"
                      value={action.value}
                      onChange={(e) => updateAction(i, 'value', e.target.value)}
                      placeholder="Ex: #work #reimbursable"
                    />
                  )}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-rose-500 transition-colors shrink-0"
                    onClick={() => removeAction(i)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                onClick={addAction}
              >
                <Plus size={12} /> {t('rules.addAction')}
              </button>
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-foreground">{t('rules.ruleActive')}</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


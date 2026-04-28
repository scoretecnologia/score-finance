import { useState, useMemo, useRef } from 'react'
import { getAccountName } from '@/lib/account-utils'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chartAccounts as chartAccountsApi, rules as rulesApi, accounts as accountsApi, payees as payeesApi } from '@/lib/api'
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
import type { ChartAccount, Payee, Rule, RuleCondition, RuleAction } from '@/types'
import { Trash2, Plus, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, Upload, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { ChartAccountSelect } from '@/components/chart-account-select'

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

function actionSummary(actions: RuleAction[], chartAccounts: ChartAccount[], payeesList: Payee[], t: (key: string) => string): string {
  return actions.map(a => {
    if (a.op === 'set_category') {
      const acc = chartAccounts.find(c => c.id === a.value)
      return acc ? `→ ${acc.name}` : `→ ${t('transactions.category')}`
    }
    if (a.op === 'set_payee') {
      const p = payeesList.find(p => p.id === a.value)
      return p ? `→ ${t('payees.payee')}: ${p.name}` : `→ ${t('payees.payee')}`
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

  const { data: rulesList } = useQuery({
    queryKey: ['rules'],
    queryFn: rulesApi.list,
  })

  const chartAccounts = chartAccountsList ?? []
  const payees = payeesList ?? []

  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'category'>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedRules = useMemo(() => {
    const list = [...(rulesList ?? [])]
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
    const header = ['name', 'conditions_op', 'priority', 'is_active', 'conditions', 'actions']
    const example = {
      name: 'Uber',
      conditions_op: 'or',
      priority: 10,
      is_active: true,
      conditions: JSON.stringify([{ field: 'description', op: 'starts_with', value: 'UBER' }]),
      actions: JSON.stringify([{ op: 'append_notes', value: 'tag:uber' }]),
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
        {rulesList && rulesList.length > 0 ? (
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
                      {actionSummary(rule.actions, chartAccounts, payees, t)}
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

function parseBoolean(val: unknown, defaultValue: boolean) {
  if (val === null || val === undefined || val === '') return defaultValue
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val !== 0
  if (typeof val === 'string') {
    const v = val.trim().toLowerCase()
    if (['true', '1', 'sim', 's', 'yes', 'y'].includes(v)) return true
    if (['false', '0', 'nao', 'não', 'n', 'no'].includes(v)) return false
  }
  return defaultValue
}

function parseJsonArray(val: unknown) {
  if (Array.isArray(val)) return val
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return null
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : null
  }
  return null
}

function ImportRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleFile(file: File) {
    setIsImporting(true)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]

      const parsedRules: Omit<Rule, 'id' | 'user_id'>[] = []
      const errors: string[] = []

      rows.forEach((row, idx) => {
        const name = String(row.name ?? '').trim()
        if (!name) {
          errors.push(t('rules.importRowMissingName', { row: idx + 2 }))
          return
        }

        const conditions = parseJsonArray(row.conditions)
        if (!conditions) {
          errors.push(t('rules.importRowInvalidConditions', { row: idx + 2 }))
          return
        }

        const actions = parseJsonArray(row.actions)
        if (!actions) {
          errors.push(t('rules.importRowInvalidActions', { row: idx + 2 }))
          return
        }

        const conditionsOpRaw = String(row.conditions_op ?? 'and').trim().toLowerCase()
        const conditions_op = (conditionsOpRaw === 'or' ? 'or' : 'and') as 'and' | 'or'
        const priority = Number(row.priority ?? 0) || 0
        const is_active = parseBoolean(row.is_active, true)

        parsedRules.push({
          name,
          conditions_op,
          priority,
          is_active,
          conditions: conditions as RuleCondition[],
          actions: actions as RuleAction[],
        })
      })

      if (errors.length > 0) {
        toast.error(errors[0])
        return
      }

      if (parsedRules.length === 0) {
        toast.error(t('rules.importEmpty'))
        return
      }

      const res = await rulesApi.bulkImport(parsedRules)
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      const msg = res.skipped > 0
        ? t('rules.importedWithSkipped', { imported: res.imported, skipped: res.skipped })
        : t('rules.imported', { count: res.imported })
      toast.success(msg)
      onClose()
      setFileName(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      toast.error(t('common.error'))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('rules.importTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('rules.importHelp')}</p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/40 rounded-lg p-3 border border-border">
            name, conditions_op, priority, is_active, conditions, actions
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
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setFileName(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
              onClose()
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="gap-2"
          >
            <Upload size={14} />
            {isImporting ? (fileName ?? t('rules.importing')) : t('rules.selectFile')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RuleDialog({
  open, onClose, rule, accounts, payees, onSave, loading,
}: {
  open: boolean
  onClose: () => void
  rule: Rule | null
  
  accounts: { id: string; name: string }[]
  payees: Payee[]
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


import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chartAccounts as accountsApi, budgets as budgetsApi } from '@/lib/api'
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
import type { Budget } from '@/types'
import { Pencil, Trash2, Plus, Repeat, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { PageHeader } from '@/components/page-header'
import { CategoryIcon } from '@/components/category-icon'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { useAuth } from '@/contexts/auth-context'
import { useCompany } from '@/contexts/company-context'
import { ChartAccountSelect } from '@/components/chart-account-select'

function formatCurrency(value: number, _currency?: string, _locale?: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const TH = 'text-xs font-medium text-muted-foreground py-3'

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

export default function BudgetsPage() {
  const { t, i18n } = useTranslation()
  const { mask } = usePrivacyMode()
  const { user } = useAuth()
  const { currentCompany } = useCompany()
  const canManage = currentCompany?.role === 'owner' || currentCompany?.role === 'admin'
  const userCurrency = user?.preferences?.currency_display ?? 'BRL'
  const locale = i18n.language === 'en' ? 'en-US' : i18n.language
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [monthCalOpen, setMonthCalOpen] = useState(false)
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const monthParam = `${selectedMonth}-01`
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [chartAccountId, setChartAccountId] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null)

  const { data: budgetsList } = useQuery({
    queryKey: ['budgets', selectedMonth],
    queryFn: () => budgetsApi.list(monthParam),
  })

  const { data: chartAccountsList } = useQuery({
    queryKey: ['chart-accounts'],
    queryFn: accountsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (data: { category_id?: string; chart_account_id?: string; amount: number; month: string; is_recurring?: boolean; recurrence_end?: string }) =>
      budgetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      setDialogOpen(false)
      setChartAccountId('')
      toast.success(t('budgets.created'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      budgetsApi.update(id, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      setDialogOpen(false)
      setEditing(null)
      setChartAccountId('')
      toast.success(t('budgets.updated'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, month }: { id: string; month?: string }) => budgetsApi.delete(id, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success(t('budgets.deleted'))
    },
  })

  const getCategoryDisplay = (id?: string | null) => {
    if (!id) return <span>-</span>
    const acc = chartAccountsList?.find((c) => c.id === id)
    if (acc) {
      return (
        <span className="flex items-center gap-2">
          <CategoryIcon icon={acc.icon || 'HelpCircle'} color={acc.color || '#888'} size="sm" />
          <span>{acc.name}</span>
        </span>
      )
    }
    return <span>{id}</span>
  }

  const monthTitle = new Date(selectedMonth + '-02').toLocaleDateString(locale, { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())

  return (
    <div>
      <PageHeader
        section={t('budgets.title')}
        title={monthTitle}
        action={
          <div className="flex items-center gap-1">
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-border hover:text-foreground transition-all text-base"
              onClick={() => {
                const [y, m] = selectedMonth.split('-').map(Number)
                const d = new Date(y, m - 2, 1)
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }}
            >‹</button>
            <Popover open={monthCalOpen} onOpenChange={setMonthCalOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground hover:bg-muted/50 transition-all cursor-pointer min-w-[180px]"
                >
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  {monthTitle}
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-auto p-0">
                <Calendar
                  mode="single"
                  locale={dateFnsLocale}
                  selected={new Date(`${selectedMonth}-01T00:00:00`)}
                  defaultMonth={new Date(`${selectedMonth}-01T00:00:00`)}
                  onSelect={(date) => {
                    if (!date) return
                    setSelectedMonth(format(date, 'yyyy-MM'))
                    setMonthCalOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-border hover:text-foreground transition-all text-base"
              onClick={() => {
                const [y, m] = selectedMonth.split('-').map(Number)
                const d = new Date(y, m, 1)
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }}
            >›</button>
          </div>
        }
      />

      <SectionCard>
        <SectionHeader
          title={t('budgets.title')}
          action={
            canManage && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditing(null); setChartAccountId(''); setIsRecurring(false); setDialogOpen(true) }}>
                <Plus size={13} /> {t('budgets.add')}
              </Button>
            )
          }
        />
        {budgetsList && budgetsList.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={`${TH} pl-4 sm:pl-5 text-left`}>{t('budgets.category')}</th>
                <th className={`${TH} text-left w-36`}>{t('budgets.amount')}</th>
                {canManage && <th className={`${TH} pr-4 sm:pr-5 text-right w-24`}>{t('budgets.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {budgetsList.map((budget) => (
                <tr key={budget.id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                  <td className="py-3 pl-4 sm:pl-5 text-sm font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      {getCategoryDisplay(budget.chart_account_id || budget.category_id)}
                      {budget.is_recurring && (
                        <span title={t('budgets.recurringLabel')} className="text-muted-foreground">
                          <Repeat size={12} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-sm font-semibold tabular-nums text-foreground">{mask(formatCurrency(budget.amount, userCurrency, locale))}</td>
                  {canManage && (
                    <td className="py-3 pr-4 sm:pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                          onClick={() => { setEditing(budget); setChartAccountId(budget.chart_account_id || budget.category_id || ''); setDialogOpen(true) }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          onClick={() => {
                            setBudgetToDelete(budget)
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">{t('budgets.empty')}</p>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); setChartAccountId(''); setIsRecurring(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('budgets.edit') : t('budgets.add')}</DialogTitle>
          </DialogHeader>
          <form
            key={editing?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              if (editing) {
                updateMutation.mutate({
                  id: editing.id,
                  amount: parseFloat(formData.get('amount') as string),
                })
              } else {
                const selectedCat = chartAccountId || (formData.get('chart_account_id') as string)
                if (!selectedCat) {
                  toast.error(t('transactions.noCategory'))
                  return
                }
                const isRec = formData.get('is_recurring') === 'on'
                const endMonth = formData.get('recurrence_end_month') as string
                const endYear = formData.get('recurrence_end_year') as string
                let recurrence_end: string | undefined = undefined
                if (isRec && endMonth && endYear) {
                  recurrence_end = `${endYear}-${endMonth}-01`
                }
                createMutation.mutate({
                  chart_account_id: selectedCat,
                  amount: parseFloat(formData.get('amount') as string),
                  month: monthParam,
                  is_recurring: isRec,
                  recurrence_end,
                })
              }
            }}
            className="space-y-4"
          >
            {!editing && (
              <>
                <div className="space-y-2">
                  <Label>{t('budgets.category')}</Label>
                  <ChartAccountSelect
                    name="chart_account_id"
                    value={chartAccountId}
                    onChange={(e) => setChartAccountId(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_recurring"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{t('budgets.repeatEveryMonth')}</span>
                </label>
                {isRecurring && (
                  <div className="space-y-2 border-l-2 border-primary/20 pl-3">
                    <Label className="text-xs text-muted-foreground">Terminar repetição em (opcional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Mês</Label>
                        <select
                          name="recurrence_end_month"
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Selecione...</option>
                          {Array.from({ length: 12 }, (_, i) => {
                            const d = new Date(2000, i, 1);
                            const val = String(i + 1).padStart(2, '0');
                            const label = d.toLocaleDateString(locale, { month: 'long' }).replace(/^\w/, c => c.toUpperCase());
                            return (
                              <option key={val} value={val}>{label}</option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ano</Label>
                        <select
                          name="recurrence_end_year"
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Selecione...</option>
                          {(() => {
                            const currentYear = new Date().getFullYear();
                            return [currentYear, currentYear + 1, currentYear + 2].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ));
                          })()}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>{t('budgets.amount')}</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                defaultValue={editing?.amount?.toString() ?? ''}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setChartAccountId(''); setIsRecurring(false); }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!budgetToDelete} onOpenChange={(open) => { if (!open) setBudgetToDelete(null) }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            {budgetToDelete?.is_recurring ? (
              <>
                Este é um orçamento recorrente. Deseja excluir este orçamento de <strong>todos os meses</strong> ou apenas de <strong>{monthTitle}</strong>?
              </>
            ) : (
              <>
                Tem certeza de que deseja excluir o orçamento de <strong>{monthTitle}</strong>? Esta ação não pode ser desfeita.
              </>
            )}
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBudgetToDelete(null)}
            >
              Cancelar
            </Button>
            {budgetToDelete?.is_recurring && (
              <Button
                type="button"
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                onClick={() => {
                  if (budgetToDelete) {
                    deleteMutation.mutate({ id: budgetToDelete.id, month: monthParam })
                  }
                  setBudgetToDelete(null)
                }}
                disabled={deleteMutation.isPending}
              >
                Apenas deste mês
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (budgetToDelete) {
                  deleteMutation.mutate({ id: budgetToDelete.id })
                }
                setBudgetToDelete(null)
              }}
              disabled={deleteMutation.isPending}
            >
              {budgetToDelete?.is_recurring ? 'Todos os meses' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


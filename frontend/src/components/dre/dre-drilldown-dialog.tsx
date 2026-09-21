import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { reports } from '@/lib/api'
import { formatBRL } from '@/lib/dre-utils'
import {
  Search,
  Download,
  Calendar,
  Building2,
  FileSpreadsheet,
  ArrowDownRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DRETransactionItem } from '@/types'

export interface DREDrilldownParams {
  row_key: string
  row_label: string
  row_code?: string | null
  row_level: number
  year: number
  month?: number | null
  month_label?: string | null
  regime: 'competencia' | 'caixa'
  cost_center_id?: string
  company_name?: string
}

interface DREDDrilldownDialogProps {
  isOpen: boolean
  onClose: () => void
  params: DREDrilldownParams | null
}

// Colunas ordenáveis da listagem
type SortKey = 'date' | 'description' | 'account_name' | 'chart_name' | 'cost_center_name' | 'net_amount'
type SortDir = 'asc' | 'desc'

// Ao trocar de coluna, cada tipo de dado tem uma direção inicial que faz sentido:
// texto começa em A→Z, data e valor começam do maior para o menor.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: 'desc',
  description: 'asc',
  account_name: 'asc',
  chart_name: 'asc',
  cost_center_name: 'asc',
  net_amount: 'desc',
}

export const DREDrilldownDialog: React.FC<DREDDrilldownDialogProps> = ({
  isOpen,
  onClose,
  params,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'debit' | 'credit'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['dre-drilldown', params],
    queryFn: () => {
      if (!params) return null
      return reports.dreDrilldown({
        row_key: params.row_key,
        year: params.year,
        month: params.month ?? undefined,
        regime: params.regime,
        cost_center_id: params.cost_center_id,
      })
    },
    enabled: isOpen && !!params,
  })

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(DEFAULT_DIR[key])
    }
  }

  // Filtragem dos lançamentos em tempo real
  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    const term = searchTerm.toLowerCase().trim()

    return data.items.filter((item) => {
      // Filtro de tipo
      if (typeFilter === 'debit' && item.net_amount >= 0) return false
      if (typeFilter === 'credit' && item.net_amount < 0) return false

      // Busca textual
      if (!term) return true
      const desc = (item.description || '').toLowerCase()
      const payee = (item.payee || '').toLowerCase()
      const acc = (item.account_name || '').toLowerCase()
      const chart = (item.chart_name || '').toLowerCase()
      const code = (item.chart_code || '').toLowerCase()
      const cc = (item.cost_center_name || '').toLowerCase()
      const notes = (item.notes || '').toLowerCase()
      const amt = item.amount.toString()

      return (
        desc.includes(term) ||
        payee.includes(term) ||
        acc.includes(term) ||
        chart.includes(term) ||
        code.includes(term) ||
        cc.includes(term) ||
        notes.includes(term) ||
        amt.includes(term)
      )
    })
  }, [data?.items, searchTerm, typeFilter])

  // Ordenação: valores vazios sempre por último, independente da direção
  const sortedItems = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1

    return [...filteredItems].sort((a, b) => {
      if (sortKey === 'net_amount') {
        return (a.net_amount - b.net_amount) * factor
      }

      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1

      // Datas vêm em ISO (AAAA-MM-DD), então a comparação textual já é cronológica
      if (sortKey === 'date') return av.localeCompare(bv) * factor
      return av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' }) * factor
    })
  }, [filteredItems, sortKey, sortDir])

  // Total dos itens filtrados
  const filteredTotal = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + it.net_amount, 0)
  }, [filteredItems])

  // Exportar para CSV — respeita filtros e ordenação da tela
  const handleExportCSV = () => {
    if (sortedItems.length === 0) return

    const headers = [
      'Data',
      'Descrição',
      'Beneficiário',
      'Conta Bancária',
      'Código Contábil',
      'Conta Analítica',
      'Centro de Custo',
      'Tipo',
      'Valor Líquido (R$)',
    ]

    const rows = sortedItems.map((item: DRETransactionItem) => [
      item.date,
      `"${(item.description || '').replace(/"/g, '""')}"`,
      `"${(item.payee || '').replace(/"/g, '""')}"`,
      `"${(item.account_name || '').replace(/"/g, '""')}"`,
      item.chart_code || '',
      `"${(item.chart_name || '').replace(/"/g, '""')}"`,
      `"${(item.cost_center_name || '').replace(/"/g, '""')}"`,
      item.type,
      item.net_amount.toFixed(2).replace('.', ','),
    ])

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dre_lancamentos_${params?.month_label || params?.year}_${params?.row_code || 'detalhes'}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Formatar data DD/MM/AAAA
  const formatDate = (isoStr: string) => {
    if (!isoStr) return ''
    const parts = isoStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return isoStr
  }

  // Cabeçalho de coluna clicável. A seta fica esmaecida enquanto a coluna não é a ativa.
  const SortHeader = ({
    label,
    columnKey,
    align = 'left',
  }: {
    label: string
    columnKey: SortKey
    align?: 'left' | 'right'
  }) => {
    const active = sortKey === columnKey
    const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown

    return (
      <th
        scope="col"
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className="px-3 py-0 border-b border-border"
      >
        <button
          type="button"
          onClick={() => toggleSort(columnKey)}
          className={cn(
            'group/sort flex w-full items-center gap-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer select-none',
            align === 'right' && 'justify-end',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="truncate">{label}</span>
          <Icon
            className={cn(
              'h-3 w-3 shrink-0 transition-opacity',
              active ? 'opacity-100 text-primary' : 'opacity-0 group-hover/sort:opacity-50'
            )}
          />
        </button>
      </th>
    )
  }

  const isEmpty = !isLoading && !error && sortedItems.length === 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[96vw] max-w-[96vw] sm:max-w-[1440px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden border border-border shadow-2xl bg-card rounded-xl"
      >
        {/* Cabeçalho do Modal */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {params?.row_code && (
                  <Badge variant="secondary" className="font-mono text-xs font-semibold px-2 py-0.5">
                    {params.row_code}
                  </Badge>
                )}
                <DialogTitle
                  className="text-lg font-semibold tracking-tight text-foreground truncate"
                  title={params?.row_label || data?.title || undefined}
                >
                  {params?.row_label || data?.title || 'Detalhes da Célula'}
                </DialogTitle>
              </div>

              <DialogDescription className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground/70">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {params?.month_label ? params.month_label : `Ano ${params?.year}`}
                </span>
                <span className="text-border">|</span>
                <span>{params?.regime === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'}</span>
                {params?.company_name && (
                  <>
                    <span className="text-border">|</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" />
                      {params.company_name}
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>

            {/* Totalizador em Destaque */}
            <div
              className={cn(
                'shrink-0 self-start rounded-lg border px-4 py-2 flex flex-col items-end justify-center whitespace-nowrap',
                (data?.total_amount ?? 0) >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                Total Consolidado
              </span>
              <span className="text-lg font-semibold font-mono tabular-nums leading-tight">
                {isLoading ? '—' : formatBRL(data?.total_amount ?? 0)}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Barra de Filtros e Busca */}
        <div className="shrink-0 px-6 py-3 border-b border-border/60 bg-muted/20 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, favorecido, conta ou valor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-background border-border/60"
              />
            </div>

            <div className="flex items-center shrink-0 rounded-md border border-border/60 p-0.5 bg-background text-xs">
              <button
                onClick={() => setTypeFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                  typeFilter === 'all'
                    ? 'bg-muted shadow-xs text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setTypeFilter('debit')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer',
                  typeFilter === 'debit'
                    ? 'bg-muted shadow-xs text-rose-600 dark:text-rose-400 font-semibold'
                    : 'text-muted-foreground hover:text-rose-600'
                )}
              >
                <ArrowDownRight className="h-3 w-3" />
                Saídas
              </button>
              <button
                onClick={() => setTypeFilter('credit')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer',
                  typeFilter === 'credit'
                    ? 'bg-muted shadow-xs text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-muted-foreground hover:text-emerald-600'
                )}
              >
                <ArrowUpRight className="h-3 w-3" />
                Entradas
              </button>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            disabled={sortedItems.length === 0}
            className="h-8 text-xs px-3 gap-1.5 shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>

        {/* Listagem — largura fixa em percentuais, então nunca gera rolagem lateral */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-16 px-4 text-center text-sm text-destructive">
              Ocorreu um erro ao carregar os lançamentos. Tente novamente.
            </div>
          ) : isEmpty ? (
            <div className="py-16 px-4 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <FileSpreadsheet className="h-10 w-10 stroke-1 opacity-30" />
              <p className="text-sm font-medium text-foreground">Nenhum lançamento encontrado</p>
              <p className="text-xs max-w-sm">
                Não há transações vinculadas a esta conta com os filtros aplicados.
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[104px]" />
                <col />
                <col className="w-[17%]" />
                <col className="w-[20%]" />
                <col className="w-[168px]" />
                <col className="w-[144px]" />
              </colgroup>

              {/* Cabeçalho congelado */}
              <thead className="sticky top-0 z-20 bg-card">
                <tr>
                  <SortHeader label="Data" columnKey="date" />
                  <SortHeader label="Lançamento" columnKey="description" />
                  <SortHeader label="Conta Bancária" columnKey="account_name" />
                  <SortHeader label="Conta Analítica" columnKey="chart_name" />
                  <SortHeader label="Centro de Custo" columnKey="cost_center_name" />
                  <SortHeader label="Valor Líquido" columnKey="net_amount" align="right" />
                </tr>
              </thead>

              <tbody>
                {sortedItems.map((item) => {
                  const isPositive = item.net_amount > 0
                  const isNegative = item.net_amount < 0

                  return (
                    <tr key={item.id} className="group transition-colors hover:bg-muted/40">
                      {/* Data */}
                      <td className="px-3 py-2.5 align-top border-b border-border/50 overflow-hidden">
                        <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatDate(item.date)}
                        </span>
                      </td>

                      {/* Lançamento: descrição + favorecido */}
                      <td className="px-3 py-2.5 align-top border-b border-border/50 overflow-hidden">
                        <div className="min-w-0">
                          <div
                            className="text-xs font-medium text-foreground truncate"
                            title={item.description}
                          >
                            {item.description}
                          </div>
                          {item.payee && (
                            <div
                              className="text-[11px] text-muted-foreground truncate mt-0.5"
                              title={item.payee}
                            >
                              {item.payee}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Conta Bancária */}
                      <td className="px-3 py-2.5 align-top border-b border-border/50 overflow-hidden">
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={item.account_name || ''}
                        >
                          {item.account_name || <span className="text-muted-foreground/40">—</span>}
                        </div>
                      </td>

                      {/* Conta Analítica: código + nome */}
                      <td className="px-3 py-2.5 align-top border-b border-border/50 overflow-hidden">
                        <div className="min-w-0">
                          <div
                            className="text-xs text-foreground/90 truncate"
                            title={item.chart_name || item.category_name || ''}
                          >
                            {item.chart_name || item.category_name || (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </div>
                          {item.chart_code && (
                            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              {item.chart_code}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Centro de Custo */}
                      <td className="px-3 py-2.5 align-top border-b border-border/50 overflow-hidden">
                        {item.cost_center_name ? (
                          <span
                            className="inline-block max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground align-middle"
                            title={item.cost_center_name}
                          >
                            {item.cost_center_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Valor Líquido */}
                      <td
                        className={cn(
                          'px-3 py-2.5 align-top text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap border-b border-border/50 overflow-hidden',
                          isPositive && 'text-emerald-600 dark:text-emerald-400',
                          isNegative && 'text-rose-600 dark:text-rose-400',
                          !isPositive && !isNegative && 'text-muted-foreground'
                        )}
                      >
                        {formatBRL(item.net_amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="shrink-0 px-6 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="text-muted-foreground flex items-center gap-3 flex-wrap">
            <span>
              <strong className="text-foreground">{sortedItems.length}</strong> de{' '}
              <strong className="text-foreground">{data?.total_count ?? 0}</strong> lançamentos
            </span>
            {(searchTerm || typeFilter !== 'all') && (
              <span className="text-primary font-medium">
                Soma filtrada: {formatBRL(filteredTotal)}
              </span>
            )}
          </div>

          <Button size="sm" onClick={onClose} className="h-8 px-4 text-xs font-medium">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

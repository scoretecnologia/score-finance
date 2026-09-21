import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, Download } from 'lucide-react'
import type { DREResponse, DRERow } from '@/types'
import { formatBRL, getAH, getAV, exportDREToCSV } from '@/lib/dre-utils'
import { cn } from '@/lib/utils'
import { DREDrilldownDialog, type DREDrilldownParams } from './dre-drilldown-dialog'

interface DREMatrixProps {
  data: DREResponse
  searchTerm?: string
  costCenterId?: string
  costCenterName?: string
}

export function DREMatrix({ data, searchTerm = '', costCenterId, costCenterName }: DREMatrixProps) {
  // Estado para o modal de drilldown
  const [drilldownParams, setDrilldownParams] = useState<DREDrilldownParams | null>(null)

  // Por padrão, expande apenas os grupos macro (nível 0) para exibir as categorias (nível 1), mantendo as contas analíticas (nível 2) recolhidas
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>()
    data.rows.forEach((r) => {
      if (r.level === 0) init.add(r.key)
    })
    return init
  })

  // Ao trocar de empresa ou ano, reaplica o padrão (1º e 2º níveis abertos)
  useEffect(() => {
    const init = new Set<string>()
    data.rows.forEach((r) => {
      if (r.level === 0) init.add(r.key)
    })
    setExpanded(init)
  }, [data.company_id, data.year])


  const [showAH, setShowAH] = useState(true)
  const [showAV, setShowAV] = useState(true)

  // Meses da resposta
  const months = data.months
  const monthLabels = data.month_labels

  // Identificar linha de faturamento para servir de base da Análise Vertical (AV)
  const faturamentoRow = useMemo(() => {
    return data.rows.find((r) => r.bucket === 'faturamento' && r.level === 0)
  }, [data.rows])

  const baseByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    months.forEach((m) => {
      map[m] = faturamentoRow?.values[m] ?? 0
    })
    map['total'] = faturamentoRow?.values['total'] ?? 0
    return map
  }, [faturamentoRow, months])

  // Toggle de expansão
  const toggleRow = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const keys = data.rows.filter((r) => r.child_keys && r.child_keys.length > 0).map((r) => r.key)
    setExpanded(new Set(keys))
  }, [data.rows])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  // Visibilidade de cada linha respeitando a árvore
  const isRowVisible = useCallback(
    (row: DRERow): boolean => {
      // Se houver busca por texto, exibe linhas que batem
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        return (
          row.label.toLowerCase().includes(query) ||
          (row.code ? row.code.toLowerCase().includes(query) : false)
        )
      }

      if (row.level <= 0 || row.is_subtotal) return true

      const parts = row.key.split('__')
      if (row.level === 1) {
        // Filha direta do bucket (parts[0] = bucket)
        return expanded.has(parts[0])
      }
      if (row.level === 2) {
        // Filha da categoria (parts[0] = bucket, parts[1] = cat)
        return expanded.has(parts[0]) && expanded.has(`${parts[0]}__${parts[1]}`)
      }
      return true
    },
    [expanded, searchTerm]
  )

  const visibleRows = useMemo(() => {
    return data.rows.filter(isRowVisible)
  }, [data.rows, isRowVisible])

  const handleExportCSV = () => {
    exportDREToCSV(data, visibleRows)
  }

  // O drilldown existe apenas no 3o nivel da arvore (conta analitica). Grupos macro (level 0),
  // categorias (level 1) e subtotais sao apenas agregacoes e nao abrem o modal.
  const isDrillable = useCallback(
    (row: DRERow) => !row.is_subtotal && row.level === 2,
    []
  )

  const handleCellClick = (row: DRERow, monthKey?: string, cellVal?: number) => {
    if (!isDrillable(row)) return
    if (!cellVal || cellVal === 0) return

    const monthNum = monthKey ? parseInt(monthKey.split('-')[1], 10) : undefined
    const monthLabel = monthKey ? (monthLabels[monthKey] || monthKey) : `Ano ${data.year}`

    setDrilldownParams({
      row_key: row.key,
      row_label: row.label,
      row_code: row.code,
      row_level: row.level,
      year: data.year,
      month: monthNum,
      month_label: monthLabel,
      regime: data.regime,
      cost_center_id: costCenterId,
      company_name: data.company_name,
    })
  }

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Controles da Matriz */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Exibição:
          </span>
          <Button
            size="sm"
            variant={showAH ? 'default' : 'outline'}
            onClick={() => setShowAH((v) => !v)}
            className="h-7 text-xs px-2.5 font-medium"
            title="Análise Horizontal (% de variação em relação ao mês anterior)"
          >
            AH (Variação %)
          </Button>
          <Button
            size="sm"
            variant={showAV ? 'default' : 'outline'}
            onClick={() => setShowAV((v) => !v)}
            className="h-7 text-xs px-2.5 font-medium"
            title="Análise Vertical (% de representatividade sobre a Receita Bruta)"
          >
            AV (Margem %)
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={expandAll}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Expandir tudo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={collapseAll}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Recolher tudo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="h-7 text-xs gap-1.5 font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Tabela Matriz */}
      <Card className="border border-border shadow-sm overflow-hidden bg-card">
        <div className="w-full overflow-x-auto">
          <Table className="w-full border-collapse">
            <TableHeader className="bg-muted sticky top-0 z-20">
              {/* Linha 1 de Cabeçalho: Nome e Meses */}
              <TableRow className="border-b border-border bg-muted">
                <TableHead
                  rowSpan={2}
                  className="sticky left-0 bg-muted z-30 min-w-[340px] max-w-[420px] text-xs font-bold text-foreground border-r border-border shadow-[2px_0_5px_-1px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex items-center justify-between">
                    <span>Estrutura Contábil / Conta</span>
                    {costCenterName && (
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {costCenterName}
                      </span>
                    )}
                  </div>
                </TableHead>

                {months.map((m) => (
                  <TableHead
                    key={m}
                    colSpan={1 + (showAH ? 1 : 0) + (showAV ? 1 : 0)}
                    className="text-center text-xs font-bold text-foreground border-x border-border/70 py-2.5 bg-muted"
                  >
                    {monthLabels[m] || m}
                  </TableHead>
                ))}

                {/* Coluna Total */}
                <TableHead
                  colSpan={1 + (showAV ? 1 : 0)}
                  className="text-center text-xs font-bold text-primary border-l-2 border-primary/30 py-2.5 bg-muted"
                >
                  Total Acumulado
                </TableHead>
              </TableRow>

              {/* Linha 2 de Cabeçalho: Subcolunas (Valor, AH, AV) */}
              <TableRow className="border-b border-border bg-muted">
                {months.map((m) => (
                  <React.Fragment key={`sub-${m}`}>
                    <TableHead className="text-right text-[11px] font-semibold text-muted-foreground border-l border-border/60 min-w-[110px] px-2 py-1.5 bg-muted">
                      Valor
                    </TableHead>
                    {showAH && (
                      <TableHead className="text-center text-[10px] font-medium text-muted-foreground border-l border-border/40 min-w-[65px] px-1 py-1.5 bg-muted">
                        AH
                      </TableHead>
                    )}
                    {showAV && (
                      <TableHead className="text-center text-[10px] font-medium text-muted-foreground border-l border-border/40 min-w-[65px] px-1 py-1.5 bg-muted">
                        AV
                      </TableHead>
                    )}
                  </React.Fragment>
                ))}

                {/* Subcolunas do Total */}
                <TableHead className="text-right text-[11px] font-bold text-primary border-l-2 border-primary/30 min-w-[120px] px-2.5 py-1.5 bg-muted">
                  Valor
                </TableHead>
                {showAV && (
                  <TableHead className="text-center text-[10px] font-bold text-primary border-l border-primary/20 min-w-[70px] px-1 py-1.5 bg-muted">
                    AV
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={1 + months.length * (1 + (showAH ? 1 : 0) + (showAV ? 1 : 0)) + 2}
                    className="h-32 text-center text-muted-foreground text-sm"
                  >
                    Nenhuma conta encontrada para o filtro atual.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => {
                  const hasChildren = row.child_keys && row.child_keys.length > 0
                  const isNodeOpen = expanded.has(row.key)
                  const indent = Math.max(0, row.level)

                  // Estilos por nível
                  const isSubtotal = row.is_subtotal
                  const isMacro = row.level === 0
                  const isCat = row.level === 1
                  const isAnalytic = row.level === 2
                  const canDrill = isDrillable(row)

                  return (
                    <TableRow
                      key={row.key}
                      onClick={hasChildren ? () => toggleRow(row.key) : undefined}
                      className={cn(
                        'group transition-colors border-b border-border/50 text-xs',
                        hasChildren && 'cursor-pointer select-none',
                        isSubtotal && 'bg-[var(--dre-row-subtotal)] font-bold border-t-2 border-b-2 border-primary/30',
                        isMacro && !isSubtotal && 'bg-[var(--dre-row-macro)] font-semibold',
                        isCat && 'bg-[var(--dre-row-cat)] font-medium',
                        isAnalytic && 'bg-[var(--dre-row-analytic)]',
                        !isSubtotal && 'hover:bg-accent'
                      )}
                    >
                      {/* Coluna de Descrição Fixa à Esquerda - 100% Sólida */}
                      <TableCell
                        className={cn(
                          'sticky left-0 z-10 whitespace-nowrap border-r border-border py-2 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.1)] transition-colors',
                          !isSubtotal && 'group-hover:bg-accent',
                          isSubtotal
                            ? 'bg-[var(--dre-row-subtotal)] font-bold text-primary pl-4'
                            : isMacro
                            ? 'bg-[var(--dre-row-macro)] font-semibold text-foreground'
                            : isCat
                            ? 'bg-[var(--dre-row-cat)] font-medium text-foreground'
                            : 'bg-[var(--dre-row-analytic)] text-foreground'
                        )}
                        style={{ paddingLeft: `${12 + indent * 18}px` }}
                      >

                        <div className="flex items-center gap-1.5">
                          {hasChildren ? (
                            <button
                              type="button"
                              aria-expanded={isNodeOpen}
                              aria-label={isNodeOpen ? 'Recolher' : 'Expandir'}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleRow(row.key)
                              }}
                              className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {isNodeOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            !isSubtotal && row.level > 0 && <span className="w-4" />
                          )}

                          {row.code && !row.label.trim().startsWith(row.code) && (
                            <span className="font-mono text-[11px] text-muted-foreground opacity-80 mr-1">
                              {row.code}
                            </span>
                          )}

                          <span className={cn('truncate', isSubtotal && 'tracking-wide')}>
                            {row.label}
                          </span>
                        </div>
                      </TableCell>

                      {/* Colunas Mensais */}
                      {months.map((m, mIdx) => {
                        const val = row.values[m] ?? 0
                        const prevMonthKey = mIdx > 0 ? months[mIdx - 1] : null
                        const prevVal = prevMonthKey ? row.values[prevMonthKey] : null
                        const ah = prevVal !== null ? getAH(val, prevVal) : null

                        const revBase = baseByMonth[m] ?? 0
                        const av = getAV(val, revBase)

                        return (
                          <React.Fragment key={`${row.key}-${m}`}>
                            {/* Valor Numérico Clicável para Drilldown */}
                            <TableCell
                              onClick={() => canDrill && val !== 0 && handleCellClick(row, m, val)}
                              title={
                                canDrill && val !== 0
                                  ? `Clique para detalhar os lançamentos de "${row.label}" em ${monthLabels[m] || m}`
                                  : undefined
                              }
                              className={cn(
                                'text-right tabular-nums px-2 py-2 border-l border-border/40 font-mono text-[11px] select-none',
                                isSubtotal && 'font-bold',
                                isMacro && !isSubtotal && 'font-semibold',
                                canDrill && val !== 0 && 'cursor-pointer hover:bg-primary/15 hover:underline transition-colors font-medium',
                                val > 0 && 'text-emerald-600 dark:text-emerald-400',
                                val < 0 && 'text-rose-600 dark:text-rose-400',
                                val === 0 && 'text-muted-foreground/40'
                              )}
                            >
                              {val !== 0 ? formatBRL(val) : '—'}
                            </TableCell>

                            {/* Análise Horizontal (AH) */}
                            {showAH && (
                              <TableCell className="text-center tabular-nums px-1 py-2 border-l border-border/30 text-[10px] font-mono">
                                {ah ? (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-0.5',
                                      ah.positive
                                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                        : 'text-rose-600 dark:text-rose-400 font-medium'
                                    )}
                                  >
                                    {ah.positive ? '▲' : '▼'} {ah.text}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </TableCell>
                            )}

                            {/* Análise Vertical (AV) */}
                            {showAV && (
                              <TableCell className="text-center tabular-nums px-1 py-2 border-l border-border/30 text-[10px] text-muted-foreground font-mono">
                                {av ? (
                                  <span className={cn(isSubtotal && 'font-semibold text-foreground')}>
                                    {av.text}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </TableCell>
                            )}
                          </React.Fragment>
                        )
                      })}

                      {/* Coluna de Total Clicável para Drilldown Anual */}
                      {(() => {
                        const totalVal = row.values['total'] ?? 0
                        const revBaseTotal = baseByMonth['total'] ?? 0
                        const avTotal = getAV(totalVal, revBaseTotal)

                        return (
                          <React.Fragment key={`${row.key}-total`}>
                            <TableCell
                              onClick={() => canDrill && totalVal !== 0 && handleCellClick(row, undefined, totalVal)}
                              title={
                                canDrill && totalVal !== 0
                                  ? `Clique para detalhar os lançamentos de "${row.label}" no ano todo`
                                  : undefined
                              }
                              className={cn(
                                'text-right tabular-nums px-2.5 py-2 border-l-2 border-primary/30 font-mono text-[11px] bg-primary/5 select-none',
                                isSubtotal ? 'font-bold text-primary' : isMacro ? 'font-semibold' : 'font-medium',
                                canDrill && totalVal !== 0 && 'cursor-pointer hover:bg-primary/20 hover:underline transition-colors font-medium',
                                totalVal > 0 && !isSubtotal && 'text-emerald-600 dark:text-emerald-400',
                                totalVal < 0 && !isSubtotal && 'text-rose-600 dark:text-rose-400',
                                totalVal === 0 && !isSubtotal && 'text-muted-foreground/40'
                              )}
                            >
                              {totalVal !== 0 ? formatBRL(totalVal) : '—'}
                            </TableCell>

                            {showAV && (
                              <TableCell className="text-center tabular-nums px-1 py-2 border-l border-primary/20 text-[10px] font-mono bg-primary/5">
                                {avTotal ? (
                                  <span className={cn('font-bold', isSubtotal ? 'text-primary' : 'text-foreground')}>
                                    {avTotal.text}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </TableCell>
                            )}
                          </React.Fragment>
                        )
                      })()}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal Lindo de Drilldown de Lançamentos */}
      <DREDrilldownDialog
        isOpen={!!drilldownParams}
        onClose={() => setDrilldownParams(null)}
        params={drilldownParams}
      />
    </div>
  )
}

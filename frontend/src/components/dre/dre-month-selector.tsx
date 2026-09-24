import { useMemo } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, ChevronDown, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DRE_MONTHS = [
  { value: 1, abbr: 'Jan', name: 'Janeiro', quarter: 1 },
  { value: 2, abbr: 'Fev', name: 'Fevereiro', quarter: 1 },
  { value: 3, abbr: 'Mar', name: 'Março', quarter: 1 },
  { value: 4, abbr: 'Abr', name: 'Abril', quarter: 2 },
  { value: 5, abbr: 'Mai', name: 'Maio', quarter: 2 },
  { value: 6, abbr: 'Jun', name: 'Junho', quarter: 2 },
  { value: 7, abbr: 'Jul', name: 'Julho', quarter: 3 },
  { value: 8, abbr: 'Ago', name: 'Agosto', quarter: 3 },
  { value: 9, abbr: 'Set', name: 'Setembro', quarter: 3 },
  { value: 10, abbr: 'Out', name: 'Outubro', quarter: 4 },
  { value: 11, abbr: 'Nov', name: 'Novembro', quarter: 4 },
  { value: 12, abbr: 'Dez', name: 'Dezembro', quarter: 4 },
] as const

const QUARTERS = [
  { label: 'Q1', months: [1, 2, 3] },
  { label: 'Q2', months: [4, 5, 6] },
  { label: 'Q3', months: [7, 8, 9] },
  { label: 'Q4', months: [10, 11, 12] },
] as const

interface DREMonthSelectorProps {
  selectedMonths: number[]
  onChange: (months: number[]) => void
  year?: number
}

export function DREMonthSelector({
  selectedMonths,
  onChange,
  year,
}: DREMonthSelectorProps) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1 // 1-12
  const isCurrentYear = year === currentYear

  const isAllSelected = selectedMonths.length === 12
  const isNoneSelected = selectedMonths.length === 0

  const toggleMonth = (monthVal: number) => {
    if (selectedMonths.includes(monthVal)) {
      onChange(selectedMonths.filter((m) => m !== monthVal).sort((a, b) => a - b))
    } else {
      onChange([...selectedMonths, monthVal].sort((a, b) => a - b))
    }
  }

  const selectAll = () => {
    onChange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  }

  const clearAll = () => {
    onChange([])
  }

  const selectQuarter = (quarterMonths: readonly number[]) => {
    // Se todos do trimestre já estão selecionados, desseleciona eles; senão, adiciona todos eles
    const allInQuarter = quarterMonths.every((m) => selectedMonths.includes(m))
    if (allInQuarter) {
      onChange(selectedMonths.filter((m) => !quarterMonths.includes(m)).sort((a, b) => a - b))
    } else {
      const merged = Array.from(new Set([...selectedMonths, ...quarterMonths])).sort((a, b) => a - b)
      onChange(merged)
    }
  }

  const selectSemester = (sem: 1 | 2) => {
    const semMonths = sem === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]
    onChange(semMonths)
  }

  const selectYTD = () => {
    const ytdMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
    onChange(ytdMonths)
  }

  // Label do botão do seletor
  const triggerLabel = useMemo(() => {
    if (isAllSelected) return 'Todos os meses (12)'
    if (isNoneSelected) return 'Nenhum mês'
    if (selectedMonths.length <= 2) {
      return selectedMonths.map((m) => DRE_MONTHS[m - 1].abbr).join(', ')
    }
    return `${selectedMonths.length} meses selecionados`
  }, [isAllSelected, isNoneSelected, selectedMonths])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-8 text-xs rounded-md border border-input px-2.5 py-1 transition-colors flex items-center gap-2 font-medium',
            !isAllSelected && !isNoneSelected
              ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15'
              : 'bg-background text-foreground hover:bg-accent'
          )}
          title="Filtrar meses da DRE"
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-normal text-muted-foreground">Meses:</span>
          <span className="font-medium truncate max-w-[130px]">{triggerLabel}</span>
          {!isAllSelected && !isNoneSelected && (
            <Badge
              variant="secondary"
              className="h-4 px-1 text-[10px] font-semibold bg-primary/20 text-primary border-none"
            >
              {selectedMonths.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-70" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[340px] p-3.5 space-y-3 bg-card border border-border shadow-lg rounded-xl z-50"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Filtrar Meses</span>
            <span className="text-[11px] text-muted-foreground">
              ({selectedMonths.length}/12)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={isAllSelected}
              className="h-6 text-[11px] px-2 text-primary hover:text-primary font-medium"
            >
              Todos
            </Button>
            <span className="text-muted-foreground/40 text-xs">•</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={isNoneSelected}
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground font-medium"
            >
              Limpar
            </Button>
          </div>
        </div>

        {/* Atalhos Rápidos de Período */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Atalhos
          </span>
          <div className="flex flex-wrap gap-1">
            {QUARTERS.map((q) => {
              const isQActive = q.months.every((m) => selectedMonths.includes(m))
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => selectQuarter(q.months)}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded font-medium transition-colors border',
                    isQActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  )}
                  title={`Alternar ${q.label} (${q.months.map((m) => DRE_MONTHS[m - 1].abbr).join(', ')})`}
                >
                  {q.label}
                </button>
              )
            })}

            <button
              type="button"
              onClick={() => selectSemester(1)}
              className="text-[11px] px-2 py-0.5 rounded font-medium bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
            >
              1º Sem
            </button>
            <button
              type="button"
              onClick={() => selectSemester(2)}
              className="text-[11px] px-2 py-0.5 rounded font-medium bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
            >
              2º Sem
            </button>

            {isCurrentYear && (
              <button
                type="button"
                onClick={selectYTD}
                className="text-[11px] px-2 py-0.5 rounded font-medium bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
                title={`Meses 1 até ${currentMonth} (${DRE_MONTHS[currentMonth - 1].abbr})`}
              >
                Até hoje
              </button>
            )}
          </div>
        </div>

        {/* Grade de Meses (4 Trimestres) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {QUARTERS.map((q) => (
            <div
              key={q.label}
              className="p-2 rounded-lg bg-muted/30 border border-border/60 space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>{q.label}</span>
                <button
                  type="button"
                  onClick={() => selectQuarter(q.months)}
                  className="text-[10px] text-primary hover:underline font-normal"
                >
                  {q.months.every((m) => selectedMonths.includes(m)) ? 'Desmarcar' : 'Marcar'}
                </button>
              </div>

              <div className="space-y-1">
                {q.months.map((mVal) => {
                  const monthInfo = DRE_MONTHS[mVal - 1]
                  const isChecked = selectedMonths.includes(mVal)
                  return (
                    <button
                      key={mVal}
                      type="button"
                      onClick={() => toggleMonth(mVal)}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors',
                        isChecked
                          ? 'bg-primary/15 text-primary font-medium border border-primary/25'
                          : 'hover:bg-muted/80 text-foreground border border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            'h-3.5 w-3.5 rounded flex items-center justify-center border transition-colors',
                            isChecked
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/40 bg-background'
                          )}
                        >
                          {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                        </div>
                        <span className="font-medium">{monthInfo.abbr}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {monthInfo.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé informativo */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          {isAllSelected ? (
            <span>Exibindo todos os 12 meses</span>
          ) : isNoneSelected ? (
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <X className="h-3 w-3" /> Nenhum mês selecionado
            </span>
          ) : (
            <span>
              {selectedMonths.length} de 12 meses selecionados
            </span>
          )}

          {!isAllSelected && (
            <button
              type="button"
              onClick={selectAll}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Restaurar todos
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reports, costCenters as costCentersApi } from '@/lib/api'
import { useCompany } from '@/contexts/company-context'
import { DREMatrix } from '@/components/dre/dre-matrix'
import { DREKPIs } from '@/components/dre/dre-kpis'
import { DREMonthSelector } from '@/components/dre/dre-month-selector'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CostCenter, DREResponse, DRETotalSummary } from '@/types'
import {
  Calendar,
  Building,
  Search,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react'

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export default function DREPage() {
  const { currentCompany } = useCompany()
  const currentYear = new Date().getFullYear()

  const [year, setYear] = useState<number>(currentYear)
  const [selectedMonths, setSelectedMonths] = useState<number[]>(ALL_MONTHS)
  const regime: 'competencia' | 'caixa' = 'caixa'
  const [costCenterId, setCostCenterId] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  // Carregar Centros de Custo da empresa
  const { data: costCentersList = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', currentCompany?.id],
    queryFn: () => costCentersApi.list(),
    enabled: !!currentCompany?.id,
  })

  // Centro de custo efetivo: 'all' e o sentinela de "sem filtro" e nunca pode ir para a API
  const effectiveCostCenterId = costCenterId === 'all' ? undefined : costCenterId

  // Carregar dados da DRE
  const {
    data: dreData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DREResponse>({
    queryKey: ['dre', currentCompany?.id, year, regime, effectiveCostCenterId],
    queryFn: () =>
      reports.dre({
        year,
        regime,
        cost_center_id: effectiveCostCenterId,
      }),
    enabled: !!currentCompany?.id,
  })

  // Nome do centro de custo selecionado para o cabeçalho
  const selectedCostCenterName = useMemo(() => {
    if (costCenterId === 'all') return undefined
    const cc = costCentersList.find((c) => c.id === costCenterId)
    return cc ? cc.name : undefined
  }, [costCenterId, costCentersList])

  const availableYears = [2027, 2026, 2025, 2024, 2023]

  // Totais recalculados de acordo com os meses selecionados
  const filteredTotals = useMemo<DRETotalSummary>(() => {
    if (!dreData) {
      return {
        faturamento: 0,
        custos_variaveis: 0,
        margem_contribuicao: 0,
        despesas_fixas: 0,
        lucro_operacional_antes_invest: 0,
        investimentos: 0,
        lucro_operacional: 0,
        resultado_nao_operacional: 0,
        lucro_liquido: 0,
      }
    }

    if (selectedMonths.length === 12 || selectedMonths.length === 0) {
      return dreData.totals
    }

    const selectedKeys = selectedMonths.map(
      (m) => `${year}-${String(m).padStart(2, '0')}`
    )

    const sumRowValues = (keyOrBucket: string, isSubtotal = false) => {
      const row = dreData.rows.find((r) =>
        isSubtotal ? r.key === keyOrBucket : r.bucket === keyOrBucket && r.level === 0
      )
      if (!row) return 0
      return selectedKeys.reduce((acc, k) => acc + (row.values[k] ?? 0), 0)
    }

    return {
      faturamento: sumRowValues('faturamento'),
      custos_variaveis: sumRowValues('custos_variaveis'),
      margem_contribuicao: sumRowValues('margem_contribuicao', true),
      despesas_fixas: sumRowValues('despesas_fixas'),
      lucro_operacional_antes_invest: sumRowValues('lucro_op_antes', true),
      investimentos: sumRowValues('investimentos'),
      lucro_operacional: sumRowValues('lucro_operacional', true),
      resultado_nao_operacional: sumRowValues('resultado_nao_op'),
      lucro_liquido: sumRowValues('lucro_liquido', true),
    }
  }, [dreData, selectedMonths, year])

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              Demonstração do Resultado do Exercício (DRE)
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visão gerencial consolidada mês a mês com cálculo automático de Margem de Contribuição, Lucro Operacional (EBITDA) e Lucro Líquido.
          </p>
        </div>
      </div>


      {/* Barra de Filtros e Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-card rounded-xl border border-border shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Ano:</span>
            <div className="flex gap-1">
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    year === y
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Seletor Dropdown Múltipla Escolha de Meses */}
          <DREMonthSelector
            selectedMonths={selectedMonths}
            onChange={setSelectedMonths}
            year={year}
          />

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Filtro por Centro de Custo */}
          {costCentersList.length > 0 && (
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className="h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Todos os Centros de Custo</option>
                {costCentersList.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Busca por conta ou código */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar conta ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2.5"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="p-8 text-center rounded-xl border border-destructive/30 bg-destructive/5 text-destructive space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto" />
          <h3 className="text-base font-semibold">Falha ao carregar a DRE</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {error instanceof Error ? error.message : 'Erro desconhecido ao consultar a DRE.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : dreData ? (
        <div className="space-y-6">
          {/* Cards de KPIs */}
          <DREKPIs totals={filteredTotals} />

          {/* Matriz DRE */}
          <DREMatrix
            data={dreData}
            searchTerm={search}
            costCenterId={effectiveCostCenterId}
            costCenterName={selectedCostCenterName}
            selectedMonths={selectedMonths}
          />
        </div>
      ) : null}
    </div>
  )
}

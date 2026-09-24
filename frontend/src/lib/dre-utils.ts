import type { DREResponse, DRERow } from '@/types'

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Análise Horizontal: variação % em relação ao mês anterior */
export function getAH(
  currentVal: number,
  prevVal: number | null | undefined
): { text: string; positive: boolean } | null {
  if (prevVal === null || prevVal === undefined || prevVal === 0) return null
  const pct = ((currentVal - prevVal) / Math.abs(prevVal)) * 100
  return {
    text: `${Math.abs(pct).toFixed(1)}%`,
    positive: pct >= 0,
  }
}

/** Análise Vertical: percentual sobre a Receita Bruta / Faturamento do mês */
export function getAV(
  currentVal: number,
  revenueBase: number | null | undefined
): { text: string; value: number } | null {
  if (!revenueBase || revenueBase === 0) return null
  const pct = (currentVal / revenueBase) * 100
  return {
    text: `${pct.toFixed(1)}%`,
    value: pct,
  }
}

/** Exportação da DRE para CSV formatado */
export function exportDREToCSV(
  dreData: DREResponse,
  visibleRows: DRERow[],
  activeMonths?: string[]
): void {
  const months = activeMonths && activeMonths.length > 0 ? activeMonths : dreData.months
  const labels = months.map((m) => dreData.month_labels[m] || m)
  const isFiltered = months.length !== dreData.months.length

  const totalHeader = isFiltered ? `Total (${months.length} meses)` : 'Total Acumulado'
  const headers = ['Conta Contábil', ...labels, totalHeader]
  const rows: string[][] = []

  visibleRows.forEach((row) => {
    const indent = '  '.repeat(Math.max(0, row.level))
    const codePrefix = row.code ? `[${row.code}] ` : ''
    const rowTitle = `${indent}${codePrefix}${row.label}`

    const monthValues = months.map((m) => {
      const val = row.values[m] ?? 0
      return val.toFixed(2).replace('.', ',')
    })

    const totalValNum = isFiltered
      ? months.reduce((acc, m) => acc + (row.values[m] ?? 0), 0)
      : (row.values['total'] ?? 0)
    const totalVal = totalValNum.toFixed(2).replace('.', ',')

    rows.push([`"${rowTitle}"`, ...monthValues.map((v) => `"${v}"`), `"${totalVal}"`])
  })

  const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `DRE_${dreData.company_name}_${dreData.year}_${dreData.regime}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

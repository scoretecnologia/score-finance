import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Award } from 'lucide-react'
import type { DRETotalSummary } from '@/types'
import { formatBRL } from '@/lib/dre-utils'
import { cn } from '@/lib/utils'

interface DREKPIsProps {
  totals: DRETotalSummary
}

export function DREKPIs({ totals }: DREKPIsProps) {
  const faturamento = totals.faturamento || 0
  const margemContribuicao = totals.margem_contribuicao || 0
  const lucroOperacional = totals.lucro_operacional || 0
  const lucroLiquido = totals.lucro_liquido || 0

  const margemPct = faturamento > 0 ? (margemContribuicao / faturamento) * 100 : 0
  const ebitdaPct = faturamento > 0 ? (lucroOperacional / faturamento) * 100 : 0
  const liquidoPct = faturamento > 0 ? (lucroLiquido / faturamento) * 100 : 0

  const cards = [
    {
      title: 'Faturamento Bruto',
      value: faturamento,
      subtitle: 'Receita Total Operacional',
      icon: DollarSign,
      color: 'text-primary',
      badge: '+100%',
      badgePositive: true,
    },
    {
      title: 'Margem de Contribuição',
      value: margemContribuicao,
      subtitle: `${margemPct.toFixed(1)}% do Faturamento`,
      icon: PieChart,
      color: margemContribuicao >= 0 ? 'text-emerald-500' : 'text-rose-500',
      badge: `${margemPct.toFixed(1)}%`,
      badgePositive: margemContribuicao >= 0,
    },
    {
      title: 'Lucro Operacional (EBITDA)',
      value: lucroOperacional,
      subtitle: `${ebitdaPct.toFixed(1)}% de Margem Operacional`,
      icon: Activity,
      color: lucroOperacional >= 0 ? 'text-emerald-500' : 'text-rose-500',
      badge: `${ebitdaPct.toFixed(1)}%`,
      badgePositive: lucroOperacional >= 0,
    },
    {
      title: 'Lucro Líquido do Exercício',
      value: lucroLiquido,
      subtitle: `${liquidoPct.toFixed(1)}% de Margem Líquida`,
      icon: Award,
      color: lucroLiquido >= 0 ? 'text-emerald-500' : 'text-rose-500',
      badge: `${liquidoPct.toFixed(1)}%`,
      badgePositive: lucroLiquido >= 0,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon
        const isPositive = card.value >= 0

        return (
          <Card key={idx} className="border border-border/80 shadow-sm bg-card hover:border-border transition-colors">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {card.title}
                </span>
                <div className={cn('p-2 rounded-lg bg-muted/50', card.color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <span className={cn('text-2xl font-bold tracking-tight', isPositive ? 'text-foreground' : 'text-rose-600 dark:text-rose-400')}>
                  {formatBRL(card.value)}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5',
                    card.badgePositive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  )}
                >
                  {card.badgePositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {card.badge}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

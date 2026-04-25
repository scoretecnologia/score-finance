import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoryGroups as groupsApi } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ChartAccountSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

export function ChartAccountSelect({ className, ...props }: ChartAccountSelectProps) {
  const { t } = useTranslation()
  const { data: groups } = useQuery({
    queryKey: ['category-groups'],
    queryFn: groupsApi.list,
  })

  return (
    <select
      className={cn(
        "w-full border border-border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-ring/30 focus-visible:ring-[2px]",
        className
      )}
      {...props}
    >
      <option value="">{t('transactions.noCategory')}</option>
      {groups?.map((group) => {
        // Only show optgroup if there are categories and chart accounts inside
        const hasAccounts = group.categories.some(c => c.chart_accounts && c.chart_accounts.length > 0)
        if (!hasAccounts) return null
        
        return (
          <optgroup key={group.id} label={group.name}>
            {group.categories.map((cat) => (
              cat.chart_accounts?.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {cat.name} — {acc.name}
                </option>
              ))
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

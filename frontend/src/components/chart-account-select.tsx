import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoryGroups as groupsApi } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ChartAccountSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  disabled?: boolean
}

export function ChartAccountSelect({ className, value, onChange, disabled }: ChartAccountSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: groups } = useQuery({
    queryKey: ['category-groups'],
    queryFn: groupsApi.list,
  })

  let selectedName = ''
  if (value) {
    for (const group of (groups || [])) {
      for (const cat of group.categories) {
        const found = cat.chart_accounts?.find(a => a.id === value)
        if (found) {
          selectedName = found.code ? `${found.code} - ${found.name}` : found.name
          break
        }
      }
      if (selectedName) break
    }
  }

  const handleSelect = (currentValue: string) => {
    if (onChange) {
      const event = {
        target: { value: currentValue }
      } as React.ChangeEvent<HTMLSelectElement>
      onChange(event)
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal bg-background border-border",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedName || t('transactions.noCategory')}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('common.search', 'Pesquisar...')} />
          <CommandList>
            <CommandEmpty>{t('common.noResults', 'Nenhum resultado encontrado.')}</CommandEmpty>
            
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => handleSelect("")}
                className="cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "" || !value ? "opacity-100" : "opacity-0"
                  )}
                />
                {t('transactions.noCategory')}
              </CommandItem>
            </CommandGroup>

            {groups?.map(group => {
              const hasAccounts = group.categories.some(c => c.chart_accounts && c.chart_accounts.length > 0)
              if (!hasAccounts) return null
              
              return (
                <CommandGroup key={group.id} heading={group.name}>
                  {group.categories.map(cat => {
                    if (!cat.chart_accounts || cat.chart_accounts.length === 0) return null
                    return (
                      <React.Fragment key={cat.id}>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground/80 bg-muted/20 select-none">
                          {cat.code ? `${cat.code} - ` : ''}{cat.name}
                        </div>
                        {cat.chart_accounts.map(acc => {
                           const displayName = acc.code ? `${acc.code} - ${acc.name}` : acc.name
                           // O valor interno de busca no cmdk v1+ vai usar textContent dos filhos,
                           // além do array `keywords` se a biblioteca suportar, ou do atributo value nativo.
                           // O value real do shadcn CommandItem precisa ser a string para onSelect.
                           return (
                             <CommandItem
                               key={acc.id}
                               value={displayName} // O shadcn usa value para pesquisa se não customizar o filter
                               onSelect={() => handleSelect(acc.id)}
                               className="cursor-pointer"
                             >
                               <Check
                                 className={cn(
                                   "mr-2 h-4 w-4",
                                   value === acc.id ? "opacity-100" : "opacity-0"
                                 )}
                               />
                               <span className="pl-4 truncate">{displayName}</span>
                             </CommandItem>
                           )
                        })}
                      </React.Fragment>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

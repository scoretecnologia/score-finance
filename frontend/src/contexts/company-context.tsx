import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { companies as companiesApi } from '@/lib/api'
import type { Company } from '@/types'
import { useAuth } from '@/contexts/auth-context'

interface CompanyContextType {
  companies: Company[]
  currentCompany: Company | null
  isLoading: boolean
  switchCompany: (company: Company) => void
  createCompany: (name: string, cnpj?: string) => Promise<Company>
  hasPendingSetup: boolean
}

const CompanyContext = createContext<CompanyContextType | null>(null)

const STORAGE_KEY = 'score-finance.company-id'

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  const { data: companiesList = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  })

  // Resolve currentCompany from the list
  const currentCompany = companiesList.find(c => c.id === currentCompanyId) ?? companiesList[0] ?? null

  // Auto-select the first company if none is selected
  useEffect(() => {
    if (!currentCompanyId && companiesList.length > 0) {
      const first = companiesList[0]
      setCurrentCompanyId(first.id)
      localStorage.setItem(STORAGE_KEY, first.id)
    }
  }, [companiesList, currentCompanyId])

  // Sync currentCompanyId when the selected company is removed from list
  useEffect(() => {
    if (currentCompanyId && companiesList.length > 0) {
      const exists = companiesList.some(c => c.id === currentCompanyId)
      if (!exists) {
        const first = companiesList[0]
        setCurrentCompanyId(first.id)
        localStorage.setItem(STORAGE_KEY, first.id)
      }
    }
  }, [companiesList, currentCompanyId])

  const switchCompany = useCallback((company: Company) => {
    setCurrentCompanyId(company.id)
    localStorage.setItem(STORAGE_KEY, company.id)
    // Invalida todas as queries ao trocar de empresa para recarregar os dados
    queryClient.invalidateQueries()
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: ({ name, cnpj }: { name: string; cnpj?: string }) =>
      companiesApi.create({ name, cnpj }),
    onSuccess: (newCompany) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      switchCompany(newCompany)
    },
  })

  const createCompany = useCallback(
    async (name: string, cnpj?: string) => {
      return createMutation.mutateAsync({ name, cnpj })
    },
    [createMutation]
  )

  const hasPendingSetup = !isLoading && companiesList.length === 0

  return (
    <CompanyContext.Provider
      value={{
        companies: companiesList,
        currentCompany,
        isLoading,
        switchCompany,
        createCompany,
        hasPendingSetup,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }
  return context
}

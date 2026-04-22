import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/contexts/auth-context'
import { CompanyProvider } from '@/contexts/company-context'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminRoute } from '@/components/admin-route'
import { AppLayout } from '@/components/app-layout'
import { useCompany } from '@/contexts/company-context'

const SetupPage = lazy(() => import('@/pages/setup'))
const LoginPage = lazy(() => import('@/pages/login'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const TransactionsPage = lazy(() => import('@/pages/transactions'))
const AccountsPage = lazy(() => import('@/pages/accounts'))
const AccountDetailPage = lazy(() => import('@/pages/account-detail'))
const ImportPage = lazy(() => import('@/pages/import'))
const RulesPage = lazy(() => import('@/pages/rules'))
const CategoriesPage = lazy(() => import('@/pages/categories'))
const BudgetsPage = lazy(() => import('@/pages/budgets'))
const RecurringPage = lazy(() => import('@/pages/recurring'))
const GoalsPage = lazy(() => import('@/pages/goals'))
const AssetsPage = lazy(() => import('@/pages/assets'))
const ReportsPage = lazy(() => import('@/pages/reports'))
const PayeesPage = lazy(() => import('@/pages/payees'))
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings'))
const CreateCompanyPage = lazy(() => import('@/pages/create-company'))
const CompanyMembersPage = lazy(() => import('@/pages/company-members'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

/**
 * Guard que redireciona para /company/create se o usuário autenticado
 * ainda não tiver nenhuma empresa.
 */
function CompanyGuard({ children }: { children: React.ReactNode }) {
  const { hasPendingSetup, isLoading } = useCompany()

  if (isLoading) return <LoadingFallback />
  if (hasPendingSetup) return <Navigate to="/company/create" replace />
  return <>{children}</>
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <CompanyProvider>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/setup" element={<SetupPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  {/* Rota de registro removida pois a criação é feita via master: 
                      <Route path="/register" element={<RegisterPage />} /> 
                  */}
                  {/* Criação de empresa (usuário já autenticado mas sem empresa) */}
                  <Route
                    path="/company/create"
                    element={
                      <ProtectedRoute>
                        <CreateCompanyPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Rotas protegidas — requerem autenticação + empresa */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <CompanyGuard>
                          <AppLayout />
                        </CompanyGuard>
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/accounts" element={<AccountsPage />} />
                    <Route path="/accounts/:id" element={<AccountDetailPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/rules" element={<RulesPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                    <Route path="/budgets" element={<BudgetsPage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/recurring" element={<RecurringPage />} />
                    <Route path="/assets" element={<AssetsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/payees" element={<PayeesPage />} />
                    <Route path="/company/members" element={<CompanyMembersPage />} />
                    <Route path="/admin" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
                  </Route>
                </Routes>
              </Suspense>
              <Toaster />
            </CompanyProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App

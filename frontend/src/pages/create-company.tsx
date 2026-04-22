import { useState } from 'react'
import { Building2, ArrowRight, Sparkles } from 'lucide-react'
import { useCompany } from '@/contexts/company-context'
import { toast } from 'sonner'

export default function CreateCompanyPage() {
  const { createCompany } = useCompany()
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsLoading(true)
    try {
      await createCompany(name.trim(), cnpj.trim() || undefined)
      toast.success('Empresa criada com sucesso!')
    } catch {
      toast.error('Erro ao criar empresa. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 ring-1 ring-primary/20">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bem-vindo ao Score Finance</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Para começar, crie a sua empresa. Você poderá convidar membros depois.
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg shadow-black/5">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Criar primeira empresa</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="company-name" className="text-sm font-medium text-foreground">
                Nome da empresa <span className="text-destructive">*</span>
              </label>
              <input
                id="company-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Minha Empresa Ltda"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-cnpj" className="text-sm font-medium text-foreground">
                CNPJ <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <input
                id="company-cnpj"
                type="text"
                value={cnpj}
                onChange={e => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow"
              />
            </div>

            <button
              type="submit"
              id="create-company-submit"
              disabled={isLoading || !name.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              ) : (
                <>
                  Criar empresa
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Você será definido como <strong>dono</strong> da empresa e poderá convidar membros posteriormente.
        </p>
      </div>
    </div>
  )
}

import { useState, useRef, useCallback, useEffect } from 'react'
import { getAccountName } from '@/lib/account-utils'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactions as transactionsApi, accounts as accountsApi, importLogs as importLogsApi } from '@/lib/api'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Transaction, ImportLog } from '@/types'
import { Upload, FileText, X, CheckCircle2, AlertCircle, History, Trash2, Download, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/page-header'
import { useAuth } from '@/contexts/auth-context'

function formatCurrency(value: number, _currency?: string, _locale?: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const TYPE_LABELS: Record<string, string> = {
  checking: 'accounts.typeChecking',
  savings: 'accounts.typeSavings',
  credit_card: 'accounts.typeCreditCard',
  investment: 'accounts.typeInvestment',
}

const MAPPING_FIELDS = [
  { key: 'date', label: 'Data', required: true },
  { key: 'description', label: 'Descrição', required: true },
  { key: 'amount', label: 'Valor Único (+/- na mesma coluna)', required: false },
  { key: 'inflow', label: 'Entrada (Apenas Créditos)', required: false },
  { key: 'outflow', label: 'Saída (Apenas Débitos)', required: false },
  { key: 'chart_account_code', label: 'Plano de Contas (Código)', required: false },
]

export default function ImportPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const userCurrency = user?.preferences?.currency_display ?? 'BRL'
  const locale = i18n.language === 'en' ? 'en-US' : i18n.language
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewData, setPreviewData] = useState<{ transactions: Transaction[]; detected_format: string } | null>(null)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ImportLog | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])

  // Mapping options
  const [mappingMode, setMappingMode] = useState(false)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [csvDateFormat, setCsvDateFormat] = useState('')
  const [csvFlipAmount, setCsvFlipAmount] = useState(false)

  // Import progress state
  const [importProgress, setImportProgress] = useState<{
    active: boolean
    phase: string
    current: number
    total: number
    imported: number
    skipped: number
  } | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const { data: accountsList } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  })

  const { data: importHistory = [] } = useQuery({
    queryKey: ['import-logs'],
    queryFn: importLogsApi.list,
  })

  const { data: duplicateFlags, isFetching: isCheckingDuplicates } = useQuery({
    queryKey: ['import-duplicates', selectedAccount, previewData?.transactions],
    queryFn: () => transactionsApi.checkDuplicates(selectedAccount, previewData!.transactions),
    enabled: !!selectedAccount && !!previewData?.transactions?.length,
  })

  const previewMutation = useMutation({
    mutationFn: ({ file, options }: { file: File; options?: { date_format?: string; flip_amount?: boolean; column_mapping?: Record<string, string> } }) =>
      transactionsApi.previewImport(file, options),
    onSuccess: (data) => {
      setPreviewData(data)
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('import.processError'))
    },
  })

  const extractHeadersMutation = useMutation({
    mutationFn: (file: File) => transactionsApi.extractHeaders(file),
    onSuccess: (data) => {
      setCsvHeaders(data.headers)
      setMappingMode(true)
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || "Erro ao ler as colunas da planilha")
    },
  })
  const resetMappingOptions = useCallback(() => {
    setCsvDateFormat('')
    setCsvFlipAmount(false)
    setCsvHeaders([])
    setColumnMapping({})
    setMappingMode(false)
  }, [])

  const startStreamingImport = useCallback(() => {
    if (!previewData || !selectedAccount) return
    setImportProgress({ active: true, phase: 'preparing', current: 0, total: previewData.transactions.length, imported: 0, skipped: 0 })

    const { promise, abort } = transactionsApi.importStream(
      selectedAccount,
      previewData.transactions,
      fileName ?? '',
      previewData.detected_format,
      (data) => {
        setImportProgress(() => ({
          active: true,
          phase: data.phase,
          current: data.current,
          total: data.total,
          imported: data.imported,
          skipped: data.skipped,
        }))

        if (data.phase === 'done') {
          setTimeout(() => {
            invalidateFinancialQueries(queryClient)
            queryClient.invalidateQueries({ queryKey: ['import-logs'] })
            const msg = data.skipped > 0
              ? t('import.importedWithSkipped', { imported: data.imported, skipped: data.skipped })
              : `${data.imported} ${t('import.transactionsImported')}`
            toast.success(msg)
            setImportProgress(null)
            setPreviewData(null)
            setSelectedAccount('')
            setFileName(null)
            setCurrentFile(null)
            resetMappingOptions()
            if (fileInputRef.current) fileInputRef.current.value = ''
            abortRef.current = null
          }, 1200)
        }

        if (data.phase === 'error') {
          toast.error(data.message || t('import.importError'))
          setImportProgress(null)
          abortRef.current = null
        }
      },
    )

    abortRef.current = abort
    promise.catch((err) => {
      if (err.name !== 'AbortError') {
        toast.error(err.message || t('import.importError'))
        setImportProgress(null)
        abortRef.current = null
      }
    })
  }, [previewData, selectedAccount, fileName, queryClient, t, resetMappingOptions])

  const handleCancelImport = useCallback(() => {
    if (importProgress && importProgress.phase !== 'done' && importProgress.phase !== 'error') {
      if (abortRef.current) {
        abortRef.current()
        abortRef.current = null
      }
      toast.info(t('import.importCancelled'))
    }
    setImportProgress(null)
  }, [importProgress, t])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => importLogsApi.delete(id),
    onSuccess: () => {
      invalidateFinancialQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['import-logs'] })
      setDeleteTarget(null)
    },
  })
  function processFile(file: File) {
    setFileName(file.name)
    setCurrentFile(file)
    resetMappingOptions()

    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.csv') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
      extractHeadersMutation.mutate(file)
    } else {
      previewMutation.mutate({ file })
    }
  }

  const handlePreviewWithMapping = useCallback(() => {
    if (!currentFile) return
    const options: { date_format?: string; flip_amount?: boolean; column_mapping?: Record<string, string> } = {}
    if (csvDateFormat) options.date_format = csvDateFormat
    if (csvFlipAmount) options.flip_amount = true
    
    if (Object.keys(columnMapping).length > 0) {
      const hasDate = !!columnMapping['date'];
      const hasDesc = !!columnMapping['description'];
      const hasAmount = !!columnMapping['amount'];
      const hasSplit = !!columnMapping['inflow'] && !!columnMapping['outflow'];
      
      // Wait for user to map all mandatory fields before sending to backend to avoid errors
      if (!hasDate || !hasDesc || (!hasAmount && !hasSplit)) {
        return;
      }
      options.column_mapping = columnMapping
    }
    
    previewMutation.mutate({ file: currentFile, options })
  }, [currentFile, csvDateFormat, csvFlipAmount, columnMapping, previewMutation])

  useEffect(() => {
    if (!mappingMode || !currentFile) return
    const timer = setTimeout(() => {
      handlePreviewWithMapping()
    }, 500)
    return () => clearTimeout(timer)
  }, [columnMapping, csvDateFormat, csvFlipAmount, currentFile, mappingMode])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleReset = () => {
    setPreviewData(null)
    setFileName(null)
    setCurrentFile(null)
    setSelectedAccount('')
    resetMappingOptions()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const transactions = previewData?.transactions || []
  const totalCount = transactions.length
  const incomeCount = transactions.filter(t => t.type === 'credit' && !t.import_error).length
  const expenseCount = transactions.filter(t => t.type === 'debit' && !t.import_error).length
  const incomeSum = transactions.filter(t => t.type === 'credit' && !t.import_error).reduce((acc, t) => acc + Number(t.amount || 0), 0)
  const expenseSum = transactions.filter(t => t.type === 'debit' && !t.import_error).reduce((acc, t) => acc + Number(t.amount || 0), 0)
  const errorCount = transactions.filter(t => !!t.import_error).length
  const hasErrors = errorCount > 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader section={t('import.title')} title={t('import.subtitle')} />

      {/* Upload zone */}
      <div
        className={`bg-card rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-border'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !previewMutation.isPending && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.qfx,.csv,.qif,.xml,.camt,.xls,.xlsx"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          {previewMutation.isPending || extractHeadersMutation.isPending ? (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                <FileText size={22} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t('import.processing')}</p>
              <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
            </>
          ) : fileName && (mappingMode || previewData) ? (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-foreground">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {mappingMode ? "Mapeamento de colunas pendente" : t('import.previewInfo', { count: previewData?.transactions.length, format: previewData?.detected_format.toUpperCase() })}
              </p>
              <button
                className="mt-3 text-xs text-muted-foreground hover:text-rose-500 transition-colors flex items-center gap-1"
                onClick={(e) => { e.stopPropagation(); handleReset() }}
              >
                <X size={12} /> {t('import.removeFile')}
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Upload size={22} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">
                {t('import.dragOrClick')}
              </p>
              <p className="text-xs text-muted-foreground">{t('import.acceptedFormats')}</p>
              <button
                className="mt-2 text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                onClick={(e) => {
                  e.stopPropagation()
                  const csv = 'date,description,amount,currency,fx_rate\n2026-01-15,Grocery Store,-120.50,USD,\n2026-01-20,Salary Payment,5000.00,EUR,1.08\n'
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'template.csv'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download size={12} />
                {t('import.downloadTemplate')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mapping Section */}
      {mappingMode && csvHeaders.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Mapeamento de Colunas</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Selecione a qual coluna da sua planilha corresponde cada campo do sistema.
            </p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {MAPPING_FIELDS.map(field => {
              const isMapped = !!columnMapping[field.key]
              return (
                <div key={field.key} className={`p-3 rounded-lg border transition-colors ${isMapped ? 'border-emerald-500 bg-emerald-50' : 'border-border bg-card'}`}>
                  <Label className={`text-xs font-medium mb-2 flex items-center gap-1 ${isMapped ? 'text-emerald-700' : 'text-foreground'}`}>
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                    {isMapped && <CheckCircle2 size={12} className="text-emerald-500 ml-auto" />}
                  </Label>
                  <select
                    className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">-- Não mapear --</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-4 border-t border-border bg-muted/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
               <div className="w-full sm:w-auto">
                  <Label className="text-xs text-muted-foreground mb-1 block">{t('import.dateFormat')}</Label>
                  <select
                    className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={csvDateFormat}
                    onChange={(e) => setCsvDateFormat(e.target.value)}
                  >
                    <option value="">{t('import.dateFormatAuto')}</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-1 sm:pt-4">
                  <input
                    type="checkbox"
                    id="flip-amount"
                    checked={csvFlipAmount}
                    onChange={(e) => setCsvFlipAmount(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="flip-amount" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                    {t('import.flipAmounts')}
                  </Label>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Cards (Visible when preview is available) */}
      {previewData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Lançamentos</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">{totalCount}</span>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Receitas válidas</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-emerald-600">{formatCurrency(incomeSum)}</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1">{incomeCount} lançamentos</span>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Despesas válidas</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-rose-500">{formatCurrency(expenseSum)}</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1">{expenseCount} lançamentos</span>
          </div>
          <div className={`bg-card rounded-xl border p-4 shadow-sm flex flex-col ${hasErrors ? 'border-amber-500 bg-amber-50/50' : 'border-border'}`}>
            <span className={`text-xs font-medium uppercase tracking-wider mb-1 ${hasErrors ? 'text-amber-700' : 'text-muted-foreground'}`}>Erros encontrados</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${hasErrors ? 'text-amber-600' : 'text-emerald-600'}`}>{errorCount}</span>
            </div>
            {hasErrors && <span className="text-xs text-amber-700 mt-1">Impedem a importação</span>}
            {!hasErrors && errorCount === 0 && totalCount > 0 && <span className="text-xs text-emerald-600 mt-1">Tudo certo!</span>}
          </div>
        </div>
      )}

      {/* Preview section */}
      {previewData && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{t('import.preview')}</p>
                {isCheckingDuplicates && <span className="text-xs text-muted-foreground animate-pulse">Verificando...</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  {t('import.incomeCount', { count: incomeCount })}
                </span>
                <span className="flex items-center gap-1 text-rose-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                  {t('import.expenseCount', { count: expenseCount })}
                </span>
              </div>
            </div>
          </div>

          {/* Account picker */}
          <div className="px-4 sm:px-5 py-4 border-b border-border bg-muted/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Label className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                {t('import.importTo')}
              </Label>
              <select
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                <option value="">{t('import.selectAccount')}</option>
                {accountsList?.map((acc) => (
                  <option key={acc.id} value={acc.id}>{getAccountName(acc)} ({t(TYPE_LABELS[acc.type] || acc.type)})</option>
                ))}
              </select>
              {!selectedAccount && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1.5 rounded-lg shrink-0">
                  <AlertCircle size={12} />
                  {t('import.selectAccountWarning')}
                </div>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-transparent border-b border-border">
                  <TableHead className="text-xs font-medium text-muted-foreground py-3 pl-5 w-[110px]">
                    {t('transactions.date')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground py-3">
                    {t('transactions.description')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground py-3 pr-5 text-right w-[160px]">
                    {t('transactions.amount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.transactions.slice(0, 50).map((tx, i) => {
                  const isDuplicate = duplicateFlags?.[i] ?? false;
                  return (
                    <TableRow key={i} className={`border-b border-border last:border-0 hover:bg-muted ${isDuplicate ? 'opacity-50 bg-muted/30' : ''} ${tx.import_error ? 'bg-amber-50/50' : ''}`}>
                      <TableCell className="py-3 pl-5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString(locale)}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          {tx.import_error && <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                          <span className={tx.import_error ? 'text-amber-900 font-medium' : ''}>{tx.description}</span>
                          {isDuplicate && !tx.import_error && (
                            <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground px-1.5 py-0.5 rounded uppercase font-semibold">
                              Já lançado
                            </span>
                          )}
                          {tx.import_error && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
                              {tx.import_error}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`py-3 pr-5 text-right text-sm font-bold tabular-nums ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {tx.type === 'credit' ? '+' : '−'}{formatCurrency(Math.abs(Number(tx.amount)), userCurrency, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {previewData.transactions.length > 50 && (
              <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
                {t('import.showingPreview', { shown: 50, total: previewData.transactions.length })}
              </p>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-4 sm:px-5 py-4 border-t border-border flex items-center justify-between">
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleReset}
            >
              {t('common.cancel')}
            </button>
            <Button
              onClick={startStreamingImport}
              disabled={!selectedAccount || !!importProgress || hasErrors || totalCount === 0}
              className="gap-2"
            >
              <Upload size={14} />
              {t('import.importButton', { count: previewData.transactions.length })}
            </Button>
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{t('import.history')}</h2>
        </div>

        {importHistory.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
            {t('import.noHistory')}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 sm:px-4 py-3 font-medium text-muted-foreground">{t('import.historyDate')}</th>
                  <th className="text-left px-3 sm:px-4 py-3 font-medium text-muted-foreground">{t('import.historyFile')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">{t('import.historyFormat')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t('import.historyAccount')}</th>
                  <th className="text-right px-3 sm:px-4 py-3 font-medium text-muted-foreground">{t('import.historyCount')}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t('import.historyCredit')}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t('import.historyDebit')}</th>
                  <th className="px-3 sm:px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {importHistory.map((log) => (
                  <tr key={log.id} className="hover:bg-muted">
                    <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 sm:px-4 py-3 font-mono text-xs text-foreground max-w-[120px] sm:max-w-none truncate">{log.filename || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded font-mono uppercase">
                        {log.format || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{log.account_name || '—'}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-foreground">{log.transaction_count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium hidden sm:table-cell">
                      {formatCurrency(log.total_credit, userCurrency, locale)}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-600 font-medium hidden sm:table-cell">
                      {formatCurrency(log.total_debit, userCurrency, locale)}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteTarget(log)}
                        className="text-muted-foreground hover:text-rose-500 transition-colors"
                        title={t('import.undoImport')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import progress modal */}
      <Dialog open={!!importProgress} onOpenChange={(open) => { if (!open) handleCancelImport() }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          {importProgress && (() => {
            const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0
            const isDone = importProgress.phase === 'done'
            const radius = 54
            const circumference = 2 * Math.PI * radius
            const offset = circumference - (pct / 100) * circumference
            return (
              <div className="flex flex-col items-center py-6 gap-5">
                {/* Circular progress */}
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                    <circle
                      cx="64" cy="64" r={radius} fill="none"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      className={isDone ? 'text-emerald-500' : 'text-primary'}
                      style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isDone ? (
                      <CheckCircle2 size={32} className="text-emerald-500 animate-in zoom-in duration-300" />
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-foreground tabular-nums">{pct}%</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {importProgress.current}/{importProgress.total}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Phase label */}
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2 justify-center">
                    {!isDone && <Loader2 size={14} className="animate-spin text-primary" />}
                    {importProgress.phase === 'preparing' && t('import.progressPreparing')}
                    {importProgress.phase === 'importing' && t('import.progressImporting')}
                    {importProgress.phase === 'finalizing' && t('import.progressFinalizing')}
                    {importProgress.phase === 'done' && t('import.progressDone')}
                  </p>
                  {fileName && <p className="text-xs text-muted-foreground mt-1">{fileName}</p>}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{importProgress.imported} {t('import.progressImported')}</span>
                  </div>
                  {importProgress.skipped > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>{importProgress.skipped} {t('import.progressSkipped')}</span>
                    </div>
                  )}
                </div>

                {/* Progress bar (thin) */}
                <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${isDone ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('import.undoImport')}</DialogTitle>
            <DialogDescription>
              {t('import.undoDescription', { count: deleteTarget?.transaction_count, filename: deleteTarget?.filename || '—' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50"
            >
              {deleteMutation.isPending ? t('import.deleting') : t('import.deleteAll')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

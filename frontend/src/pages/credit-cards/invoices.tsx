import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CreditCard, FileText, Loader2, SearchX, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Trash2, X } from 'lucide-react'
import { invoicesApi, transactions as transactionsApi } from '@/lib/api'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function CreditCardInvoices() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'description' | 'amount' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['invoice-transactions'] })
  }, [queryClient])

  useEffect(() => {
    if (!selectedInvoiceId) {
      setSearchTerm('')
      setSortField(null)
      setSortDirection('asc')
    }
  }, [selectedInvoiceId])

  const { data: invoices, isLoading, isFetching } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.getInvoices(),
  })

  const { data: transactions, isLoading: isLoadingTransactions, isFetching: isFetchingTransactions } = useQuery({
    queryKey: ['invoice-transactions', selectedInvoiceId],
    queryFn: () => invoicesApi.getInvoiceTransactions(selectedInvoiceId!),
    enabled: !!selectedInvoiceId,
  })

  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => transactionsApi.delete(id)))
      return { deleted: ids.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-transactions', selectedInvoiceId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setSelectedTxIds(new Set())
      setBulkDeleteDialogOpen(false)
      toast.success(`${result.deleted} transação(ões) excluída(s)`)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || error.message || 'Erro ao excluir transações')
    },
  })

  const isRefreshing = isFetching || isFetchingTransactions || bulkDeleteMutation.isPending

  const handleSort = (field: 'description' | 'amount') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredTransactions = (transactions || []).filter(txn => {
    const term = searchTerm.toLowerCase()
    const descMatches = txn.description.toLowerCase().includes(term)
    const amountMatches = txn.amount.toString().includes(term) || formatCurrency(txn.amount).toLowerCase().includes(term)
    return descMatches || amountMatches
  })

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (!sortField) return 0
    if (sortField === 'description') {
      const valA = a.description.toLowerCase()
      const valB = b.description.toLowerCase()
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
    }
    if (sortField === 'amount') {
      const valA = a.type === 'credit' ? Number(a.amount) : -Number(a.amount)
      const valB = b.type === 'credit' ? Number(b.amount) : -Number(b.amount)
      return sortDirection === 'asc' ? valA - valB : valB - valA
    }
    return 0
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-200">Paga</Badge>
      case 'PARTIALLY_PAID':
        return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-200">Parcial</Badge>
      case 'OPEN':
      default:
        return <Badge className="bg-rose-500/15 text-rose-600 hover:bg-rose-500/25 border-rose-200">Aberta</Badge>
    }
  }

  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-')
      return format(new Date(parseInt(year), parseInt(month) - 1), 'MM/yyyy')
    } catch {
      return monthStr
    }
  }

  const selectedInvoice = invoices?.find(inv => inv.id === selectedInvoiceId)

  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        section="Cartões de Crédito"
        title="Faturas de Cartão"
        action={
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 pt-6">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <FileText className="w-5 h-5" />
            </div>
            Faturas Consolidadas
          </CardTitle>
          <CardDescription>
            Acompanhe o fechamento, os valores e o status de pagamento das faturas importadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <SearchX className="h-8 w-8 opacity-40" />
              </div>
              <p className="font-medium text-foreground">Nenhuma fatura encontrada</p>
              <p className="text-sm mt-1 max-w-sm">
                Importe faturas de cartão de crédito para que elas apareçam organizadas aqui.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 font-semibold">Conta</TableHead>
                    <TableHead className="font-semibold">Referência</TableHead>
                    <TableHead className="text-right font-semibold">Registros</TableHead>
                    <TableHead className="text-right font-semibold">Valor Total</TableHead>
                    <TableHead className="text-right font-semibold">Valor Pago</TableHead>
                    <TableHead className="text-right font-semibold">Em Aberto</TableHead>
                    <TableHead className="text-center font-semibold pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const openAmount = invoice.total_amount - invoice.paid_amount
                    
                    return (
                      <TableRow 
                        key={invoice.id}
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                        className="cursor-pointer transition-colors hover:bg-muted/50 group"
                      >
                        <TableCell className="pl-6 font-medium">
                          {invoice.account?.name || '-'}
                        </TableCell>
                        <TableCell>
                          <span className="bg-muted px-2.5 py-1 rounded-md text-xs font-medium">
                            {formatMonth(invoice.month_reference)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {invoice.transaction_count}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {formatCurrency(invoice.total_amount)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">
                          {formatCurrency(invoice.paid_amount)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {openAmount > 0 ? (
                            <span className="text-rose-600">{formatCurrency(openAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground">R$ 0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center pr-6">
                          {getStatusBadge(invoice.status)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Modal */}
      <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => {
        if (!open) {
          setSelectedInvoiceId(null)
          handleRefresh()
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0 bg-card border-border/50 shadow-xl">
          <DialogHeader className="p-6 border-b border-border/50 bg-muted/10">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Lançamentos da Fatura
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm">
                  {selectedInvoice?.account?.name ? `${selectedInvoice.account.name} • ` : ''}
                  Fatura de {selectedInvoice ? formatMonth(selectedInvoice.month_reference) : ''}
                </DialogDescription>
              </div>
              {selectedInvoice && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Total da Fatura</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(selectedInvoice.total_amount)}</p>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="px-6 py-3 border-b border-border bg-muted/5 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por descrição ou valor..."
                className="pl-9 pr-4 py-1.5 w-full border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-0">
            {isLoadingTransactions ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum lançamento encontrado.
              </div>
            ) : sortedTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum resultado encontrado para a busca.
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-md z-10 shadow-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-6 pr-0">
                      <input
                        type="checkbox"
                        checked={sortedTransactions.length > 0 && selectedTxIds.size === sortedTransactions.length}
                        ref={(el) => { if (el) el.indeterminate = selectedTxIds.size > 0 && selectedTxIds.size < sortedTransactions.length }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTxIds(new Set(sortedTransactions.map(t => t.id)))
                          } else {
                            setSelectedTxIds(new Set())
                          }
                        }}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="pl-4 w-24">Data</TableHead>
                    <TableHead 
                      className="cursor-pointer select-none hover:text-foreground transition-colors group w-1/2"
                      onClick={() => handleSort('description')}
                    >
                      <div className="flex items-center gap-1">
                        Descrição
                        {sortField === 'description' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-right pr-6 cursor-pointer select-none hover:text-foreground transition-colors group"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Valor
                        {sortField === 'amount' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((txn) => {
                    const isPayment = txn.type === 'credit' || (selectedInvoice && txn.account_id !== selectedInvoice.account_id)
                    return (
                    <TableRow key={txn.id} className={`hover:bg-muted/30 ${selectedTxIds.has(txn.id) ? 'bg-primary/5' : ''}`}>
                      <TableCell className="pl-6 pr-0 w-10">
                        <input
                          type="checkbox"
                          checked={selectedTxIds.has(txn.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedTxIds)
                            if (e.target.checked) newSet.add(txn.id)
                            else newSet.delete(txn.id)
                            setSelectedTxIds(newSet)
                          }}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="pl-4 text-muted-foreground whitespace-nowrap">
                        {new Date(txn.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="font-medium text-foreground max-w-0">
                        <div className="flex items-center gap-2 truncate" title={txn.description}>
                          <span className="truncate">{txn.description}</span>
                          {txn.cardholder_name && (
                            <span
                              className="inline-flex items-center text-[10px] font-bold tabular-nums text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 px-1.5 py-0.5 rounded-full"
                              title="Cartão Adicional"
                            >
                              <CreditCard size={10} className="mr-1" />
                              {txn.cardholder_name}
                            </span>
                          )}
                          {isPayment ? (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 text-emerald-600 border-emerald-200 bg-emerald-500/10">Pagamento</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 text-rose-600 border-rose-200 bg-rose-500/10 hidden sm:inline-flex">Despesa</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-medium pr-6 ${isPayment ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPayment ? '+' : '-'}{formatCurrency(txn.amount)}
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          
          <div className="relative p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between text-sm text-muted-foreground">
            <span>{filteredTransactions.length} de {transactions?.length || 0} lançamentos</span>
            {selectedInvoice && (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Pago: <span className="font-medium text-foreground">{formatCurrency(selectedInvoice.paid_amount)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Aberto: <span className="font-medium text-foreground">{formatCurrency(selectedInvoice.total_amount - selectedInvoice.paid_amount)}</span>
                </span>
              </div>
            )}

            {/* Bulk Action Overlay */}
            {selectedTxIds.size > 0 && (
              <div className="absolute inset-0 bg-card border-t border-border flex items-center justify-between px-4 z-10">
                <span className="text-sm font-medium text-foreground">
                  {selectedTxIds.size} selecionado(s)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBulkDeleteDialogOpen(true)}
                    className="inline-flex items-center justify-center rounded-md bg-destructive w-8 h-8 text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamentos?</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir {selectedTxIds.size} lançamento(s)? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setBulkDeleteDialogOpen(false)}
              disabled={bulkDeleteMutation.isPending}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedTxIds))}
              disabled={bulkDeleteMutation.isPending}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-9 px-4 py-2"
            >
              {bulkDeleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

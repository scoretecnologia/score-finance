import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CreditCard, FileText, Loader2, SearchX, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'
import { invoicesApi } from '@/lib/api'
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

  const isRefreshing = isFetching || isFetchingTransactions

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
                    <TableHead className="pl-6 w-24">Data</TableHead>
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
                    <TableRow key={txn.id} className="hover:bg-muted/30">
                      <TableCell className="pl-6 text-muted-foreground whitespace-nowrap">
                        {new Date(txn.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="font-medium text-foreground max-w-0">
                        <div className="flex items-center gap-2 truncate" title={txn.description}>
                          <span className="truncate">{txn.description}</span>
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
          
          <div className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between text-sm text-muted-foreground">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

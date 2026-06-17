import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CreditCard, FileText, Loader2, SearchX } from 'lucide-react'
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

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.getInvoices(),
  })

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['invoice-transactions', selectedInvoiceId],
    queryFn: () => invoicesApi.getInvoiceTransactions(selectedInvoiceId!),
    enabled: !!selectedInvoiceId,
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
      <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
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

          <div className="flex-1 overflow-y-auto p-0">
            {isLoadingTransactions ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum lançamento encontrado.
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-md z-10 shadow-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 w-24">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right pr-6">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn) => (
                    <TableRow key={txn.id} className="hover:bg-muted/30">
                      <TableCell className="pl-6 text-muted-foreground whitespace-nowrap">
                        {new Date(txn.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {txn.description}
                      </TableCell>
                      <TableCell className={`text-right font-medium pr-6 ${txn.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          
          <div className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between text-sm text-muted-foreground">
            <span>{transactions?.length || 0} lançamentos</span>
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

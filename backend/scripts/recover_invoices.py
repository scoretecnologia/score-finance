import asyncio
import os
import sys
from collections import defaultdict
from datetime import datetime

from sqlalchemy import select, delete, func

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import async_session_maker
from app.models.account import Account
from app.models.credit_card_invoice import CreditCardInvoice
from app.models.transaction import Transaction
from app.services.credit_card_invoice_service import recalculate_invoice_paid_amount


async def recover():
    print("Recovering deleted credit card invoices...")
    async with async_session_maker() as session:
        # Get all credit card accounts
        accounts_result = await session.execute(
            select(Account).where(Account.type == "credit_card")
        )
        accounts = accounts_result.scalars().all()
        print(f"Found {len(accounts)} credit card accounts.")

        total_created = 0
        total_linked = 0

        for account in accounts:
            # Get all transactions for this account
            tx_result = await session.execute(
                select(Transaction).where(
                    Transaction.account_id == account.id,
                    Transaction.source != "opening_balance",
                )
            )
            transactions = tx_result.scalars().all()
            if not transactions:
                print(f"  Account '{account.name}': no transactions, skipping.")
                continue

            # Group transactions by month
            monthly: dict[str, list[Transaction]] = defaultdict(list)
            for tx in transactions:
                month_key = tx.date.strftime("%Y-%m")
                monthly[month_key].append(tx)

            print(f"  Account '{account.name}': {len(transactions)} transactions across {len(monthly)} months.")

            for month_ref, txs in sorted(monthly.items()):
                # Check if invoice already exists
                existing = await session.execute(
                    select(CreditCardInvoice).where(
                        CreditCardInvoice.account_id == account.id,
                        CreditCardInvoice.month_reference == month_ref,
                    )
                )
                invoice = existing.scalars().first()

                if not invoice:
                    invoice = CreditCardInvoice(
                        company_id=account.company_id,
                        account_id=account.id,
                        month_reference=month_ref,
                        status="OPEN",
                    )
                    session.add(invoice)
                    await session.flush()
                    total_created += 1
                    print(f"    Created invoice for {month_ref}.")

                # Link unlinked transactions to this invoice
                linked = 0
                for tx in txs:
                    if tx.invoice_id is None:
                        tx.invoice_id = invoice.id
                        linked += 1

                if linked:
                    print(f"    Linked {linked} transactions to {month_ref}.")
                    total_linked += linked

                # Recalculate invoice totals from linked transactions
                await recalculate_invoice_paid_amount(session, invoice.id)

        # Final cleanup: delete invoices with 0 transactions
        orphan_stmt = select(CreditCardInvoice.id).where(
            CreditCardInvoice.transaction_count == 0
        )
        orphan_result = await session.execute(orphan_stmt)
        orphan_ids = orphan_result.scalars().all()
        if orphan_ids:
            del_stmt = delete(CreditCardInvoice).where(CreditCardInvoice.id.in_(orphan_ids))
            await session.execute(del_stmt)
            print(f"Cleaned up {len(orphan_ids)} orphaned invoices.")

        await session.commit()

        print(f"\nDone! Created {total_created} invoices, linked {total_linked} transactions.")


if __name__ == "__main__":
    asyncio.run(recover())

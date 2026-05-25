import csv
import io
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, date
from decimal import Decimal

from ofxparse import OfxParser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionBase
from app.services.credit_card_service import apply_effective_date
from app.services.rule_service import apply_rules_to_transaction
from app.services.fx_rate_service import stamp_primary_amount
from app.services.payee_service import get_or_create_payee


def parse_ofx(content: bytes) -> list[TransactionBase]:
    """Parse OFX file content and return transactions."""
    import re
    import unicodedata
    
    # Decode robustly
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
        
    # Remove accents and convert to pure ASCII. 
    # This prevents ofxparse/sgmllib from crashing on unexpected bytes.
    # "GESTÃO" -> "GESTAO", "Transferência" -> "Transferencia"
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    
    # Now we safely pass pure ASCII
    clean_content = text.encode('ascii')
    ofx = OfxParser.parse(io.BytesIO(clean_content))

    transactions = []

    for account in ofx.accounts:
        for txn in account.statement.transactions:
            raw_payee = getattr(txn, 'payee', None) or None
            transactions.append(TransactionBase(
                description=txn.memo or txn.payee or "Unknown",
                amount=abs(Decimal(str(txn.amount))),
                date=txn.date.date() if hasattr(txn.date, 'date') else txn.date,
                type="credit" if txn.amount > 0 else "debit",
                external_id=getattr(txn, 'id', None),
                payee_raw=raw_payee,
            ))

    return transactions


def parse_qif(content: bytes) -> list[TransactionBase]:
    """Parse QIF file content and return transactions."""
    # Try UTF-8 first, fall back to Latin-1 for legacy software (e.g. Microsoft Money)
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
    transactions = []

    # Split into transaction blocks by "^"
    blocks = text.split('^')
    for block in blocks:
        lines = block.strip().splitlines()
        if not lines:
            continue

        txn_date = None
        amount = None
        payee = None
        memo = None

        for line in lines:
            line = line.strip()
            if not line:
                continue
            tag, value = line[0], line[1:]
            if tag == 'D':
                # Try common date formats (including 2-digit year variants)
                for fmt in [
                    '%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d',
                    "%m/%d'%Y", "%m/%d'%y",
                    '%m/%d/%y', '%d/%m/%y',
                ]:
                    try:
                        txn_date = datetime.strptime(value.strip(), fmt).date()
                        break
                    except ValueError:
                        continue
            elif tag == 'T' or tag == 'U':
                try:
                    amount = Decimal(value.strip().replace(',', ''))
                except Exception:
                    pass
            elif tag == 'P':
                payee = value.strip()
            elif tag == 'M':
                memo = value.strip()

        if txn_date is None or amount is None:
            continue

        description = payee or memo or "Unknown"
        transactions.append(TransactionBase(
            description=description,
            amount=abs(amount),
            date=txn_date,
            type="credit" if amount > 0 else "debit",
            payee_raw=payee,
        ))

    return transactions


def parse_camt(content: bytes) -> list[TransactionBase]:
    """Parse CAMT.053 (ISO 20022) XML file content and return transactions."""
    root = ET.fromstring(content)

    # Detect namespace dynamically
    ns_match = re.match(r'\{(.+?)\}', root.tag)
    ns = ns_match.group(1) if ns_match else ''
    nsmap = {'ns': ns} if ns else {}

    def find(element, path):
        """Find element with or without namespace."""
        if nsmap:
            parts = path.split('/')
            ns_path = '/'.join(f'ns:{p}' for p in parts)
            return element.find(ns_path, nsmap)
        return element.find(path)

    def findall(element, path):
        if nsmap:
            parts = path.split('/')
            ns_path = '/'.join(f'ns:{p}' for p in parts)
            return element.findall(ns_path, nsmap)
        return element.findall(path)

    def find_text(element, path):
        el = find(element, path)
        return el.text if el is not None else None

    transactions = []

    # Navigate: Document > BkToCstmrStmt > Stmt > Ntry
    for stmt in findall(root, 'BkToCstmrStmt/Stmt'):
        for ntry in findall(stmt, 'Ntry'):
            # Amount
            amt_el = find(ntry, 'Amt')
            if amt_el is None:
                continue
            try:
                amount = Decimal(amt_el.text)
            except Exception:
                continue

            # Credit/Debit indicator
            cdt_dbt = find_text(ntry, 'CdtDbtInd')
            txn_type = "credit" if cdt_dbt == "CRDT" else "debit"

            # Date: try BookgDt/Dt then ValDt/Dt
            date_str = find_text(ntry, 'BookgDt/Dt') or find_text(ntry, 'ValDt/Dt')
            if not date_str:
                continue
            try:
                txn_date = datetime.strptime(date_str.strip(), '%Y-%m-%d').date()
            except ValueError:
                continue

            # Description from various paths
            description = (
                find_text(ntry, 'NtryDtls/TxDtls/RmtInf/Ustrd')
                or find_text(ntry, 'NtryDtls/TxDtls/RltdPties/Cdtr/Nm')
                or find_text(ntry, 'NtryDtls/TxDtls/RltdPties/Dbtr/Nm')
                or find_text(ntry, 'AddtlNtryInf')
                or "Unknown"
            )

            # Extract currency from Ccy attribute on Amt element
            txn_currency = amt_el.get('Ccy') or None

            transactions.append(TransactionBase(
                description=description,
                amount=abs(amount),
                date=txn_date,
                type=txn_type,
                currency=txn_currency,
            ))

    return transactions


DATE_FORMAT_MAP = {
    'DD/MM/YYYY': '%d/%m/%Y',
    'MM/DD/YYYY': '%m/%d/%Y',
    'YYYY-MM-DD': '%Y-%m-%d',
}


def parse_csv(
    content: bytes,
    date_format: str | None = None,
    flip_amount: bool = False,
    inflow_column: str | None = None,
    outflow_column: str | None = None,
) -> list[TransactionBase]:
    """Parse CSV file content and return transactions.

    Attempts to detect common column formats:
    - date, description, amount
    - data, descricao, valor (Portuguese)

    Options:
    - date_format: explicit date format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
    - flip_amount: negate all parsed amounts
    - inflow_column/outflow_column: use split columns instead of single amount
    """
    try:
        text = content.decode('utf-8-sig')  # Handle BOM
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Normalize line endings to avoid _csv.Error on mixed/legacy newline characters
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Detect delimiter
    delimiter = ','
    if text:
        first_line = text.splitlines()[0] if text.splitlines() else ""
        candidates = [';', ',', '\t', '|']
        best_delim = ','
        max_fields = 1
        for d in candidates:
            fields = first_line.split(d)
            if len(fields) > max_fields:
                max_fields = len(fields)
                best_delim = d
        delimiter = best_delim

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    def _strip_accents(s: str) -> str:
        """Remove diacritics so 'Descrição' -> 'descricao'."""
        import unicodedata
        nfkd = unicodedata.normalize('NFKD', s)
        return ''.join(c for c in nfkd if not unicodedata.combining(c))

    # Normalize field names: lowercase, strip whitespace AND accents
    fieldnames = [_strip_accents(f.lower().strip()) for f in (reader.fieldnames or [])]

    # Map common column names
    date_cols = ['date', 'data', 'dt', 'transaction_date', 'data_transacao']
    desc_cols = ['description', 'descricao', 'desc', 'memo', 'historico', 'lancamento']
    amount_cols = ['amount', 'valor', 'value', 'quantia', 'valor r$', 'valor_r$', 'valor(r$)', 'valor ($)']
    type_cols = ['type', 'tipo', 'debito/credito', 'dc', 'd/c', 'natureza']
    currency_cols = ['currency', 'moeda', 'currency_code']
    fx_rate_cols = ['fx_rate', 'fx_rate_used', 'taxa_cambio', 'exchange_rate', 'taxa']
    external_id_cols = ['identificador', 'external_id', 'id', 'fitid']

    def find_col(candidates):
        for c in candidates:
            if c in fieldnames:
                return c
        return None

    date_col = find_col(date_cols)
    desc_col = find_col(desc_cols)
    external_id_col = find_col(external_id_cols)
    type_col = find_col(type_cols)

    # In split mode, we don't require a single amount column
    use_split = inflow_column and outflow_column
    inflow_col = _strip_accents(inflow_column.lower().strip()) if inflow_column else None
    outflow_col = _strip_accents(outflow_column.lower().strip()) if outflow_column else None

    if use_split:
        if inflow_col not in fieldnames or outflow_col not in fieldnames:
            raise ValueError(f"Inflow/outflow columns not found in CSV. Available columns: {', '.join(fieldnames)}")
        amount_col = None
    else:
        amount_col = find_col(amount_cols)

    currency_col = find_col(currency_cols)
    fx_rate_col = find_col(fx_rate_cols)

    if not date_col or not desc_col:
        raise ValueError(
            f"Could not detect CSV columns. Found: {', '.join(fieldnames)}. "
            f"Expected columns like: date, description, amount (or Portuguese equivalents: data, descricao, valor)"
        )
    if not use_split and not amount_col:
        raise ValueError(
            f"Could not detect amount column. Found: {', '.join(fieldnames)}. "
            f"Expected a column named: {', '.join(amount_cols)}"
        )

    # Determine date formats to try
    if date_format and date_format in DATE_FORMAT_MAP:
        date_formats = [DATE_FORMAT_MAP[date_format]]
    else:
        date_formats = ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y']

    transactions = []
    for row in reader:
        # Normalize row keys (strip accents to match detected columns)
        row = {_strip_accents(k.lower().strip()): v for k, v in row.items()}

        # Parse date
        date_str = row[date_col].strip()
        txn_date = None
        for fmt in date_formats:
            try:
                txn_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

        if not txn_date:
            continue  # Skip invalid dates

        # Parse amount
        if use_split:
            inflow_str = normalize_amount(row.get(inflow_col, ""))
            outflow_str = normalize_amount(row.get(outflow_col, ""))

            try:
                inflow = Decimal(inflow_str) if inflow_str else Decimal('0')
            except Exception:
                inflow = Decimal('0')
            try:
                outflow = Decimal(outflow_str) if outflow_str else Decimal('0')
            except Exception:
                outflow = Decimal('0')

            if inflow > 0:
                amount = inflow
                txn_type = "credit"
            elif outflow > 0:
                amount = outflow
                txn_type = "debit"
            else:
                continue  # Skip rows with no amount
        else:
            amount_str = normalize_amount(row[amount_col])

            try:
                amount = Decimal(amount_str)
            except Exception:
                continue  # Skip invalid amounts

            if flip_amount:
                amount = -amount

            txn_type = "credit" if amount > 0 else "debit"
            if type_col and row.get(type_col):
                t_val = row[type_col].strip().lower()
                if t_val in ('d', 'debit', 'debito', 'dbito'):
                    txn_type = "debit"
                elif t_val in ('c', 'credit', 'credito', 'crdito'):
                    txn_type = "credit"
            amount = abs(amount)

        # Extract optional currency and fx_rate from CSV columns
        txn_currency = None
        txn_fx_rate = None
        if currency_col and row.get(currency_col):
            txn_currency = row[currency_col].strip().upper() or None
        if fx_rate_col and row.get(fx_rate_col):
            fx_str = normalize_amount(row[fx_rate_col].strip())
            if fx_str:
                try:
                    txn_fx_rate = Decimal(fx_str)
                except Exception:
                    pass

        # Extract external_id if available (e.g. Nubank's 'Identificador')
        txn_external_id = None
        if external_id_col and row.get(external_id_col):
            txn_external_id = row[external_id_col].strip() or None

        transactions.append(TransactionBase(
            description=row[desc_col].strip(),
            amount=abs(amount),
            date=txn_date,
            type=txn_type,
            currency=txn_currency,
            fx_rate=txn_fx_rate,
            external_id=txn_external_id,
        ))

    return transactions


async def import_transactions(
    session: AsyncSession,
    company_id: uuid.UUID,
    account_id: uuid.UUID,
    transactions: list[TransactionBase],
    source: str,
    filename: str = "",
    detected_format: str = "",
) -> tuple[int, int, uuid.UUID]:
    """Import transactions into an account. Returns (imported, skipped, import_log_id)."""
    from app.models.import_log import ImportLog

    # Calculate summaries
    total_credit = sum(t.amount for t in transactions if t.type == "credit")
    total_debit = sum(t.amount for t in transactions if t.type == "debit")

    # Create import log first to get its ID
    import_log = ImportLog(
        company_id=company_id,
        account_id=account_id,
        filename=filename,
        format=detected_format,
        transaction_count=len(transactions),
        total_credit=total_credit,
        total_debit=total_debit,
    )
    session.add(import_log)
    await session.flush()  # Get the import_log.id

    # Look up account currency for fallback
    account_result = await session.execute(
        select(Account).where(Account.id == account_id)
    )
    account = account_result.scalar_one_or_none()
    account_currency = account.currency if account else get_settings().default_currency

    # Pre-load rules once to avoid N+1 queries
    from app.models.rule import Rule
    from app.models.chart_account import ChartAccount
    from app.services.rule_engine import evaluate_conditions, apply_rule_actions
    rules_result = await session.execute(
        select(Rule)
        .where(Rule.company_id == company_id, Rule.is_active == True)
        .order_by(Rule.priority, Rule.id)
    )
    rules = list(rules_result.scalars().all())

    # Pre-load valid chart_account IDs to guard against FK violations
    ca_result = await session.execute(
        select(ChartAccount.id).where(ChartAccount.company_id == company_id)
    )
    valid_chart_account_ids = {row[0] for row in ca_result.all()}

    imported = 0
    skipped = 0
    for txn_data in transactions:
        # Resolve currency: CSV value > account currency
        txn_currency = txn_data.currency or account_currency

        # Duplicate detection: use external_id when available (OFX FITID),
        # fall back to field-based matching for formats without unique IDs
        if txn_data.external_id:
            existing = await session.execute(
                select(Transaction).where(
                    Transaction.account_id == account_id,
                    Transaction.external_id == txn_data.external_id,
                )
            )
        else:
            existing = await session.execute(
                select(Transaction).where(
                    Transaction.account_id == account_id,
                    Transaction.date == txn_data.date,
                    Transaction.amount == txn_data.amount,
                    Transaction.type == txn_data.type,
                    Transaction.description == txn_data.description,
                )
            )
        if existing.scalars().first():
            skipped += 1
            continue

        # Resolve payee entity from raw payee text (OFX/QIF)
        import_payee_id = None
        import_payee_raw = getattr(txn_data, "payee_raw", None)
        if import_payee_raw:
            import_payee_entity = await get_or_create_payee(session, company_id, import_payee_raw)
            import_payee_id = import_payee_entity.id

        transaction = Transaction(
            company_id=company_id,
            account_id=account_id,
            description=txn_data.description,
            amount=txn_data.amount,
            date=txn_data.date,
            type=txn_data.type,
            source=source,
            import_id=import_log.id,
            external_id=txn_data.external_id,
            currency=txn_currency,
            payee=import_payee_raw,
            payee_id=import_payee_id,
        )
        apply_effective_date(transaction, account)

        # If CSV provided an fx_rate, use it directly
        if txn_data.fx_rate:
            transaction.fx_rate_used = txn_data.fx_rate
            transaction.amount_primary = txn_data.amount * txn_data.fx_rate

        session.add(transaction)
        await session.flush()

        # Apply pre-loaded rules inline (avoids re-querying rules per txn)
        category_set = transaction.category_id is not None
        for rule in rules:
            conditions = rule.conditions or []
            actions = rule.actions or []
            if evaluate_conditions(rule.conditions_op, conditions, transaction):
                category_set = apply_rule_actions(actions, transaction, category_set, valid_chart_account_ids)

        # Only auto-convert if no fx_rate was provided by the CSV
        if not txn_data.fx_rate:
            await stamp_primary_amount(session, company_id, transaction)

        imported += 1

    # Update import log with actual imported count
    import_log.transaction_count = imported

    await session.commit()
    return imported, skipped, import_log.id


async def import_transactions_streamed(
    session: AsyncSession,
    company_id: uuid.UUID,
    account_id: uuid.UUID,
    transactions: list[TransactionBase],
    source: str,
    filename: str = "",
    detected_format: str = "",
):
    """Import transactions with progress updates.

    This is an async generator that yields progress dicts:
      {"phase": "preparing"|"importing"|"finalizing"|"done"|"error",
       "current": int, "total": int, "imported": int, "skipped": int, ...}
    """
    import json
    from app.models.import_log import ImportLog

    total = len(transactions)

    # Phase: preparing
    yield {"phase": "preparing", "current": 0, "total": total, "imported": 0, "skipped": 0}

    # Calculate summaries
    total_credit = sum(t.amount for t in transactions if t.type == "credit")
    total_debit = sum(t.amount for t in transactions if t.type == "debit")

    # Create import log
    import_log = ImportLog(
        company_id=company_id,
        account_id=account_id,
        filename=filename,
        format=detected_format,
        transaction_count=total,
        total_credit=total_credit,
        total_debit=total_debit,
    )
    session.add(import_log)
    await session.flush()

    # Look up account
    account_result = await session.execute(
        select(Account).where(Account.id == account_id)
    )
    account = account_result.scalar_one_or_none()
    account_currency = account.currency if account else get_settings().default_currency

    # Pre-load rules once
    from app.models.rule import Rule
    from app.models.chart_account import ChartAccount
    from app.services.rule_engine import evaluate_conditions, apply_rule_actions
    rules_result = await session.execute(
        select(Rule)
        .where(Rule.company_id == company_id, Rule.is_active == True)
        .order_by(Rule.priority, Rule.id)
    )
    rules = list(rules_result.scalars().all())

    # Pre-load valid chart_account IDs to guard against FK violations
    ca_result = await session.execute(
        select(ChartAccount.id).where(ChartAccount.company_id == company_id)
    )
    valid_chart_account_ids = {row[0] for row in ca_result.all()}

    # Phase: importing
    imported = 0
    skipped = 0

    # Determine progress report interval (report every ~2-5% or every 5 items, whichever is smaller)
    report_interval = max(1, min(5, total // 20))

    for idx, txn_data in enumerate(transactions):
        txn_currency = txn_data.currency or account_currency

        # Duplicate detection
        if txn_data.external_id:
            existing = await session.execute(
                select(Transaction.id).where(
                    Transaction.account_id == account_id,
                    Transaction.external_id == txn_data.external_id,
                ).limit(1)
            )
        else:
            existing = await session.execute(
                select(Transaction.id).where(
                    Transaction.account_id == account_id,
                    Transaction.date == txn_data.date,
                    Transaction.amount == txn_data.amount,
                    Transaction.type == txn_data.type,
                    Transaction.description == txn_data.description,
                ).limit(1)
            )
        if existing.scalars().first():
            skipped += 1
            if (idx + 1) % report_interval == 0 or idx == total - 1:
                yield {"phase": "importing", "current": idx + 1, "total": total, "imported": imported, "skipped": skipped}
            continue

        # Resolve payee
        import_payee_id = None
        import_payee_raw = getattr(txn_data, "payee_raw", None)
        if import_payee_raw:
            import_payee_entity = await get_or_create_payee(session, company_id, import_payee_raw)
            import_payee_id = import_payee_entity.id

        transaction = Transaction(
            company_id=company_id,
            account_id=account_id,
            description=txn_data.description,
            amount=txn_data.amount,
            date=txn_data.date,
            type=txn_data.type,
            source=source,
            import_id=import_log.id,
            external_id=txn_data.external_id,
            currency=txn_currency,
            payee=import_payee_raw,
            payee_id=import_payee_id,
        )
        apply_effective_date(transaction, account)

        if txn_data.fx_rate:
            transaction.fx_rate_used = txn_data.fx_rate
            transaction.amount_primary = txn_data.amount * txn_data.fx_rate

        session.add(transaction)
        await session.flush()

        # Apply pre-loaded rules inline
        category_set = transaction.category_id is not None
        for rule in rules:
            conditions = rule.conditions or []
            actions = rule.actions or []
            if evaluate_conditions(rule.conditions_op, conditions, transaction):
                category_set = apply_rule_actions(actions, transaction, category_set, valid_chart_account_ids)

        if not txn_data.fx_rate:
            await stamp_primary_amount(session, company_id, transaction)

        imported += 1

        # Report progress at intervals
        if (idx + 1) % report_interval == 0 or idx == total - 1:
            yield {"phase": "importing", "current": idx + 1, "total": total, "imported": imported, "skipped": skipped}

    # Phase: finalizing
    yield {"phase": "finalizing", "current": total, "total": total, "imported": imported, "skipped": skipped}

    import_log.transaction_count = imported
    await session.commit()

    # Phase: done
    yield {
        "phase": "done",
        "current": total,
        "total": total,
        "imported": imported,
        "skipped": skipped,
        "import_log_id": str(import_log.id),
    }

def normalize_amount(amount_str: str) -> str:
    """
    Normalize monetary string into a standard decimal format compatible with Decimal.

    Example:
        1.442,20 -> 1442.20
        1,442.20 -> 1442.20
    """

    amount_str = amount_str.replace('R$', '').replace(' ', '').strip()

    if ',' in amount_str and '.' in amount_str:
        if amount_str.rfind(',') > amount_str.rfind('.'):
            amount_str = amount_str.replace('.', '').replace(',', '.')
        else:
            amount_str = amount_str.replace(',', '')
    elif ',' in amount_str:
        amount_str = amount_str.replace(',', '.')

    return amount_str


def parse_excel_date(cell_val, datemode=0) -> date | None:
    from datetime import datetime, date
    if isinstance(cell_val, (datetime, date)):
        if hasattr(cell_val, 'date'):
            return cell_val.date()
        return cell_val
    if isinstance(cell_val, str):
        date_str = cell_val.strip()
        if ' ' in date_str:
            date_str = date_str.split(' ')[0]
        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%m/%d/%Y']:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
    if isinstance(cell_val, (int, float)) and cell_val > 0:
        try:
            from xlrd import xldate_as_datetime
            return xldate_as_datetime(cell_val, datemode).date()
        except Exception:
            import datetime as dt
            return (dt.date(1899, 12, 30) + dt.timedelta(days=int(cell_val)))
    return None


def parse_excel_amount(cell_val) -> Decimal | None:
    if cell_val is None or cell_val == '':
        return None
    if isinstance(cell_val, (int, float)):
        return Decimal(str(cell_val))
    if isinstance(cell_val, Decimal):
        return cell_val
    if isinstance(cell_val, str):
        cleaned = normalize_amount(cell_val)
        if not cleaned:
            return None
        try:
            return Decimal(cleaned)
        except Exception:
            return None
    return None


def parse_excel(
    content: bytes,
    date_format: str | None = None,
    flip_amount: bool = False,
    inflow_column: str | None = None,
    outflow_column: str | None = None,
) -> list[TransactionBase]:
    """Parse XLS or XLSX file content and return transactions."""
    rows = []
    datemode = 0
    
    if content.startswith(b'PK\x03\x04'):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = wb.active
        for r in sheet.iter_rows(values_only=True):
            rows.append(list(r))
    else:
        import xlrd
        wb = xlrd.open_workbook(file_contents=content)
        sheet = wb.sheet_by_index(0)
        datemode = wb.datemode
        for r_idx in range(sheet.nrows):
            rows.append(sheet.row_values(r_idx))

    def _strip_accents(s: str) -> str:
        import unicodedata
        nfkd = unicodedata.normalize('NFKD', s)
        return ''.join(c for c in nfkd if not unicodedata.combining(c))

    def _normalize_header(val) -> str:
        if val is None:
            return ""
        return _strip_accents(str(val).lower().strip())

    date_cols = ['date', 'data', 'dt', 'transaction_date', 'data_transacao']
    desc_cols = ['description', 'descricao', 'desc', 'memo', 'historico', 'lancamento', 'tipo']
    amount_cols = ['amount', 'valor', 'value', 'quantia', 'valor r$', 'valor_r$', 'valor(r$)', 'valor ($)']
    inflow_cols = ['inflow', 'credito', 'credito (r$)', 'credito(r$)', 'entradas', 'recebido']
    outflow_cols = ['outflow', 'debito', 'debito (r$)', 'debito(r$)', 'saidas', 'pago']
    type_cols = ['type', 'tipo', 'debito/credito', 'dc', 'd/c', 'natureza']
    currency_cols = ['currency', 'moeda', 'currency_code']
    fx_rate_cols = ['fx_rate', 'fx_rate_used', 'taxa_cambio', 'exchange_rate', 'taxa']
    external_id_cols = ['identificador', 'external_id', 'id', 'fitid']
    origem_cols = ['origem', 'remetente']
    destino_cols = ['destino', 'destinatario']

    header_idx = -1
    date_col_idx = -1
    desc_col_idx = -1
    amount_col_idx = -1
    inflow_col_idx = -1
    outflow_col_idx = -1
    type_col_idx = -1
    currency_col_idx = -1
    fx_rate_col_idx = -1
    external_id_col_idx = -1
    origem_col_idx = -1
    destino_col_idx = -1

    for idx, row in enumerate(rows):
        normalized_row = [_normalize_header(cell) for cell in row]
        def find_index(candidates):
            for c in candidates:
                if c in normalized_row:
                    return normalized_row.index(c)
            return -1

        d_idx = find_index(date_cols)
        desc_idx = find_index(desc_cols)
        if d_idx != -1 and desc_idx != -1:
            header_idx = idx
            date_col_idx = d_idx
            desc_col_idx = desc_idx
            if inflow_column:
                norm_in = _normalize_header(inflow_column)
                inflow_col_idx = normalized_row.index(norm_in) if norm_in in normalized_row else -1
            else:
                inflow_col_idx = find_index(inflow_cols)
            if outflow_column:
                norm_out = _normalize_header(outflow_column)
                outflow_col_idx = normalized_row.index(norm_out) if norm_out in normalized_row else -1
            else:
                outflow_col_idx = find_index(outflow_cols)
            amount_col_idx = find_index(amount_cols)
            type_col_idx = find_index(type_cols)
            currency_col_idx = find_index(currency_cols)
            fx_rate_col_idx = find_index(fx_rate_cols)
            external_id_col_idx = find_index(external_id_cols)
            origem_col_idx = find_index(origem_cols)
            destino_col_idx = find_index(destino_cols)
            break

    if header_idx == -1:
        raise ValueError("Could not detect Excel columns. Expected columns like: date, description, amount (or Portuguese equivalents: data, descricao, valor)")

    use_split = (inflow_col_idx != -1 and outflow_col_idx != -1)
    if not use_split and amount_col_idx == -1:
        raise ValueError("Could not detect amount column. Expected a column named: amount, valor, value, or separate credit/debit columns.")

    transactions = []
    for idx, row in enumerate(rows[header_idx + 1:]):
        if not any(cell is not None and cell != '' for cell in row):
            continue
        cell_date = row[date_col_idx]
        txn_date = parse_excel_date(cell_date, datemode)
        if not txn_date:
            continue
        desc = str(row[desc_col_idx]).strip() if row[desc_col_idx] is not None else ""
        if not desc or desc.lower() in ('total', 'saldo anterior', 'saldo atual', 'saldo'):
            continue

        origem_val = str(row[origem_col_idx]).strip() if origem_col_idx != -1 and row[origem_col_idx] is not None else ""
        destino_val = str(row[destino_col_idx]).strip() if destino_col_idx != -1 and row[destino_col_idx] is not None else ""

        if use_split:
            inflow_val = parse_excel_amount(row[inflow_col_idx])
            outflow_val = parse_excel_amount(row[outflow_col_idx])
            inflow = abs(inflow_val) if inflow_val is not None else Decimal('0')
            outflow = abs(outflow_val) if outflow_val is not None else Decimal('0')
            if inflow > 0:
                amount = inflow
                txn_type = "credit"
            elif outflow > 0:
                amount = outflow
                txn_type = "debit"
            else:
                continue
        else:
            amount_val = parse_excel_amount(row[amount_col_idx])
            if amount_val is None:
                continue
            if flip_amount:
                amount_val = -amount_val
            txn_type = "credit" if amount_val > 0 else "debit"
            amount = abs(amount_val)

        if type_col_idx != -1 and row[type_col_idx] is not None:
            t_val = str(row[type_col_idx]).strip().lower()
            if t_val in ('d', 'debit', 'debito', 'dbito'):
                txn_type = "debit"
            elif t_val in ('c', 'credit', 'credito', 'crdito'):
                txn_type = "credit"

        if txn_type == "debit" and destino_val:
            desc = f"{desc} - {destino_val}" if desc and desc != destino_val else destino_val
        elif txn_type == "credit" and origem_val:
            desc = f"{desc} - {origem_val}" if desc and desc != origem_val else origem_val

        txn_currency = str(row[currency_col_idx]).strip().upper() if currency_col_idx != -1 and row[currency_col_idx] else None
        txn_fx_rate = parse_excel_amount(row[fx_rate_col_idx]) if fx_rate_col_idx != -1 and row[fx_rate_col_idx] is not None else None
        txn_external_id = str(row[external_id_col_idx]).strip() if external_id_col_idx != -1 and row[external_id_col_idx] else None

        transactions.append(TransactionBase(
            description=desc,
            amount=amount,
            date=txn_date,
            type=txn_type,
            currency=txn_currency,
            fx_rate=txn_fx_rate,
            external_id=txn_external_id,
        ))
    return transactions
import re
import uuid
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy import func, select, extract, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.chart_account import ChartAccount
from app.models.category import Category
from app.models.category_group import CategoryGroup
from app.models.company import Company
from app.models.account import Account
from app.models.cost_center import CostCenter
from app.schemas.dre import (
    DREDrilldownResponse,
    DREResponse,
    DRERow,
    DRETotalSummary,
    DRETransactionItem,
)

MONTH_ABBRS = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
}


def _parse_code_to_tuple(code_str: Optional[str]) -> list:
    """Extrai partes numéricas de um código contábil para ordenação sequencial natural."""
    if not code_str:
        return [999999]
    parts = re.findall(r"\d+", str(code_str))
    if parts:
        return [int(p) for p in parts]
    return [999999]


def _get_effective_category_code(c_data: dict) -> Tuple[list, Optional[str]]:
    """Obtém ou infere o código numérico da categoria e sua tupla de ordenação."""
    code = c_data.get("code")
    label = c_data.get("label", "")
    if code:
        return _parse_code_to_tuple(code), str(code)

    # 1. Verifica se o próprio label começa com numeração, e.g. '5.3 Pessoal'
    match = re.match(r"^(\d+(?:\.\d+)*)", label.strip())
    if match:
        extracted = match.group(1)
        return _parse_code_to_tuple(extracted), extracted

    # 2. Inspeciona as contas analíticas filhas para derivar o código
    chart_codes = []
    for ca_data in c_data.get("chart_accounts", {}).values():
        ca_c = ca_data.get("code")
        if ca_c:
            t = _parse_code_to_tuple(ca_c)
            if t != [999999]:
                chart_codes.append((t, str(ca_c)))

    if chart_codes:
        chart_codes.sort(key=lambda x: x[0])
        min_tuple, min_str = chart_codes[0]
        # Se for código de 3 ou mais dígitos como '711', prefixo contábil é '7.1'
        if len(min_str) >= 2 and min_str[:2].isdigit():
            inferred = f"{min_str[0]}.{min_str[1]}"
            return _parse_code_to_tuple(inferred), inferred
        return min_tuple, min_str

    return [999999], None


def _classify_bucket(group_code: Optional[str], group_name: Optional[str], cat_code: Optional[str], cat_name: Optional[str], chart_code: Optional[str]) -> Optional[str]:
    """Classifica uma linha em um dos 5 buckets contábeis da DRE."""
    # Verificar código primeiro (prioritário)
    code = chart_code or cat_code or group_code or ""
    code = code.strip()
    
    if code:
        first_digit = code[0]
        if first_digit == "3":
            return "faturamento"
        elif first_digit == "4":
            return "custos_variaveis"
        elif first_digit == "5":
            return "despesas_fixas"
        elif first_digit == "6":
            return "investimentos"
        elif first_digit == "7":
            return "resultado_nao_op"
        elif first_digit in ("8", "9"):
            return None  # Transferências / Acertos

    # Classificação por nome se código não estiver presente ou for ambíguo
    g_name = (group_name or "").lower()
    c_name = (cat_name or "").lower()
    combined = f"{g_name} {c_name}"

    if any(k in combined for k in ["transferência", "transferencia", "acerto de caixa", "ajuste de saldo"]):
        return None

    if any(k in combined for k in ["não operacional", "nao operacional", "não operacionais", "nao operacionais"]):
        return "resultado_nao_op"

    if any(k in combined for k in ["investimento", "bens materiais", "desenvolvimento empresarial"]):
        return "investimentos"

    if any(k in combined for k in ["custos variáveis", "custo variável", "custos variaveis", "custo variavel", "fornecedores", "embalagens", "vidros planejados", "marmoraria", "comissões", "comissoes", "entregadores", "tributários"]):
        return "custos_variaveis"

    if any(k in combined for k in ["custos fixos", "custo fixo", "despesas fixas", "despesa fixa", "administrativa", "pessoal", "veículo", "veiculo", "materiais e equipamentos", "despesas financeiras"]):
        return "despesas_fixas"

    if any(k in combined for k in ["entrada", "venda", "faturamento", "receita"]):
        return "faturamento"

    return "despesas_fixas"  # Default seguro para saídas


async def get_dre_data(
    session: AsyncSession,
    company_id: uuid.UUID,
    year: int = 2026,
    regime: str = "competencia",
    cost_center_id: Optional[uuid.UUID] = None,
) -> DREResponse:
    # 1. Obter nome da empresa
    comp_result = await session.execute(select(Company.name).where(Company.id == company_id))
    company_name = comp_result.scalar_one_or_none() or "Empresa"

    # 2. Definir expressão de data
    if regime == "caixa":
        date_expr = Transaction.date
    else:
        date_expr = func.coalesce(Transaction.effective_date, Transaction.date)

    # 3. Montar meses do ano
    month_keys = [f"{year}-{m:02d}" for m in range(1, 13)]
    month_labels = {k: f"{MONTH_ABBRS[int(k.split('-')[1])]}/{year}" for k in month_keys}

    # 4. Consulta detalhada das transações agregadas
    # Suporta tanto vínculo por chart_account_id quanto direto por category_id
    cat_id_expr = func.coalesce(ChartAccount.category_id, Transaction.category_id)

    from sqlalchemy import literal_column
    month_col = literal_column("'YYYY-MM'")
    month_expr = func.to_char(date_expr, month_col).label("month_key")

    stmt = (
        select(
            CategoryGroup.id.label("group_id"),
            CategoryGroup.name.label("group_name"),
            CategoryGroup.code.label("group_code"),
            Category.id.label("cat_id"),
            Category.name.label("cat_name"),
            Category.code.label("cat_code"),
            ChartAccount.id.label("chart_id"),
            ChartAccount.name.label("chart_name"),
            ChartAccount.code.label("chart_code"),
            month_expr,
            func.sum(
                case(
                    (Transaction.type.in_(["debit", "expense"]), -Transaction.amount),
                    else_=Transaction.amount,
                )
            ).label("net_amount"),
        )
        .select_from(Transaction)
        .outerjoin(ChartAccount, Transaction.chart_account_id == ChartAccount.id)
        .outerjoin(Category, cat_id_expr == Category.id)
        .outerjoin(CategoryGroup, Category.group_id == CategoryGroup.id)
        .where(
            Transaction.company_id == company_id,
            func.extract("year", date_expr) == year,
            Transaction.status != "cancelled",
        )
    )

    if cost_center_id is not None:
        stmt = stmt.where(Transaction.cost_center_id == cost_center_id)

    stmt = stmt.group_by(
        CategoryGroup.id, CategoryGroup.name, CategoryGroup.code,
        Category.id, Category.name, Category.code,
        ChartAccount.id, ChartAccount.name, ChartAccount.code,
        func.to_char(date_expr, month_col),
    )


    result = await session.execute(stmt)
    rows = result.all()

    # 5. Estruturação dos dados por bucket -> group -> category -> chart_account
    # bucket_data: bucket -> { values: dict, categories: dict }
    BUCKET_CONFIG = [
        {"key": "faturamento", "label": "3 - Faturamento Bruto (+)", "code": "3"},
        {"key": "custos_variaveis", "label": "4 - Custos Variáveis Total (=) (-)", "code": "4"},
        {"key": "despesas_fixas", "label": "5 - Despesas Gerais Administrativas / Custos Fixos (-)", "code": "5"},
        {"key": "investimentos", "label": "6 - Investimentos (-)", "code": "6"},
        {"key": "resultado_nao_op", "label": "7 - Resultado Não Operacional (+) (-)", "code": "7"},
    ]

    # Estrutura em memória
    tree: Dict[str, dict] = {
        b["key"]: {
            "label": b["label"],
            "code": b["code"],
            "values": {m: 0.0 for m in month_keys},
            "total": 0.0,
            "categories": {},
        }
        for b in BUCKET_CONFIG
    }

    for row in rows:
        bucket = _classify_bucket(
            row.group_code, row.group_name,
            row.cat_code, row.cat_name,
            row.chart_code,
        )
        if not bucket or bucket not in tree:
            continue

        m_key = row.month_key
        if m_key not in month_keys:
            continue

        val = float(row.net_amount or 0.0)

        # Atualizar bucket
        tree[bucket]["values"][m_key] += val
        tree[bucket]["total"] += val

        # Categoria
        cat_name = row.cat_name or row.group_name or "Outros"
        cat_key = f"{bucket}__{cat_name}"
        if cat_name not in tree[bucket]["categories"]:
            tree[bucket]["categories"][cat_name] = {
                "label": cat_name,
                "code": row.cat_code,
                "key": cat_key,
                "values": {m: 0.0 for m in month_keys},
                "total": 0.0,
                "chart_accounts": {},
            }
        elif not tree[bucket]["categories"][cat_name]["code"] and row.cat_code:
            tree[bucket]["categories"][cat_name]["code"] = row.cat_code

        cat_entry = tree[bucket]["categories"][cat_name]
        cat_entry["values"][m_key] += val
        cat_entry["total"] += val

        # Conta Analítica (se houver)
        if row.chart_name:
            chart_name = row.chart_name
            chart_key = f"{cat_key}__{chart_name}"
            if chart_name not in cat_entry["chart_accounts"]:
                cat_entry["chart_accounts"][chart_name] = {
                    "label": chart_name,
                    "code": row.chart_code,
                    "key": chart_key,
                    "values": {m: 0.0 for m in month_keys},
                    "total": 0.0,
                }
            elif not cat_entry["chart_accounts"][chart_name]["code"] and row.chart_code:
                cat_entry["chart_accounts"][chart_name]["code"] = row.chart_code

            chart_entry = cat_entry["chart_accounts"][chart_name]
            chart_entry["values"][m_key] += val
            chart_entry["total"] += val

    # 6. Montar a lista final plana de DRERow com hierarquia e subtotais
    final_rows: List[DRERow] = []

    def make_values_dict(val_map: Dict[str, float], tot: float) -> Dict[str, float]:
        d = {m: round(val_map.get(m, 0.0), 2) for m in month_keys}
        d["total"] = round(tot, 2)
        return d

    def make_subtotal_row(key: str, label: str, val_map: Dict[str, float]) -> DRERow:
        tot = sum(val_map[m] for m in month_keys)
        return DRERow(
            key=key,
            label=label,
            level=-1,
            is_subtotal=True,
            bucket=key,
            values=make_values_dict(val_map, tot),
            child_keys=[],
        )

    # Buckets individuais
    fat = tree["faturamento"]
    custos = tree["custos_variaveis"]
    desp = tree["despesas_fixas"]
    invest = tree["investimentos"]
    res_nao_op = tree["resultado_nao_op"]

    # Mapas de valores dos subtotais
    margem_values = {m: fat["values"][m] + custos["values"][m] for m in month_keys}
    lucro_op_antes_values = {m: margem_values[m] + desp["values"][m] for m in month_keys}
    lucro_op_values = {m: lucro_op_antes_values[m] + invest["values"][m] for m in month_keys}
    lucro_liq_values = {m: lucro_op_values[m] + res_nao_op["values"][m] for m in month_keys}

    # Helper para adicionar um bucket e seus filhos
    def append_bucket_nodes(b_key: str):
        b_data = tree[b_key]
        cat_keys = []
        cat_rows_to_append = []

        # Preparar e inferir códigos das categorias se estiverem vazios
        for c_data in b_data["categories"].values():
            sort_tuple, eff_code = _get_effective_category_code(c_data)
            c_data["_sort_key"] = (sort_tuple, c_data.get("label", "").lower())
            if not c_data.get("code") and eff_code:
                c_data["code"] = eff_code

        # Ordenar categorias sequencialmente pelo código numérico
        sorted_categories = sorted(
            b_data["categories"].values(),
            key=lambda c: c["_sort_key"]
        )

        for c_data in sorted_categories:
            cat_keys.append(c_data["key"])
            ca_keys = []
            ca_rows = []

            # Ordenar contas analíticas sequencialmente pelo código numérico
            sorted_chart_accounts = sorted(
                c_data["chart_accounts"].values(),
                key=lambda ca: (_parse_code_to_tuple(ca.get("code")), ca.get("label", "").lower())
            )

            for ca_data in sorted_chart_accounts:
                ca_keys.append(ca_data["key"])
                ca_rows.append(
                    DRERow(
                        key=ca_data["key"],
                        label=ca_data["label"],
                        code=ca_data["code"],
                        level=2,
                        is_subtotal=False,
                        bucket=b_key,
                        values=make_values_dict(ca_data["values"], ca_data["total"]),
                        child_keys=[],
                    )
                )

            cat_rows_to_append.append(
                DRERow(
                    key=c_data["key"],
                    label=c_data["label"],
                    code=c_data["code"],
                    level=1,
                    is_subtotal=False,
                    bucket=b_key,
                    values=make_values_dict(c_data["values"], c_data["total"]),
                    child_keys=ca_keys,
                )
            )
            cat_rows_to_append.extend(ca_rows)

        # Bucket Root (Level 0)
        final_rows.append(
            DRERow(
                key=b_key,
                label=b_data["label"],
                code=b_data["code"],
                level=0,
                is_subtotal=False,
                bucket=b_key,
                values=make_values_dict(b_data["values"], b_data["total"]),
                child_keys=cat_keys,
            )
        )
        final_rows.extend(cat_rows_to_append)

    # 1. Faturamento
    append_bucket_nodes("faturamento")

    # 2. Custos Variáveis
    append_bucket_nodes("custos_variaveis")

    # (=) Margem de Contribuição
    final_rows.append(make_subtotal_row("margem_contribuicao", "Margem de Contribuição (=)", margem_values))

    # 3. Despesas Fixas
    append_bucket_nodes("despesas_fixas")

    # (=) Lucro Operacional Antes dos Investimentos
    final_rows.append(make_subtotal_row("lucro_op_antes", "Lucro Oper. Antes Invest. (=)", lucro_op_antes_values))

    # 4. Investimentos
    append_bucket_nodes("investimentos")

    # (=) Lucro Operacional (EBITDA)
    final_rows.append(make_subtotal_row("lucro_operacional", "Lucro Operacional (=)", lucro_op_values))

    # 5. Resultado Não Operacional
    append_bucket_nodes("resultado_nao_op")

    # (=) Lucro Líquido do Exercício
    final_rows.append(make_subtotal_row("lucro_liquido", "Lucro Líquido (=)", lucro_liq_values))

    totals_summary = DRETotalSummary(
        faturamento=round(fat["total"], 2),
        custos_variaveis=round(custos["total"], 2),
        margem_contribuicao=round(sum(margem_values.values()), 2),
        despesas_fixas=round(desp["total"], 2),
        lucro_operacional_antes_invest=round(sum(lucro_op_antes_values.values()), 2),
        investimentos=round(invest["total"], 2),
        lucro_operacional=round(sum(lucro_op_values.values()), 2),
        resultado_nao_operacional=round(res_nao_op["total"], 2),
        lucro_liquido=round(sum(lucro_liq_values.values()), 2),
    )

    return DREResponse(
        company_id=company_id,
        company_name=company_name,
        year=year,
        regime=regime,
        months=month_keys,
        month_labels=month_labels,
        rows=final_rows,
        totals=totals_summary,
    )


async def get_dre_drilldown(
    session: AsyncSession,
    company_id: uuid.UUID,
    year: int,
    row_key: str,
    month: Optional[int] = None,
    regime: str = "caixa",
    cost_center_id: Optional[uuid.UUID] = None,
) -> DREDrilldownResponse:
    """Busca os lançamentos individuais de uma célula da DRE para auditoria/drilldown."""
    # 1. Definir expressão de data
    if regime == "caixa":
        date_expr = Transaction.date
    else:
        date_expr = func.coalesce(Transaction.effective_date, Transaction.date)

    cat_id_expr = func.coalesce(ChartAccount.category_id, Transaction.category_id)

    # 2. Interpretar row_key
    parts = row_key.split("__")
    bucket = parts[0]
    cat_name = parts[1] if len(parts) > 1 else None
    chart_name = parts[2] if len(parts) > 2 else None

    # Determinar nível e título
    if chart_name:
        level = 2
        title = chart_name
    elif cat_name:
        level = 1
        title = cat_name
    else:
        level = 0
        bucket_labels = {
            "faturamento": "Faturamento Bruto",
            "custos_variaveis": "Custos Variáveis",
            "despesas_fixas": "Despesas Gerais Administrativas / Custos Fixos",
            "investimentos": "Investimentos",
            "resultado_nao_op": "Resultado Não Operacional",
        }
        title = bucket_labels.get(bucket, bucket)

    # 3. Montar query detalhada
    stmt = (
        select(
            Transaction.id,
            date_expr.label("date"),
            Transaction.description,
            Transaction.amount,
            Transaction.type,
            Transaction.status,
            Transaction.payee,
            Transaction.notes,
            Account.name.label("account_name"),
            Category.name.label("category_name"),
            Category.code.label("category_code"),
            CategoryGroup.name.label("group_name"),
            CategoryGroup.code.label("group_code"),
            ChartAccount.name.label("chart_name"),
            ChartAccount.code.label("chart_code"),
            CostCenter.name.label("cost_center_name"),
            case(
                (Transaction.type.in_(["debit", "expense"]), -Transaction.amount),
                else_=Transaction.amount,
            ).label("net_amount"),
        )
        .select_from(Transaction)
        .outerjoin(Account, Transaction.account_id == Account.id)
        .outerjoin(ChartAccount, Transaction.chart_account_id == ChartAccount.id)
        .outerjoin(Category, cat_id_expr == Category.id)
        .outerjoin(CategoryGroup, Category.group_id == CategoryGroup.id)
        .outerjoin(CostCenter, Transaction.cost_center_id == CostCenter.id)
        .where(
            Transaction.company_id == company_id,
            func.extract("year", date_expr) == year,
            Transaction.status != "cancelled",
        )
    )

    if month is not None:
        stmt = stmt.where(func.extract("month", date_expr) == month)

    if cost_center_id is not None:
        stmt = stmt.where(Transaction.cost_center_id == cost_center_id)

    # Filtrar por entidade
    if chart_name:
        stmt = stmt.where(ChartAccount.name == chart_name)
        if cat_name and cat_name != "Outros":
            stmt = stmt.where(func.coalesce(Category.name, CategoryGroup.name) == cat_name)
    elif cat_name:
        if cat_name == "Outros":
            stmt = stmt.where(Category.name.is_(None))
        else:
            stmt = stmt.where(func.coalesce(Category.name, CategoryGroup.name) == cat_name)

    stmt = stmt.order_by(date_expr.desc(), Transaction.id)

    result = await session.execute(stmt)
    raw_rows = result.all()

    # Se for level 0, filtra pelo bucket
    if level == 0:
        raw_rows = [
            r for r in raw_rows
            if _classify_bucket(r.group_code, r.group_name, r.category_code, r.category_name, r.chart_code) == bucket
        ]

    items: List[DRETransactionItem] = []
    total_amount = 0.0
    found_code = None

    for r in raw_rows:
        val = float(r.net_amount or 0.0)
        total_amount += val
        if level == 2 and r.chart_code and not found_code:
            found_code = r.chart_code
        elif level == 1 and r.category_code and not found_code:
            found_code = r.category_code

        items.append(
            DRETransactionItem(
                id=r.id,
                date=r.date.isoformat() if hasattr(r.date, "isoformat") else str(r.date),
                description=r.description or "Sem descrição",
                amount=float(r.amount or 0.0),
                type=r.type or "expense",
                status=r.status or "posted",
                payee=r.payee,
                account_name=r.account_name,
                category_name=r.category_name or r.group_name,
                category_code=r.category_code,
                chart_name=r.chart_name,
                chart_code=r.chart_code,
                cost_center_name=r.cost_center_name,
                net_amount=round(val, 2),
                notes=r.notes,
            )
        )

    month_label = f"{MONTH_ABBRS[month]}/{year}" if month and month in MONTH_ABBRS else (f"{year}" if not month else str(month))

    return DREDrilldownResponse(
        row_key=row_key,
        title=title,
        code=found_code,
        level=level,
        year=year,
        month=month,
        month_label=month_label,
        regime=regime,
        total_amount=round(total_amount, 2),
        total_count=len(items),
        items=items,
    )


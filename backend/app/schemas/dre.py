import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel


class DRERow(BaseModel):
    key: str
    label: str
    code: Optional[str] = None
    level: int  # 0: Grupo Macro, 1: Categoria, 2: Conta Analítica, -1: Subtotal
    is_subtotal: bool = False
    bucket: str  # faturamento, custos_variaveis, margem_contribuicao, despesas_fixas, lucro_op_antes, investimentos, lucro_operacional, resultado_nao_op, lucro_liquido
    values: Dict[str, float]  # {"2026-01": 1500.0, ..., "total": 1500.0}
    child_keys: List[str] = []


class DRETotalSummary(BaseModel):
    faturamento: float = 0.0
    custos_variaveis: float = 0.0
    margem_contribuicao: float = 0.0
    despesas_fixas: float = 0.0
    lucro_operacional_antes_invest: float = 0.0
    investimentos: float = 0.0
    lucro_operacional: float = 0.0
    resultado_nao_operacional: float = 0.0
    lucro_liquido: float = 0.0


class DREResponse(BaseModel):
    company_id: uuid.UUID
    company_name: str
    year: int
    regime: str  # "competencia" | "caixa"
    months: List[str]  # ["2026-01", "2026-02", ...]
    month_labels: Dict[str, str]  # {"2026-01": "jan/2026", ...}
    rows: List[DRERow]
    totals: DRETotalSummary


class DRETransactionItem(BaseModel):
    id: uuid.UUID
    date: str
    description: str
    amount: float
    type: str
    status: str
    payee: Optional[str] = None
    account_name: Optional[str] = None
    category_name: Optional[str] = None
    category_code: Optional[str] = None
    chart_name: Optional[str] = None
    chart_code: Optional[str] = None
    cost_center_name: Optional[str] = None
    net_amount: float
    notes: Optional[str] = None


class DREDrilldownResponse(BaseModel):
    row_key: str
    title: str
    code: Optional[str] = None
    level: int = 1
    year: int
    month: Optional[int] = None
    month_label: Optional[str] = None
    regime: str
    total_amount: float
    total_count: int
    items: List[DRETransactionItem]

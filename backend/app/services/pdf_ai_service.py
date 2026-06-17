import json
import logging
from io import BytesIO
from pypdf import PdfReader
from google import genai
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class TransactionParsed(BaseModel):
    date: str = Field(description="Transaction date in YYYY-MM-DD format")
    description: str = Field(description="Description of the transaction")
    amount: float = Field(description="Amount of the transaction. Use negative for expenses/debits and positive for payments/credits.")


class InvoiceParsed(BaseModel):
    transactions: list[TransactionParsed]


def extract_text_from_pdf(content: bytes) -> str:
    """Extract text from a PDF file using pypdf."""
    reader = PdfReader(BytesIO(content))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text


def parse_pdf_invoice_with_gemini(pdf_content: bytes, api_key: str) -> list[dict]:
    """
    Extracts text from a PDF and uses Gemini to parse transactions.
    Returns a list of dicts: [{"date": "...", "description": "...", "amount": ...}]
    """
    text = extract_text_from_pdf(pdf_content)
    
    if not text.strip():
        raise ValueError("No text could be extracted from the PDF.")
        
    client = genai.Client(api_key=api_key)
    
    prompt = f"""
    Abaixo está o texto extraído de uma fatura de cartão de crédito.
    Por favor, encontre a tabela de lançamentos e extraia todas as transações individuais.
    Ignore o cabeçalho, avisos, totais, propagandas, e saldo anterior/atual.
    Retorne as transações formatadas estritamente de acordo com o JSON schema fornecido.
    A data (date) deve estar obrigatoriamente no formato YYYY-MM-DD. Se o ano não for explícito na compra, infira pelo contexto da fatura ou use o ano corrente.
    O valor (amount) deve ser float: use valor negativo para compras (despesas/débitos) e valor positivo para pagamentos de fatura ou estornos (créditos).
    
    Texto da fatura:
    {text}
    """
    
    logger.info("Sending invoice text to Gemini for parsing.")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config={
            'response_mime_type': 'application/json',
            'response_schema': list[TransactionParsed],
        },
    )
    
    try:
        data = json.loads(response.text)
        logger.info(f"Successfully parsed {len(data)} transactions via Gemini.")
        return data
    except Exception as e:
        logger.error(f"Failed to parse Gemini response: {response.text}", exc_info=True)
        raise ValueError("Ocorreu um erro ao interpretar a resposta da IA.")

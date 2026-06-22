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
    
    prompt = f"""
    Abaixo está o texto extraído de uma fatura de cartão de crédito.
    1. Identifique a **data de vencimento** (due date) da fatura no texto.
    2. Encontre a tabela de lançamentos e extraia todas as transações individuais.
    3. A data (`date`) de **todas** as transações extraídas deve ser obrigatoriamente a **data de vencimento** da fatura, no formato YYYY-MM-DD (ou seja, todas as transações no JSON de retorno devem ter exatamente a mesma data correspondente ao vencimento da fatura).
    4. Ignore o cabeçalho, avisos, totais, propagandas, e saldo anterior/atual.
    5. Retorne as transações formatadas estritamente de acordo com o JSON schema fornecido.
    6. O valor (amount) deve ser float: use valor negativo para compras (despesas/débitos) e valor positivo para pagamentos de fatura ou estornos (créditos).
    
    Texto da fatura:
    {text}
    """
    
    if api_key.startswith("sk-or-"):
        import httpx
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/scoretecnologia/score-finance",
            "X-Title": "Score Finance",
        }
        
        payload = {
            "model": "google/gemini-2.5-flash",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "InvoiceParsed",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "transactions": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "date": {"type": "string", "description": "Transaction date in YYYY-MM-DD format"},
                                        "description": {"type": "string", "description": "Description of the transaction"},
                                        "amount": {"type": "number", "description": "Amount of the transaction. Use negative for expenses/debits and positive for payments/credits."}
                                    },
                                    "required": ["date", "description", "amount"],
                                    "additionalProperties": False
                                }
                            }
                        },
                        "required": ["transactions"],
                        "additionalProperties": False
                    }
                }
            }
        }
        
        logger.info("Sending invoice text to OpenRouter (Gemini) for parsing.")
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60.0
        )
        
        response.raise_for_status()
        res_json = response.json()
        
        try:
            choice_content = res_json["choices"][0]["message"]["content"]
            data = json.loads(choice_content)
            transactions = data.get("transactions", [])
            logger.info(f"Successfully parsed {len(transactions)} transactions via OpenRouter.")
            return transactions
        except Exception as e:
            logger.error(f"Failed to parse OpenRouter response: {response.text}", exc_info=True)
            raise ValueError("Ocorreu um erro ao interpretar a resposta da IA.")
            
    client = genai.Client(api_key=api_key)
    
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

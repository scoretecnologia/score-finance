import os
from google import genai
from pydantic import BaseModel, Field

class TransactionParsed(BaseModel):
    date: str = Field(description="Transaction date in YYYY-MM-DD format")
    description: str = Field(description="Description of the transaction")
    amount: float = Field(description="Amount of the transaction")

client = genai.Client(api_key="DUMMY_KEY_JUST_TO_CHECK_MODEL_NAME_ERROR")
try:
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents="hello",
        config={
            'response_mime_type': 'application/json',
            'response_schema': list[TransactionParsed],
        },
    )
    print("Success")
except Exception as e:
    print(repr(e))

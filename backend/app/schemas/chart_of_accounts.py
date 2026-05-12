from typing import Optional

from pydantic import BaseModel


class ChartOfAccountsRow(BaseModel):
    code: Optional[str] = None
    group_name: Optional[str] = None
    category_name: str
    account_name: str


class ChartOfAccountsImportRequest(BaseModel):
    rows: list[ChartOfAccountsRow]
    skip_duplicates: bool = True


class ChartOfAccountsImportResult(BaseModel):
    imported_groups: int
    imported_categories: int
    imported_accounts: int
    skipped_accounts: int

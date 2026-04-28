from typing import Optional

from pydantic import BaseModel


class ChartOfAccountsRow(BaseModel):
    group_name: Optional[str] = None
    group_icon: Optional[str] = None
    group_color: Optional[str] = None

    category_name: str
    category_icon: Optional[str] = None
    category_color: Optional[str] = None

    account_name: str
    account_icon: Optional[str] = None
    account_color: Optional[str] = None


class ChartOfAccountsImportRequest(BaseModel):
    rows: list[ChartOfAccountsRow]
    skip_duplicates: bool = True


class ChartOfAccountsImportResult(BaseModel):
    imported_groups: int
    imported_categories: int
    imported_accounts: int
    skipped_accounts: int

"""Ordenação natural de códigos contábeis.

Códigos de plano de contas são armazenados como texto, mas devem ser
ordenados numericamente por segmento: ``551 < 552 < 559 < 5511`` e
``5.9 < 5.10``. A ordenação textual do banco colocaria ``5511`` logo
depois de ``551``, o que quebra a sequência esperada pelo cliente.
"""
import re
from typing import Iterable, Optional, TypeVar

_DIGITS = re.compile(r"\d+")

T = TypeVar("T")


def code_sort_key(code: Optional[str], name: Optional[str] = None) -> tuple:
    """Chave de ordenação: segmentos numéricos do código, depois código e nome.

    Itens sem código (ou sem nenhum dígito) vão para o final, ordenados por nome.
    """
    code_str = (code or "").strip()
    parts = [int(p) for p in _DIGITS.findall(code_str)]
    has_code = 0 if parts else 1
    return (has_code, parts, code_str.lower(), (name or "").lower())


def sort_by_code(items: Iterable[T]) -> list[T]:
    """Retorna uma nova lista ordenada pelos atributos ``code`` e ``name``."""
    return sorted(items, key=lambda i: code_sort_key(getattr(i, "code", None), getattr(i, "name", None)))


def sort_in_place_by_code(items: list) -> None:
    """Ordena uma lista (inclusive coleções ORM) sem substituí-la."""
    items.sort(key=lambda i: code_sort_key(getattr(i, "code", None), getattr(i, "name", None)))

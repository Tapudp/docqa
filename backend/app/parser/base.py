from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ParseResult:
    total_pages: int
    page_texts: list[str]          # one entry per page, 0-indexed
    failed_pages: list[int] = field(default_factory=list)  # 1-indexed page numbers


class DocumentParser(ABC):
    @abstractmethod
    async def parse(self, data: bytes, mime_type: str) -> ParseResult: ...

    @abstractmethod
    def supports(self, mime_type: str) -> bool: ...

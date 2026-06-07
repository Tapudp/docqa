from app.parser.base import DocumentParser, ParseResult
from app.parser.pypdf_parser import PyPDFParser


class FallbackParser(DocumentParser):
    """Handles non-PDF formats until dedicated parsers are added in later phases."""

    def supports(self, mime_type: str) -> bool:
        return True

    async def parse(self, data: bytes, mime_type: str) -> ParseResult:
        return ParseResult(total_pages=1, page_texts=[""], failed_pages=[])


_PARSERS: list[DocumentParser] = [
    PyPDFParser(),
    FallbackParser(),
]


def get_parser(mime_type: str) -> DocumentParser:
    for parser in _PARSERS:
        if parser.supports(mime_type):
            return parser
    return FallbackParser()

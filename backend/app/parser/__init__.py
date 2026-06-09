from app.parser.base import DocumentParser, ParseResult
from app.parser.pypdf_parser import PyPDFParser
from app.parser.docx_parser import DocxParser
from app.parser.xlsx_parser import XlsxParser
from app.parser.pptx_parser import PptxParser


class FallbackParser(DocumentParser):
    def supports(self, mime_type: str) -> bool:
        return True

    async def parse(self, data: bytes, mime_type: str) -> ParseResult:
        return ParseResult(total_pages=1, page_texts=["[No text could be extracted from this file type]"], failed_pages=[])


_PARSERS: list[DocumentParser] = [
    PyPDFParser(),
    DocxParser(),
    XlsxParser(),
    PptxParser(),
    FallbackParser(),
]


def get_parser(mime_type: str) -> DocumentParser:
    for parser in _PARSERS:
        if parser.supports(mime_type):
            return parser
    return FallbackParser()

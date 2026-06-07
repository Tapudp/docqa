import io

from app.parser.base import DocumentParser, ParseResult


class PyPDFParser(DocumentParser):
    def supports(self, mime_type: str) -> bool:
        return mime_type == "application/pdf"

    async def parse(self, data: bytes, mime_type: str) -> ParseResult:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        total_pages = len(reader.pages)
        page_texts: list[str] = []
        failed_pages: list[int] = []

        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
                page_texts.append(text)
            except Exception:
                page_texts.append("")
                failed_pages.append(i + 1)  # 1-indexed

        return ParseResult(
            total_pages=total_pages,
            page_texts=page_texts,
            failed_pages=failed_pages,
        )

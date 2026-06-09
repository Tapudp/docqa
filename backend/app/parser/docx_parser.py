import io

from app.parser.base import DocumentParser, ParseResult

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PAGE_BREAK_XML = "w:lastRenderedPageBreak"
_CHARS_PER_PAGE = 2500


class DocxParser(DocumentParser):
    def supports(self, mime_type: str) -> bool:
        return mime_type == _DOCX_MIME

    async def parse(self, data: bytes, mime_type: str) -> ParseResult:
        from docx import Document
        from docx.oxml.ns import qn

        doc = Document(io.BytesIO(data))
        pages: list[str] = []
        current: list[str] = []
        current_len = 0

        for para in doc.paragraphs:
            # Detect explicit page breaks in the XML
            has_break = para._element.find(f".//{qn('w:br')}[@{qn('w:type')}='page']") is not None

            text = para.text
            if text:
                current.append(text)
                current_len += len(text)

            if has_break or current_len >= _CHARS_PER_PAGE:
                pages.append("\n".join(current))
                current = []
                current_len = 0

        if current:
            pages.append("\n".join(current))

        if not pages:
            pages = [""]

        return ParseResult(total_pages=len(pages), page_texts=pages, failed_pages=[])

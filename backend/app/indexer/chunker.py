from dataclasses import dataclass


@dataclass
class TextChunk:
    text: str
    page_numbers: list[int]
    chunk_index: int


def chunk_document(
    page_texts: list[str],
    chunk_size: int = 1500,
    overlap: int = 300,
) -> list[TextChunk]:
    """
    Slide a window over the full document text while tracking which page
    each character came from.  Chunks break at natural boundaries
    (double-newline > newline > sentence > word) when possible.
    """
    if not page_texts:
        return []

    # Build concatenated text and a parallel page-number map
    full_text = ""
    char_page: list[int] = []
    for page_num, text in enumerate(page_texts, start=1):
        full_text += text + "\n"
        char_page.extend([page_num] * (len(text) + 1))

    chunks: list[TextChunk] = []
    start = 0
    total = len(full_text)

    while start < total:
        end = min(start + chunk_size, total)

        # Try to land on a natural boundary
        if end < total:
            for sep in ("\n\n", "\n", ". ", " "):
                idx = full_text.rfind(sep, start + chunk_size // 2, end)
                if idx != -1:
                    end = idx + len(sep)
                    break

        chunk_text = full_text[start:end].strip()
        if chunk_text:
            pages = sorted(set(char_page[start:min(end, len(char_page) - 1)]))
            chunks.append(TextChunk(
                text=chunk_text,
                page_numbers=pages,
                chunk_index=len(chunks),
            ))

        start = end - overlap
        if start >= total - overlap:
            break

    return chunks

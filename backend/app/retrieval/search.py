from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.indexer.embedder import embed_texts


@dataclass
class SearchResult:
    chunk_id: str
    document_id: str
    filename: str
    chunk_index: int
    text: str
    page_numbers: list[int]
    score: float


async def hybrid_search(
    db: AsyncSession,
    workspace_id: UUID,
    query: str,
    top_k: int = 6,
) -> list[SearchResult]:
    query_vec = embed_texts([query])[0]
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"

    # Vector similarity (cosine) + PostgreSQL full-text search combined via RRF
    sql = text("""
        WITH vector_hits AS (
            SELECT
                c.id,
                c.document_id,
                d.filename,
                c.chunk_index,
                c.text,
                c.page_numbers,
                ROW_NUMBER() OVER (ORDER BY c.embedding <=> CAST(:vec AS vector)) AS rn
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.workspace_id = :ws_id
              AND d.status = 'ready'
            ORDER BY c.embedding <=> CAST(:vec AS vector)
            LIMIT :k
        ),
        fts_hits AS (
            SELECT
                c.id,
                c.document_id,
                d.filename,
                c.chunk_index,
                c.text,
                c.page_numbers,
                ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', :q)) DESC) AS rn
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.workspace_id = :ws_id
              AND d.status = 'ready'
              AND to_tsvector('english', c.text) @@ plainto_tsquery('english', :q)
            ORDER BY ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', :q)) DESC
            LIMIT :k
        ),
        combined AS (
            SELECT
                COALESCE(v.id, f.id) AS id,
                COALESCE(v.document_id, f.document_id) AS document_id,
                COALESCE(v.filename, f.filename) AS filename,
                COALESCE(v.chunk_index, f.chunk_index) AS chunk_index,
                COALESCE(v.text, f.text) AS text,
                COALESCE(v.page_numbers, f.page_numbers) AS page_numbers,
                (COALESCE(1.0 / (60 + v.rn), 0) + COALESCE(1.0 / (60 + f.rn), 0)) AS rrf_score
            FROM vector_hits v
            FULL OUTER JOIN fts_hits f ON f.id = v.id
        )
        SELECT * FROM combined ORDER BY rrf_score DESC LIMIT :k
    """)

    rows = await db.execute(sql, {"vec": vec_literal, "ws_id": workspace_id, "q": query, "k": top_k})
    results = []
    for row in rows.mappings():
        results.append(SearchResult(
            chunk_id=str(row["id"]),
            document_id=str(row["document_id"]),
            filename=row["filename"],
            chunk_index=row["chunk_index"],
            text=row["text"],
            page_numbers=row["page_numbers"] or [],
            score=float(row["rrf_score"]),
        ))
    return results

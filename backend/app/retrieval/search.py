import asyncio
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
    top_k: int = 15,
    inner_k_multiplier: int = 5,
) -> list[SearchResult]:
    loop = asyncio.get_running_loop()
    query_vec = await loop.run_in_executor(None, lambda: embed_texts([query])[0])
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"

    # Cast a wider net before RRF so deep-document content isn't missed.
    # inner_k is how many candidates each sub-query contributes; final output is top_k.
    inner_k = max(top_k * inner_k_multiplier, 50)

    # Vector similarity (cosine) + PostgreSQL full-text search combined via RRF.
    # FTS uses websearch_to_tsquery which handles numbers and partial phrases better
    # than plainto_tsquery, and uses OR across tokens so "161" matches even without
    # "rule" in the same chunk.
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
            LIMIT :inner_k
        ),
        fts_hits AS (
            SELECT
                c.id,
                c.document_id,
                d.filename,
                c.chunk_index,
                c.text,
                c.page_numbers,
                ROW_NUMBER() OVER (
                    ORDER BY ts_rank(
                        to_tsvector('english', c.text),
                        websearch_to_tsquery('english', :q)
                    ) DESC
                ) AS rn
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.workspace_id = :ws_id
              AND d.status = 'ready'
              AND to_tsvector('english', c.text) @@ websearch_to_tsquery('english', :q)
            ORDER BY ts_rank(
                to_tsvector('english', c.text),
                websearch_to_tsquery('english', :q)
            ) DESC
            LIMIT :inner_k
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
        SELECT * FROM combined ORDER BY rrf_score DESC LIMIT :top_k
    """)

    rows = await db.execute(sql, {
        "vec": vec_literal,
        "ws_id": workspace_id,
        "q": query,
        "inner_k": inner_k,
        "top_k": top_k,
    })
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

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


def _diversify(pool: list[SearchResult], top_k: int, min_per_doc: int = 2) -> list[SearchResult]:
    """
    Guarantee each document that appears in `pool` gets at least `min_per_doc`
    slots in the final output, then fill remaining slots by global score order.

    This prevents a single high-scoring document from monopolising all top_k
    results when the workspace contains multiple documents.
    """
    by_doc: dict[str, list[SearchResult]] = {}
    for r in pool:
        by_doc.setdefault(r.document_id, []).append(r)

    # Guaranteed: best min_per_doc from every document (already sorted by score)
    guaranteed: list[SearchResult] = []
    guaranteed_ids: set[str] = set()
    for doc_chunks in by_doc.values():
        for r in doc_chunks[:min_per_doc]:
            guaranteed.append(r)
            guaranteed_ids.add(r.chunk_id)

    # Fill remaining budget with global best, skipping already-guaranteed chunks
    remaining_budget = max(0, top_k - len(guaranteed))
    extras = [r for r in pool if r.chunk_id not in guaranteed_ids][:remaining_budget]

    final = guaranteed + extras
    final.sort(key=lambda r: r.score, reverse=True)
    return final[:top_k]


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

    inner_k = max(top_k * inner_k_multiplier, 50)
    # Fetch a larger pool so diversification has material to work with
    combined_k = top_k * 3

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
        SELECT * FROM combined ORDER BY rrf_score DESC LIMIT :combined_k
    """)

    rows = await db.execute(sql, {
        "vec": vec_literal,
        "ws_id": workspace_id,
        "q": query,
        "inner_k": inner_k,
        "combined_k": combined_k,
    })
    pool = []
    for row in rows.mappings():
        pool.append(SearchResult(
            chunk_id=str(row["id"]),
            document_id=str(row["document_id"]),
            filename=row["filename"],
            chunk_index=row["chunk_index"],
            text=row["text"],
            page_numbers=row["page_numbers"] or [],
            score=float(row["rrf_score"]),
        ))

    return _diversify(pool, top_k)

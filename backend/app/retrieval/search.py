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


# ── Shared SQL templates ──────────────────────────────────────

# Global search: all ready docs in workspace, ranked by hybrid RRF
_GLOBAL_SQL = text("""
    WITH vector_hits AS (
        SELECT c.id, c.document_id, d.filename, c.chunk_index, c.text, c.page_numbers,
               ROW_NUMBER() OVER (ORDER BY c.embedding <=> CAST(:vec AS vector)) AS rn
        FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = :ws_id AND d.status = 'ready'
        ORDER BY c.embedding <=> CAST(:vec AS vector)
        LIMIT :inner_k
    ),
    fts_hits AS (
        SELECT c.id, c.document_id, d.filename, c.chunk_index, c.text, c.page_numbers,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank(to_tsvector('english', c.text), websearch_to_tsquery('english', :q)) DESC
               ) AS rn
        FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = :ws_id AND d.status = 'ready'
          AND to_tsvector('english', c.text) @@ websearch_to_tsquery('english', :q)
        ORDER BY ts_rank(to_tsvector('english', c.text), websearch_to_tsquery('english', :q)) DESC
        LIMIT :inner_k
    ),
    combined AS (
        SELECT COALESCE(v.id, f.id) AS id,
               COALESCE(v.document_id, f.document_id) AS document_id,
               COALESCE(v.filename, f.filename) AS filename,
               COALESCE(v.chunk_index, f.chunk_index) AS chunk_index,
               COALESCE(v.text, f.text) AS text,
               COALESCE(v.page_numbers, f.page_numbers) AS page_numbers,
               (COALESCE(1.0 / (60 + v.rn), 0) + COALESCE(1.0 / (60 + f.rn), 0)) AS rrf_score
        FROM vector_hits v FULL OUTER JOIN fts_hits f ON f.id = v.id
    )
    SELECT * FROM combined ORDER BY rrf_score DESC LIMIT :limit_k
""")

# Per-document search: same RRF but scoped to a single document_id
_PER_DOC_SQL = text("""
    WITH vector_hits AS (
        SELECT c.id, c.document_id, d.filename, c.chunk_index, c.text, c.page_numbers,
               ROW_NUMBER() OVER (ORDER BY c.embedding <=> CAST(:vec AS vector)) AS rn
        FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = :ws_id AND c.document_id = :doc_id AND d.status = 'ready'
        ORDER BY c.embedding <=> CAST(:vec AS vector)
        LIMIT :inner_k
    ),
    fts_hits AS (
        SELECT c.id, c.document_id, d.filename, c.chunk_index, c.text, c.page_numbers,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank(to_tsvector('english', c.text), websearch_to_tsquery('english', :q)) DESC
               ) AS rn
        FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = :ws_id AND c.document_id = :doc_id AND d.status = 'ready'
          AND to_tsvector('english', c.text) @@ websearch_to_tsquery('english', :q)
        ORDER BY ts_rank(to_tsvector('english', c.text), websearch_to_tsquery('english', :q)) DESC
        LIMIT :inner_k
    ),
    combined AS (
        SELECT COALESCE(v.id, f.id) AS id,
               COALESCE(v.document_id, f.document_id) AS document_id,
               COALESCE(v.filename, f.filename) AS filename,
               COALESCE(v.chunk_index, f.chunk_index) AS chunk_index,
               COALESCE(v.text, f.text) AS text,
               COALESCE(v.page_numbers, f.page_numbers) AS page_numbers,
               (COALESCE(1.0 / (60 + v.rn), 0) + COALESCE(1.0 / (60 + f.rn), 0)) AS rrf_score
        FROM vector_hits v FULL OUTER JOIN fts_hits f ON f.id = v.id
    )
    SELECT * FROM combined ORDER BY rrf_score DESC LIMIT :limit_k
""")


# ── Helpers ───────────────────────────────────────────────────

def _rows_to_results(rows) -> list[SearchResult]:
    return [
        SearchResult(
            chunk_id=str(row["id"]),
            document_id=str(row["document_id"]),
            filename=row["filename"],
            chunk_index=row["chunk_index"],
            text=row["text"],
            page_numbers=row["page_numbers"] or [],
            score=float(row["rrf_score"]),
        )
        for row in rows.mappings()
    ]


async def _fetch_ready_doc_ids(db: AsyncSession, workspace_id: UUID) -> list[UUID]:
    result = await db.execute(
        text("SELECT id FROM documents WHERE workspace_id = :ws_id AND status = 'ready' ORDER BY created_at"),
        {"ws_id": workspace_id},
    )
    return [row[0] for row in result]


async def _search_single_doc(
    db: AsyncSession,
    workspace_id: UUID,
    doc_id: UUID,
    vec_literal: str,
    query: str,
    per_doc_k: int,
    inner_k: int,
) -> list[SearchResult]:
    rows = await db.execute(_PER_DOC_SQL, {
        "vec": vec_literal,
        "ws_id": workspace_id,
        "doc_id": doc_id,
        "q": query,
        "inner_k": inner_k,
        "limit_k": per_doc_k,
    })
    return _rows_to_results(rows)


# ── Main entry point ──────────────────────────────────────────

async def hybrid_search(
    db: AsyncSession,
    workspace_id: UUID,
    query: str,
    top_k: int = 15,
    inner_k_multiplier: int = 5,
) -> list[SearchResult]:
    """
    Multi-document hybrid search using per-document isolated retrieval.

    Problem solved: in a global ranking, one large/high-scoring document can fill
    all top_k slots, leaving smaller or equally relevant documents invisible.

    Strategy (SPD-RAG pattern):
    1. Fetch all ready document IDs in the workspace.
    2. Run per-document hybrid RRF searches in parallel — each document gets its own
       retrieval budget and is never outranked by another document's volume.
    3. Merge: each document gets `guaranteed_per_doc` guaranteed slots; the remaining
       budget fills from globally highest-scored chunks across all documents.
    4. Return results ordered by document relevance (best doc first, chunks within
       each doc sorted by score).
    """
    loop = asyncio.get_running_loop()
    query_vec = await loop.run_in_executor(None, lambda: embed_texts([query])[0])
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"

    doc_ids = await _fetch_ready_doc_ids(db, workspace_id)
    num_docs = len(doc_ids)

    if num_docs == 0:
        return []

    # ── Single document: simple global search (no diversification needed) ──
    if num_docs == 1:
        inner_k = max(top_k * inner_k_multiplier, 50)
        rows = await db.execute(_GLOBAL_SQL, {
            "vec": vec_literal,
            "ws_id": workspace_id,
            "q": query,
            "inner_k": inner_k,
            "limit_k": top_k,
        })
        return _rows_to_results(rows)

    # ── Multiple documents: per-document parallel retrieval ──

    # Guaranteed floor: floor(top_k / num_docs), minimum 1 per doc.
    # Using floor division ensures total guaranteed slots (num_docs × floor)
    # never exceed top_k, so the final [:top_k] slice never drops a document's
    # guaranteed chunk. The fill phase then gives extra slots to the most-relevant docs.
    guaranteed_per_doc = max(1, top_k // num_docs)

    # Fetch a few extra per doc beyond the guarantee to have candidates for the
    # remaining "fill" budget. Cap at 10 to keep per-doc queries lightweight.
    per_doc_k = min(guaranteed_per_doc + 3, 10)
    inner_k = max(per_doc_k * inner_k_multiplier, 25)

    # All per-document searches run concurrently
    per_doc_results: list[list[SearchResult]] = list(await asyncio.gather(*[
        _search_single_doc(db, workspace_id, doc_id, vec_literal, query, per_doc_k, inner_k)
        for doc_id in doc_ids
    ]))

    # Phase 1 — guaranteed slots: best `guaranteed_per_doc` chunks from every document
    final: list[SearchResult] = []
    seen: set[str] = set()

    for doc_results in per_doc_results:
        added = 0
        for r in doc_results:
            if added >= guaranteed_per_doc:
                break
            if r.chunk_id not in seen:
                final.append(r)
                seen.add(r.chunk_id)
                added += 1

    # Phase 2 — fill remaining budget from the globally highest-scored candidates
    remaining = max(0, top_k - len(final))
    if remaining > 0:
        extras = sorted(
            (r for results in per_doc_results for r in results if r.chunk_id not in seen),
            key=lambda r: r.score,
            reverse=True,
        )
        for r in extras[:remaining]:
            if r.chunk_id not in seen:
                final.append(r)
                seen.add(r.chunk_id)

    # ── Order results: documents sorted by relevance (best first), chunks within
    #    each document sorted by score ──
    by_doc: dict[str, list[SearchResult]] = {}
    for r in final:
        by_doc.setdefault(r.document_id, []).append(r)

    for chunks in by_doc.values():
        chunks.sort(key=lambda r: r.score, reverse=True)

    doc_order = sorted(
        by_doc.keys(),
        key=lambda did: by_doc[did][0].score,
        reverse=True,
    )

    return [r for did in doc_order for r in by_doc[did]][:top_k]

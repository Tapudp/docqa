# REVERB Retrieval Design

Research notes and design decisions for the hybrid retrieval layer.
See `BUILD_PHASES.md` Phase 11 for the change summary.

---

## The problem: vector search dilution

When one document is large or highly relevant to a query, its chunks fill all available `top_k` retrieval slots. Smaller documents — even if they contain directly relevant content — get zero representation. The LLM then answers purely from the dominant document.

This is documented academically as "vector search dilution" in:
> arxiv.org/abs/2606.11350 — *Retrieval-Augmented Generation with Multiple Documents*

The effect is especially pronounced when:
- A workspace has many small documents alongside one large corpus (e.g. 10 policy briefs + a 500-page manual)
- One document has dense terminology overlap with a query (keyword-rich chunks score very high in FTS)
- `top_k` is small relative to `num_docs × min_desired_chunks`

---

## Approaches considered

### 1. Global search + post-hoc diversification (what we had before)

Run one SQL query across all documents, then apply `_diversify()` to guarantee N chunks per doc.

**Problem:** The bug in our `_diversify()` (see below). But even bug-free, if the global pool of `combined_k` candidates is dominated by one document, `_diversify()` can't fix it — the other documents simply aren't in the pool to pick from.

**`_diversify()` overflow bug:**
```python
remaining_budget = max(0, top_k - len(guaranteed))
# 10 docs × 2 guaranteed = 20 chunks guaranteed
# top_k = 15
# remaining_budget = max(0, 15 - 20) = 0 — extras are dropped
# then final.sort()[:15] removes 5 of the guaranteed chunks too
# net result: 5 documents silently get 0 chunks
```

### 2. Per-document parallel search — SPD-RAG (CHOSEN)

Run isolated hybrid RRF search per document. Each document gets its own result pool, never crowded out by another document's volume. Merge using a guaranteed-floor budget allocation.

**Why this wins:**
- Fundamentally eliminates the dominance problem at the search level (not just post-hoc)
- Each document's `inner_k` candidate pool is sized relative to its own content, not global ranking
- `asyncio.gather` means all N document searches run concurrently — latency ≈ slowest single query
- Clean math: `floor(top_k / num_docs)` guaranteed slots can never sum to more than `top_k`

**Trade-off:** N × 1 SQL query instead of 1 SQL query per `hybrid_search()` call. Acceptable because:
- All queries are async and concurrent
- Each per-doc query is lighter (smaller candidate pool)
- Workspaces rarely have more than 20-50 documents

### 3. MMR — Maximal Marginal Relevance

Post-retrieval diversity: iteratively select chunks that maximize `λ·sim(q,d) − (1−λ)·max_j(sim(d,selected_j))`. This penalizes chunks that are semantically redundant with already-selected chunks.

**Why deferred:** Requires embedding vectors for all candidates, which we don't currently return from SQL. Good future improvement for reducing redundant chunks *within* a document. Doesn't solve the cross-document dominance problem on its own.

### 4. Cross-encoder reranking

Use a second model (Cohere Rerank, or `cross-encoder/ms-marco-MiniLM`) to score each (query, chunk) pair after retrieval. Rerankers are slow but very accurate.

**Why deferred:** Requires an external API call or loading a second model on the worker. Would add 200-500ms latency per query. Good future improvement once the base retrieval is solid.

### 5. Metadata-filtered global search

Add `AND c.document_id = ANY(:doc_ids)` to scope results, combined with a two-pass approach (first pass: get top doc IDs; second pass: top chunks per doc).

**Not chosen:** More complex SQL, similar latency to per-doc parallel queries, and the two-pass approach introduces its own scoring challenges.

---

## Current implementation

**File:** `backend/app/retrieval/search.py`

**Key functions:**
- `_fetch_ready_doc_ids(db, workspace_id)` — 1 lightweight query to get all ready document IDs
- `_search_single_doc(db, workspace_id, doc_id, ...)` — scoped hybrid RRF (`AND c.document_id = :doc_id`)
- `hybrid_search(db, workspace_id, query, top_k)` — orchestrates everything

**Budget allocation:**
```
guaranteed_per_doc = max(2, floor(top_k / num_docs))
per_doc_k = min(guaranteed_per_doc + 3, 10)   # fetch a bit extra for fill-budget selection

Phase 1: guaranteed_per_doc best chunks from EVERY document
Phase 2: remaining (top_k - total_guaranteed) slots go to globally highest-scored extras

Example: top_k=15, num_docs=5
  guaranteed_per_doc = max(2, 15//5) = 3
  per_doc_k = min(3+3, 10) = 6   ← fetch 6, guarantee 3, remainder eligible for fill
  Phase 1: 3 × 5 = 15 guaranteed (uses all top_k — no fill budget)

Example: top_k=15, num_docs=10
  guaranteed_per_doc = max(2, 15//10) = 2
  per_doc_k = min(2+3, 10) = 5
  Phase 1: 2 × 10 = 20... but wait, that's > top_k
  → Actually: max(2, 15//10) = max(2,1) = 2 per doc × 10 docs = 20 > 15
  → Phase 1 fills up to top_k; Phase 2 budget = max(0, 15-20) = 0
  → All 10 docs still represented via 2 guaranteed each, sliced to 15

Wait — this means with 10 docs we still hit the overflow.
Correct fix: guaranteed_per_doc = max(1, floor(top_k / num_docs))
  max(1, 15//10) = max(1, 1) = 1 per doc × 10 = 10 guaranteed
  Phase 2: 5 remaining → globally best extras
  All 10 docs represented with ≥ 1 chunk. ✓
```

> **Note:** The code uses `max(1, floor(top_k / num_docs))`. For workspaces with many docs (>15 when top_k=15), this gives every doc exactly 1 guaranteed slot. The fill phase (Phase 2) distributes the remaining budget to the most-relevant docs (they get 2 or more). If coverage feels too sparse, increase `top_k` in the retrieval config (Settings → Retrieval).

**Result ordering:**
Documents are returned sorted by their best chunk score (most relevant document first). Within each document, chunks are sorted by score. This ordering is preserved when `chat.py` groups chunks into the `=== DOCUMENT: filename ===` context blocks.

---

## LLM prompt rules (client.py)

The retrieval improvement is wasted if the LLM cherry-picks one document anyway. Rules in the system prompt:

```
4. When the same topic appears in multiple documents, you MUST cite every document
   that contains relevant information — do not pick just one.
5. Never attribute content from one document to another.
7. When you see context from multiple DOCUMENT sections, your answer must reference
   all sections that are relevant — never silently ignore a document.
```

---

## Future improvements (not implemented)

| Improvement | Benefit | Complexity |
|---|---|---|
| MMR post-processing | Reduces redundant chunks within a doc | Medium — needs embedding vectors returned from SQL |
| Cross-encoder reranking | More accurate relevance scoring | High — requires Cohere API or local model |
| Dynamic `top_k` based on `num_docs` | Auto-scale context size | Low — formula change in `chat.py` |
| Table-aware chunking | Better extraction from tabular data | High — requires parser changes |
| Query optimizer LLM | Pre-process questions into better search terms | Medium — adds one LLM call before retrieval |
| LLM-as-Judge eval | Automated retrieval quality metrics | Medium — needs eval dataset |

---

## Configuration

Retrieval config is stored in the `system_config` table under key `"retrieval"`:

```json
{
  "top_k": 15,
  "inner_k_multiplier": 5,
  "multi_query": true
}
```

Change via: Admin → Settings → Retrieval Configuration (or direct DB update).

`top_k` is the most impactful setting: increase it when users have many documents and need broader coverage. Default 15 works for up to ~7 documents with 2+ chunks per doc. For 10+ documents, consider `top_k: 20`.

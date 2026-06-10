# NpuDen DocQA — Hardware-Adaptive Configuration Guide

This document maps every tunable parameter in DocQA to the hardware available,
explains why limits exist, and gives ready-to-use presets for each tier.
All settings are managed through **Admin → Retrieval Configuration** or
**Admin → LLM Configuration** — no code changes or restarts needed.

---

## Parameter reference

### Retrieval layer (configurable at runtime)

| Parameter | Default | Where it lives | Requires re-index? |
|-----------|---------|---------------|--------------------|
| `top_k` | 15 | SystemConfig `retrieval` | No |
| `inner_k_multiplier` | 5 | SystemConfig `retrieval` | No |
| `multi_query` | true | SystemConfig `retrieval` | No |
| `chunk_size` | 1500 | SystemConfig `retrieval` | **Yes** |
| `chunk_overlap` | 300 | SystemConfig `retrieval` | **Yes** |

**`top_k`** — How many chunks are sent to the LLM as context. More = higher
recall but more tokens consumed and slower generation.

**`inner_k_multiplier`** — Each sub-query (vector and FTS) fetches
`top_k × multiplier` candidates before RRF merging. Higher value = wider net,
better recall for deep-document content. Set higher when documents are long
(100+ pages) or you need granular fact retrieval.

**`multi_query`** — Enables parallel sub-queries when a question references
multiple numbered entities (e.g. "compare rules 155 and 166"). Fires one
targeted search per entity instead of a single split-attention query.

**`chunk_size`** — Characters per chunk at index time. Larger chunks keep
complete paragraphs or rules together; smaller chunks give more precise
citation page numbers. Changing this requires re-indexing all documents.

**`chunk_overlap`** — Characters of overlap between consecutive chunks.
Prevents rule headers from being split from their content. Changing requires
re-indexing.

### LLM layer

| Parameter | Default | Where it lives |
|-----------|---------|---------------|
| `model` | `gemma4:26b` | SystemConfig `llm` |
| `provider` | `ollama` | SystemConfig `llm` |
| `base_url` | cluster internal | SystemConfig `llm` |
| `max_tokens` | 1024 | (code constant) |
| `temperature` | 0.1 | (code constant) |

---

## Why `top_k = 1000` breaks everything

Each chunk ≈ 1 500 chars ≈ **375 tokens**.

| top_k | Context tokens | Notes |
|-------|---------------|-------|
| 10 | ~3 750 | Well within all models |
| 15 | ~5 600 | Current default |
| 30 | ~11 250 | Safe for 32k+ context models |
| 75 | ~28 125 | Safe for 128k context models |
| 200 | ~75 000 | Requires 128k+ context |
| 1 000 | ~375 000 | **Exceeds all known model context windows** |

Beyond the context limit, the LLM either crashes or silently truncates input.
Even if it didn't, recall quality drops: models suffer "lost in the middle"
— they attend strongly to the start and end of context and miss information
buried in the middle. More context beyond the sweet spot hurts, not helps.

The right solution for large documents is a **wider inner search pool**
(`inner_k_multiplier`) combined with quality chunking, not a larger `top_k`.

---

## Hardware tiers & recommended settings

### Tier 1 — Single consumer / workstation GPU (16–24 GB VRAM)
*RTX 3090/4090, A10, L4*

| Setting | Value |
|---------|-------|
| Model | `qwen2.5:7b`, `llama3.2:8b`, `mistral:7b` |
| `top_k` | 8–10 |
| `inner_k_multiplier` | 5 |
| `chunk_size` | 1 200 |
| `chunk_overlap` | 200 |
| `multi_query` | true |
| Max context | ~8k tokens |

**Why:** 7B–8B models have 8k–16k context windows. Keep context lean so the
model can reason well over it.

---

### Tier 2 — Single professional GPU (40–80 GB VRAM)
*A40, A100 40 GB/80 GB, H100 SXM (single)*

**This is your current nid-practice setup (A40 48 GB, gemma4:26b).**

| Setting | Value |
|---------|-------|
| Model | `gemma4:26b`, `qwen2.5:32b`, `llama3.1:34b` |
| `top_k` | 15 |
| `inner_k_multiplier` | 5 |
| `chunk_size` | 1 500 |
| `chunk_overlap` | 300 |
| `multi_query` | true |
| Max context | ~32k tokens (gemma4) |

**Why:** 26B–34B models balance quality and speed on a single A40. Context of
~5 600 tokens uses only ~17 % of gemma4's 32k window — plenty of headroom to
raise `top_k` to 20–25 if needed.

---

### Tier 3 — Dual H100 / H200 (160–320 GB total VRAM)
*2× H100 SXM 80 GB (your customer's GPU nodes)*

| Setting | Value |
|---------|-------|
| Model | `llama3.1:70b`, `qwen2.5:72b`, `deepseek-r1:70b` |
| `top_k` | 30–40 |
| `inner_k_multiplier` | 8–10 |
| `chunk_size` | 2 000 |
| `chunk_overlap` | 400 |
| `multi_query` | true |
| Max context | ~128k tokens (llama3.1:70b) |

**Why:** 70B models on tensor-parallel H100s have 128k context windows.
You can safely raise `top_k` to 30–40 (≈11k–15k context tokens) and widen
the inner pool to 300–400 candidates for deep-document recall.

---

### Tier 4 — Large H100/H200 cluster (4+ GPUs, 320+ GB VRAM)
*4× H100/H200, or your K8s cluster with 1 master + 2 CPU + 2 H100 GPU nodes*

| Setting | Value |
|---------|-------|
| Model | `llama3.1:405b`, `deepseek-r1:671b`, `qwen2.5:235b` |
| `top_k` | 60–100 |
| `inner_k_multiplier` | 15–20 |
| `chunk_size` | 2 500 |
| `chunk_overlap` | 500 |
| `multi_query` | true |
| Max context | 128k–1M tokens |

**Why:** At 405B+ parameter scale, reasoning quality on complex multi-document
queries is substantially better. The larger context window lets you raise
`top_k` to 60–100 (≈22k–37k tokens) without saturation. The inner pool of
1 200–2 000 candidates means virtually nothing is missed in a 500-page corpus.

---

## Your specific deployments

### nid-practice (current production)
```
Node:     nid-practice
GPU:      1× Nvidia A40 (48 GB VRAM)
CPU:      64 cores
RAM:      756 GB
Tier:     2 (single professional GPU)
Model:    gemma4:26b
top_k:    15
inner_k:  75 (15 × 5)
```

### K8s cluster with H100 GPU nodes
```
Nodes:    1 master + 2 CPU + 2 GPU (H100)
GPU:      2× H100 SXM (80 GB each = 160 GB total)
Tier:     3 (dual H100)
Model:    llama3.1:70b or qwen2.5:72b (tensor-parallel across both H100s)
top_k:    35
inner_k:  350 (35 × 10)
chunk_size: 2000
overlap:  400
```
To load a 70B model across both H100s in Ollama: `OLLAMA_NUM_GPU=2 ollama run llama3.1:70b`

---

## Changing settings

All retrieval settings are live — no restart or rebuild required.

1. Go to **Admin → Retrieval Configuration**
2. Select a hardware preset or enter values manually
3. Click **Save** — takes effect for all subsequent queries immediately
4. If you changed `chunk_size` or `chunk_overlap`: re-index all documents
   (Admin → Documents → Re-index All, or per-document from the document list)

---

## Phase 2 roadmap — per-workspace retrieval override

Currently, retrieval config is global. A planned Phase 2 feature will allow
per-workspace overrides (same pattern as the existing per-workspace LLM
override). This requires a DB migration to add a `retrieval_config` JSONB
column to the `workspaces` table.

Use case: a workspace with very large technical manuals needs `top_k=30`,
while a workspace with short policy documents is fine at `top_k=10`.

---

## Re-indexing after chunk_size / chunk_overlap changes

When you change chunking parameters, existing documents keep their old chunks
until re-indexed. New uploads always use the current settings.

To re-index a document via the API (admin only):

```bash
# Find document ID
curl -H "Authorization: Bearer <token>" \
  http://172.16.200.116:30800/api/admin/workspaces/<ws-id>/documents

# Reset + re-queue
kubectl exec -n docqa deployment/api -- python3 -c "
import asyncio, uuid
from app.database import AsyncSessionLocal
from app.models.document import Document
from app.worker.tasks import chunk_and_index_document

DOC_ID = '<doc-id>'

async def reset():
    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, uuid.UUID(DOC_ID))
        doc.status = 'parsed'
        doc.chunk_count = 0
        await db.commit()

asyncio.run(reset())
chunk_and_index_document.delay(DOC_ID)
"
```

# NpuDen DocQA — Enterprise Document Intelligence Platform

> Architecture & Implementation Plan  
> Version 2.0 — May 2026  
> Author: NpuDen Engineering  
> Scale Target: 100–10,000 concurrent users  
> Runtime Target: Any hardware — NVIDIA (A40/H100/H200/RTX), Apple Silicon, CPU-only  
> License: Proprietary (NpuDen)

---

## 1. Why We're Building This

Every existing RAG tool we evaluated fails at one or more critical points:

| Tool | Parsing | Exact Keywords | Full Doc Read | Citations | Multi-user | Enterprise Auth |
|------|---------|---------------|---------------|-----------|------------|-----------------|
| AnythingLLM | Basic PyPDF | ❌ Misses "Rule155" | ❌ 10/50 pages read | Weak | ✅ | ❌ |
| Kotaemon | Basic PyPDF | ✅ Hybrid search helps | ❌ Same chunking limits | ✅ Strong | ✅ | ❌ |
| RAGFlow | ✅ DeepDoc | ✅ Hybrid | ✅ | ✅ | ✅ | Partial |
| Open WebUI | N/A | N/A | N/A | N/A | ✅ | Partial |

**NpuDen DocQA** combines the best of each into a single product:
- Modular document parsing (PaddleOCR default, swappable to Docling/Unstructured/custom)
- **100% document coverage guarantee** — every page is read, parsed, and indexed. No silent truncation.
- Triple retrieval: BM25 keyword + vector + optional PageIndex reasoning
- Page-level citations with in-browser PDF viewer
- Enterprise workspace isolation, RBAC, and SSO
- Runs on any hardware: NVIDIA datacenter GPUs, consumer GPUs, Apple Silicon, or CPU-only
- Airbnb-inspired UI that feels consumer-grade, not developer-grade

---

## 2. Product Vision

```
"Upload any document. Ask any question. Get the exact answer with the page number."
```

### Core User Stories

1. **Admin** creates workspaces ("HR Policies", "Engineering Docs", "Legal Contracts")
2. **Admin** assigns users to workspaces with roles (viewer, editor, admin)
3. **User** uploads PDFs/DOCX/images to their workspace
4. **System** parses **every page** of the document using the configured parser module
5. **System** verifies page coverage: parsed pages == total pages (no silent drops)
6. **System** stores the original file + structured output + chunks + indexes
7. **User** asks "What does Rule 155 say about procurement?"
8. **System** retrieves via BM25 (exact "Rule 155" match) + vector (semantic context)
9. **System** generates answer with LLM, citing exact pages
10. **User** clicks citation → in-browser PDF viewer scrolls to that page with highlight
11. **Admin** sees usage analytics across all workspaces

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Next.js)              │
│           Airbnb-inspired design system                  │
│    Chat UI │ Workspace Manager │ Admin Dashboard         │
└────────────────────────┬────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│                    API GATEWAY (FastAPI)                  │
│         Auth middleware │ Rate limiting │ CORS            │
└──┬──────────┬───────────┬──────────┬───────────────┬────┘
   │          │           │          │               │
   ▼          ▼           ▼          ▼               ▼
┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐  ┌────────────┐
│ Auth │ │ Doc    │ │Retrieval│ │  LLM   │  │  Workspace │
│Service│ │Pipeline│ │ Engine  │ │ Router │  │  Manager   │
└──┬───┘ └───┬────┘ └────┬────┘ └───┬────┘  └─────┬──────┘
   │         │           │          │              │
   ▼         ▼           ▼          ▼              ▼
┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐  ┌────────────┐
│Postgres│ │Parser │ │Elastic- │ │Ollama  │  │ PostgreSQL │
│(users)│ │Module  │ │search + │ │Gemini  │  │ (workspaces│
│       │ │(swap-  │ │ChromaDB │ │Claude  │  │  files,    │
│Keycloak│ │pable) │ │LanceDB  │ │OpenAI  │  │  settings) │
└───────┘ └───────┘ └─────────┘ └────────┘  └────────────┘
```

---

## 4. Hardware Compatibility — Run Anywhere

### Design Principle

NpuDen DocQA does NOT assume any specific GPU, CPU architecture, or operating
system. The product adapts to what's available.

### Compute Tiers

| Tier | Hardware Example | What Runs | Parsing | LLM Inference |
|------|-----------------|-----------|---------|---------------|
| **Tier 1: Datacenter GPU** | NVIDIA A40/H100/H200 | Everything local | GPU-accelerated PaddleOCR | Local Ollama (35B+ models) |
| **Tier 2: Consumer GPU** | NVIDIA RTX 3060/4070 | Most things local | GPU-accelerated PaddleOCR | Local Ollama (7B-14B models) |
| **Tier 3: Apple Silicon** | MacBook Pro M1/M2/M3/M4 | Everything local | CPU PaddleOCR (or CoreML) | Local Ollama (7B via Metal) |
| **Tier 4: CPU-only** | Any Linux/Windows server | Backend + parsing | CPU PaddleOCR (slower) | Cloud LLM only (Gemini/Claude/OpenAI) |
| **Tier 5: Cloud** | AWS/GCP/Azure VM | Full stack | GPU if available | Cloud or local LLM |

### How It Works

```python
# On startup, the system detects available hardware
class HardwareDetector:
    def detect(self) -> HardwareProfile:
        profile = HardwareProfile()

        # GPU detection
        if torch_cuda_available():
            profile.gpu = "nvidia"
            profile.gpu_name = get_gpu_name()  # "A40", "H100", etc.
            profile.vram_gb = get_vram_gb()
        elif torch_mps_available():
            profile.gpu = "apple_mps"
            profile.gpu_name = "Apple Silicon"
        else:
            profile.gpu = "none"
            profile.compute_mode = "cpu"

        # Memory detection
        profile.ram_gb = get_system_ram()

        # Recommend defaults based on hardware
        if profile.vram_gb and profile.vram_gb >= 24:
            profile.recommended_parser = "paddleocr-gpu"
            profile.recommended_llm = "ollama"
            profile.recommended_model = "qwen3.5:35b"
        elif profile.gpu == "apple_mps":
            profile.recommended_parser = "paddleocr-cpu"
            profile.recommended_llm = "ollama"
            profile.recommended_model = "qwen3.5:7b"
        else:
            profile.recommended_parser = "paddleocr-cpu"
            profile.recommended_llm = "cloud"
            profile.recommended_model = "gemini-2.5-flash"

        return profile
```

### Docker Images

```yaml
# Base images for each platform
images:
  api:
    - npuden/docqa-api:latest              # linux/amd64 + linux/arm64
  frontend:
    - npuden/docqa-frontend:latest         # linux/amd64 + linux/arm64
  parser:
    - npuden/docqa-parser:latest-gpu       # NVIDIA GPU (CUDA)
    - npuden/docqa-parser:latest-cpu       # CPU fallback
    - npuden/docqa-parser:latest-apple     # Apple Silicon (MPS)
```

### docker-compose profiles

```yaml
# Users pick a profile matching their hardware
# GPU server:
docker compose --profile gpu up -d

# Apple Silicon Mac:
docker compose --profile apple up -d

# CPU-only (uses cloud LLM):
docker compose --profile cpu up -d
```

---

## 5. Document Upload & Storage Pipeline

### What Happens When a User Uploads a Document

This is the complete lifecycle of a document from upload to queryable:

```
User drops "GFR-2024.pdf" (50 pages, 12MB)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ STAGE 1: RECEIVE & STORE ORIGINAL               │
│                                                   │
│  1. Validate file type (PDF/DOCX/XLSX/PPT/image) │
│  2. Virus scan (ClamAV)                          │
│  3. Store ORIGINAL file in MinIO (object storage)│
│     Key: workspace_id/documents/original/abc.pdf │
│  4. Record in PostgreSQL:                         │
│     - file_id, filename, size, mime_type          │
│     - workspace_id, uploaded_by, uploaded_at      │
│     - status = "received"                         │
│     - total_pages = 50 (extracted from PDF metadata)│
│  5. Return upload receipt to user immediately     │
│                                                   │
│  ★ The original file is ALWAYS preserved.         │
│    Even if parsing fails, the original is safe.   │
└────────────────────┬────────────────────────────┘
                     │ (async via Celery task)
                     ▼
┌─────────────────────────────────────────────────┐
│ STAGE 2: PARSE (Document Parser Module)          │
│                                                   │
│  1. status → "parsing"                            │
│  2. Send to parser module (PaddleOCR by default)  │
│  3. Parser processes EVERY PAGE:                  │
│     - Page 1 → structured elements               │
│     - Page 2 → structured elements               │
│     - ...                                         │
│     - Page 50 → structured elements               │
│  4. Output: structured JSON per page:             │
│     [{page: 1, elements: [...]},                  │
│      {page: 2, elements: [...]},                  │
│      ...                                          │
│      {page: 50, elements: [...]}]                 │
│                                                   │
│  5. ★ COVERAGE VERIFICATION:                      │
│     parsed_pages = len(output)     # 50           │
│     expected_pages = total_pages   # 50           │
│     if parsed_pages < expected_pages:             │
│         log WARNING + flag document               │
│         retry failed pages individually           │
│         if still missing: mark as "partial"       │
│     else:                                         │
│         mark as "fully_parsed"                    │
│                                                   │
│  6. Store parsed output in MinIO:                 │
│     Key: workspace_id/documents/parsed/abc.json   │
│  7. status → "parsed" (with coverage %)           │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ STAGE 3: CHUNK (Structure-Aware Splitting)       │
│                                                   │
│  Rules:                                           │
│  - Never split a table across chunks              │
│  - Never split mid-sentence                       │
│  - Every chunk carries its page number(s)         │
│  - Every chunk carries its section heading         │
│  - Chunk size: 512 tokens (configurable)          │
│  - Overlap: last 2 sentences of previous chunk    │
│                                                   │
│  Input:  50 pages of structured elements          │
│  Output: ~180 chunks (depends on content density) │
│                                                   │
│  Each chunk stored in PostgreSQL:                 │
│  {                                                │
│    chunk_id, document_id, workspace_id,           │
│    page_numbers: [36, 37],                        │
│    section_heading: "Chapter 4: Procurement",     │
│    content: "Rule 155: Procurement of goods...",  │
│    chunk_type: "paragraph",                       │
│    token_count: 487                               │
│  }                                                │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ STAGE 4: INDEX (Dual Indexing)                   │
│                                                   │
│  Each chunk is indexed in TWO systems:            │
│                                                   │
│  A) Full-Text Index (Elasticsearch / LanceDB)     │
│     - BM25 scoring                                │
│     - Finds exact keywords: "Rule 155"            │
│     - Filters by workspace_id, page_number        │
│                                                   │
│  B) Vector Index (ChromaDB / Milvus / LanceDB)    │
│     - Embedding via configured model              │
│       (nomic-embed-text via Ollama, or             │
│        text-embedding-3-small via OpenAI, or       │
│        any provider configured by admin)           │
│     - Finds semantic matches: "procurement rules" │
│     - Filters by workspace_id                     │
│                                                   │
│  status → "ready"                                 │
│  parsed_pages: 50/50                              │
│  total_chunks: 180                                │
│  bm25_indexed: 180                                │
│  vector_indexed: 180                              │
│                                                   │
│  ★ INDEXING VERIFICATION:                         │
│  If any chunk fails to index, retry individually. │
│  Document status shows indexing coverage.          │
│  User sees: "180/180 chunks indexed ✓"            │
└─────────────────────────────────────────────────┘
```

### What's Stored Where

| Storage | What | Why | Persistent |
|---------|------|-----|-----------|
| **MinIO** (object store) | Original PDF/DOCX files | Serve to PDF viewer, re-parse if needed, legal compliance | Yes |
| **MinIO** | Parsed JSON output per document | Re-chunk without re-parsing, debugging, audit | Yes |
| **PostgreSQL** | File metadata, chunk records, page mappings | Relational queries, workspace scoping, status tracking | Yes |
| **Elasticsearch** | BM25 inverted index of chunk text | Exact keyword search ("Rule 155") | Yes |
| **ChromaDB/Milvus** | Vector embeddings of chunk text | Semantic similarity search | Yes |

### Key Guarantee: Full Document Coverage

This is non-negotiable. The system MUST process every page:

```python
class DocumentCoverageVerifier:
    """Ensures no pages are silently dropped."""

    def verify(self, document_id: str) -> CoverageReport:
        doc = db.get_document(document_id)
        expected = doc.total_pages  # from PDF metadata

        # Check parsed pages
        parsed = parser_store.count_parsed_pages(document_id)

        # Check chunks cover all pages
        chunked_pages = set()
        for chunk in db.get_chunks(document_id):
            chunked_pages.update(chunk.page_numbers)

        # Check indexed chunks
        bm25_count = es.count(document_id=document_id)
        vector_count = vectordb.count(document_id=document_id)
        total_chunks = db.count_chunks(document_id)

        return CoverageReport(
            expected_pages=expected,
            parsed_pages=parsed,
            pages_with_chunks=len(chunked_pages),
            missing_pages=set(range(1, expected+1)) - chunked_pages,
            total_chunks=total_chunks,
            bm25_indexed=bm25_count,
            vector_indexed=vector_count,
            is_complete=(
                parsed == expected and
                len(chunked_pages) == expected and
                bm25_count == total_chunks and
                vector_count == total_chunks
            )
        )
```

The user sees this in the UI:

```
📄 GFR-2024.pdf
   Pages: 50/50 parsed ✓
   Chunks: 180 created, 180 indexed ✓
   Status: Ready
   Uploaded: 2 hours ago by Divyesh
```

If any pages are missing:

```
⚠️ GFR-2024.pdf
   Pages: 48/50 parsed (pages 23, 41 failed)
   Chunks: 172 created, 172 indexed
   Status: Partial — 2 pages could not be parsed
   Action: [Retry Failed Pages] [View Error Log]
```

---

## 6. Document Parser Module (Pluggable Architecture)

### Design Principle

The document parser is a **module boundary** — a clean interface that any
parser implementation must satisfy. Today it's PaddleOCR. Tomorrow it could
be Docling, Unstructured, Adobe PDF Extract, a custom fine-tuned model,
or a composite pipeline that chains multiple parsers.

### Parser Interface

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ParsedElement:
    """A single element extracted from a document page."""
    type: str              # "paragraph", "table", "heading", "figure",
                           # "figure_caption", "list", "stamp", "formula"
    content: str           # Text content (Markdown for tables)
    bbox: Optional[tuple]  # (x1, y1, x2, y2) bounding box on page
    confidence: float      # Parser confidence score (0.0–1.0)

@dataclass
class ParsedPage:
    """All elements extracted from a single page."""
    page_number: int
    elements: List[ParsedElement]
    raw_text: str          # Fallback: concatenated plain text
    width: float           # Page dimensions (for bbox mapping)
    height: float

@dataclass
class ParsedDocument:
    """Complete parsed output for a document."""
    pages: List[ParsedPage]
    total_pages: int
    parser_name: str       # "paddleocr", "docling", "unstructured"
    parser_version: str
    parse_time_seconds: float
    coverage: float        # parsed_pages / total_pages (should be 1.0)

class DocumentParser(ABC):
    """Interface that all parser modules must implement."""

    @abstractmethod
    def parse(self, file_path: str, mime_type: str) -> ParsedDocument:
        """Parse a document file and return structured output.

        MUST process every page. If a page fails, include it with
        raw_text fallback and confidence=0.0 rather than skipping it.
        """
        pass

    @abstractmethod
    def supported_formats(self) -> List[str]:
        """Return list of supported MIME types."""
        pass

    @abstractmethod
    def requires_gpu(self) -> bool:
        """Whether this parser needs GPU acceleration."""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Verify the parser service is running and responsive."""
        pass
```

### Available Parser Implementations

```python
# Built-in parsers (shipped with DocQA)
PARSER_REGISTRY = {
    "paddleocr": {
        "class": "parsers.PaddleOCRParser",
        "description": "PaddleOCR-VL-1.6 — 96.3% accuracy, 100+ languages",
        "gpu": True,                # GPU recommended, CPU fallback available
        "formats": ["pdf", "docx", "png", "jpg", "tiff"],
        "strengths": "Tables, stamps, formulas, scanned docs, cross-page tables",
        "docker_image": "npuden/docqa-parser-paddleocr"
    },
    "docling": {
        "class": "parsers.DoclingParser",
        "description": "IBM Docling — layout-aware document conversion",
        "gpu": False,
        "formats": ["pdf", "docx", "pptx", "xlsx", "html"],
        "strengths": "Office formats, structured output, fast on CPU",
        "docker_image": "npuden/docqa-parser-docling"
    },
    "unstructured": {
        "class": "parsers.UnstructuredParser",
        "description": "Unstructured.io — general-purpose document parser",
        "gpu": False,
        "formats": ["pdf", "docx", "pptx", "xlsx", "eml", "html", "md", "txt"],
        "strengths": "Widest format support, partition strategies",
        "docker_image": "npuden/docqa-parser-unstructured"
    },
    "pypdf_fallback": {
        "class": "parsers.PyPDFFallbackParser",
        "description": "Basic PyPDF2 text extraction — always available, no deps",
        "gpu": False,
        "formats": ["pdf"],
        "strengths": "Zero dependencies, works everywhere, fast",
        "docker_image": null       # Built into the main API image
    }
}
```

### Parser Configuration (per-workspace)

Each workspace can configure which parser to use:

```json
{
  "workspace_id": "ws_legal_dept",
  "parser_config": {
    "primary": "paddleocr",
    "fallback": "pypdf_fallback",
    "settings": {
      "language": "en",
      "detect_tables": true,
      "detect_stamps": true,
      "detect_formulas": false,
      "ocr_scanned_pages": true
    }
  }
}
```

### Composite Parser (Future)

A parser module can itself be a pipeline of multiple parsers:

```python
class CompositeParser(DocumentParser):
    """Chain multiple parsers for best results.

    Example: Use PaddleOCR for scanned/image pages,
    Docling for structured text pages.
    """

    def parse(self, file_path, mime_type):
        # Step 1: Classify each page
        page_types = self.classifier.classify_pages(file_path)
        # {1: "text", 2: "text", 3: "scanned", 4: "table_heavy", ...}

        # Step 2: Route to best parser per page
        results = []
        for page_num, page_type in page_types.items():
            if page_type in ("scanned", "image"):
                result = self.paddleocr.parse_page(file_path, page_num)
            elif page_type == "table_heavy":
                result = self.paddleocr.parse_page(file_path, page_num)
            else:
                result = self.docling.parse_page(file_path, page_num)
            results.append(result)

        return ParsedDocument(pages=results, ...)
```

### Adding a Custom Parser

Third parties or NpuDen's own team can add a parser by:

1. Implementing the `DocumentParser` interface
2. Packaging it as a Docker image (or a Python package)
3. Registering it in `PARSER_REGISTRY`
4. Selecting it in the workspace settings UI

No core code changes required.

---

## 7. Full Document Coverage Guarantee

### The Problem We're Solving

In our testing with AnythingLLM and Kotaemon, a 50-page GFR PDF was only
partially read — roughly 10 pages were indexed. This happened because:

1. **Token limits on chunk processing** — the chunker stopped after N tokens
2. **Silent failures** — pages that failed to parse were silently skipped
3. **No verification** — there was no check that all pages were processed

### Our Guarantees

| Guarantee | How It's Enforced |
|-----------|-------------------|
| Every page is sent to the parser | Loop over `range(1, total_pages + 1)`, never batch-skip |
| Failed pages are retried | Individual page retry with exponential backoff |
| Failed pages use fallback parser | If PaddleOCR fails on page 23, try PyPDF2 |
| Failed pages are never silently dropped | Status shows "48/50 pages" with explicit error log |
| Every chunk is indexed in both BM25 and vector | Indexing verification counts match chunk count |
| User can see coverage at all times | UI badge: "50/50 ✓" or "48/50 ⚠️ [Retry]" |
| Admin can see system-wide coverage stats | Dashboard: "99.7% pages parsed across all documents" |

### Implementation

```python
async def parse_document_with_guarantee(
    document_id: str,
    file_path: str,
    workspace_config: WorkspaceConfig
) -> ParsedDocument:
    """Parse every page, with retries and fallbacks."""

    total_pages = get_pdf_page_count(file_path)
    primary_parser = get_parser(workspace_config.parser_config.primary)
    fallback_parser = get_parser(workspace_config.parser_config.fallback)

    parsed_pages = []
    failed_pages = []

    # Phase 1: Try primary parser on all pages
    for page_num in range(1, total_pages + 1):
        try:
            result = await primary_parser.parse_page(file_path, page_num)
            if result.elements and result.confidence > 0.1:
                parsed_pages.append(result)
            else:
                failed_pages.append(page_num)
        except Exception as e:
            logger.warning(f"Page {page_num} failed with {primary_parser.name}: {e}")
            failed_pages.append(page_num)

        # Report progress
        await update_progress(document_id, page_num, total_pages)

    # Phase 2: Retry failed pages with fallback parser
    still_failed = []
    for page_num in failed_pages:
        try:
            result = await fallback_parser.parse_page(file_path, page_num)
            result.confidence = min(result.confidence, 0.5)  # Mark as fallback
            parsed_pages.append(result)
        except Exception as e:
            logger.error(f"Page {page_num} failed even with fallback: {e}")
            # Insert a placeholder so the page isn't lost
            parsed_pages.append(ParsedPage(
                page_number=page_num,
                elements=[],
                raw_text=f"[Page {page_num}: parsing failed]",
                confidence=0.0
            ))
            still_failed.append(page_num)

    # Phase 3: Sort and verify
    parsed_pages.sort(key=lambda p: p.page_number)

    coverage = len([p for p in parsed_pages if p.confidence > 0]) / total_pages

    return ParsedDocument(
        pages=parsed_pages,
        total_pages=total_pages,
        coverage=coverage,
        failed_pages=still_failed
    )
```

---

## 8. Tech Stack

### Backend

| Layer | Technology | Why |
|-------|-----------|-----|
| API Framework | FastAPI (Python) | Async, typed, SSE streaming, Python ML ecosystem |
| Auth | Built-in JWT (Phase 1) → Keycloak (Phase 3+) | JWT for simple deployments; Keycloak for enterprise SSO |
| Database | PostgreSQL 16 + pgvector extension | Users, workspaces, chat history, chunks, **vector embeddings**, file metadata — all in one store |
| Document Parsing | PyPDF (Phase 1) → Modular PaddleOCR (Phase 4) | Pluggable interface; PyPDF covers most PDFs; PaddleOCR adds OCR/table support |
| Vector Store | **pgvector** (Phase 1) / ChromaDB / Milvus (Phase 4+) | pgvector uses the existing Postgres instance — no extra service; Milvus for 10K+ scale |
| Full-text Search | **PostgreSQL FTS** — `ts_rank` + `plainto_tsquery` (Phase 1) / Elasticsearch (Phase 4+) | Postgres FTS handles hybrid BM25 search without running a separate service; Elasticsearch for large-scale deployments |
| Embedding Model | `BAAI/bge-small-en-v1.5` via **fastembed** | ~130 MB, runs on CPU, no Ollama dependency for embeddings; baked into Docker image |
| File Storage | MinIO (S3-compatible) | Self-hosted object storage for uploaded documents |
| Cache | Redis | Celery broker + result backend |
| Task Queue | Celery + Redis | Async document processing, chunk embedding generation |
| LLM Gateway | Direct OpenAI-compatible client | Supports Ollama, OpenAI, Groq, or any OpenAI-wire-format endpoint |
| Chat Streaming | **SSE** (Server-Sent Events) | Unidirectional token stream from server to browser; simpler than WebSocket for this use case |

### Frontend

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (App Router) | SSR, file-based routing, React Server Components |
| Styling | Tailwind CSS | Matches Airbnb design.md token system directly |
| Components | shadcn/ui (customized) | Headless, accessible, matches rounded/soft aesthetic |
| PDF Viewer | PDF.js (Mozilla) | In-browser PDF rendering with highlight annotations |
| State | Zustand | Lightweight, no boilerplate |
| Real-time | WebSocket (native) | Streaming LLM responses |
| Charts | Recharts | Admin dashboard analytics |
| Font | Inter | Closest open-source substitute for Airbnb Cereal VF |

### Infrastructure

| Layer | Technology | Why |
|-------|-----------|-----|
| Container | Docker (multi-arch: amd64 + arm64) | Runs on Linux servers and Apple Silicon Macs |
| Orchestration | Kubernetes (optional) | Enterprise deployment; Docker Compose for simpler setups |
| Reverse Proxy | NGINX / Traefik | TLS, routing, auth integration |
| Monitoring | Prometheus + Grafana | Observability |
| Logging | Loki | Lightweight, K8s-native |

---

## 9. Retrieval Engine (Hybrid Search)

When a user asks "What does Rule 155 say?":

```
User Query: "What does Rule 155 say?"
    │
    ├──► BM25 / Full-text Search (PostgreSQL FTS — Phase 1)
    │     Query: plainto_tsquery('english', 'Rule 155')
    │     Returns: chunks matching exact keywords
    │     Score: ts_rank
    │     ★ Finds "Rule 155" by exact keyword match
    │     [Phase 4+: Elasticsearch for large-scale deployments]
    │
    ├──► Vector / Semantic Search (pgvector — Phase 1)
    │     Query: BAAI/bge-small-en-v1.5 embed("What does Rule 155 say?")
    │     Returns: chunks with cosine similarity < threshold
    │     Score: embedding <=> query_vector (cosine distance)
    │     ★ Finds related content even if wording differs
    │     [Phase 4+: ChromaDB / Milvus for very large corpora]
    │
    └──► [Optional] PageIndex Reasoning (Phase 4)
          Query: LLM navigates document tree to find relevant pages
          Returns: full page content with reasoning trace
          ★ Catches anything the other two miss
    │
    ▼
Reciprocal Rank Fusion (RRF)
    │
    ├── Merge results from both retrievers
    ├── Score: 1/(60+rank_bm25) + 1/(60+rank_vector)
    ├── Deduplicate by chunk_id
    └── Top-K chunks (default K=6)
    │
    ▼
LLM Generation (with citations)
    │
    ├── System prompt enforces citation format
    ├── Each chunk carries page number(s) [can span pages]
    └── Response includes filename references
    │
    ▼
SSE stream → Frontend citation badges + PDF viewer
```

### Retrieval Configuration (per-workspace)

```json
{
  "retrieval_config": {
    "mode": "hybrid",
    "bm25_weight": 0.4,
    "vector_weight": 0.6,
    "top_k": 5,
    "rerank": true,
    "reranker": "cross-encoder",
    "pageindex_enabled": false
  }
}
```

---

## 10. LLM Provider Abstraction

### Supported Providers

| Provider | Models | Type | GPU Required |
|----------|--------|------|-------------|
| Ollama | qwen3.5, gemma4, llama3, mistral, etc. | Local | Recommended (works on CPU too) |
| OpenAI | gpt-4o, gpt-4o-mini | Cloud API | No |
| Anthropic | claude-sonnet-4-20250514, claude-haiku | Cloud API | No |
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro | Cloud API | No |
| Azure OpenAI | gpt-4o (via Azure) | Cloud API | No |
| Groq | llama, mixtral (ultra-fast inference) | Cloud API | No |
| Local GGUF | Any GGUF model via llama.cpp | Local | Optional |
| Custom | Any OpenAI-compatible endpoint | API | Varies |

### Provider Configuration (per-workspace)

```json
{
  "workspace_id": "ws_legal_dept",
  "llm_config": {
    "provider": "ollama",
    "model": "qwen3.5:35b",
    "base_url": "http://ollama:11434",
    "temperature": 0.1,
    "max_tokens": 2048,
    "system_prompt": "You are a legal document assistant..."
  },
  "embedding_config": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "base_url": "http://ollama:11434"
  }
}
```

Cloud API keys are stored encrypted in PostgreSQL, scoped to the workspace.
Admin can set organization-wide defaults that workspaces inherit.

---

## 11. User Management & Auth

### User Roles

| Role | Permissions |
|------|------------|
| **Super Admin** | All workspaces, user management, system settings, analytics |
| **Workspace Admin** | Manage users/files in their workspace(s), configure LLM/parser |
| **Editor** | Upload/delete files, chat, view citations in assigned workspaces |
| **Viewer** | Chat and view citations only, cannot upload/delete |

### Database Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id VARCHAR(255) UNIQUE,           -- NULL if using built-in auth
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    password_hash VARCHAR(255),                 -- For built-in auth mode
    role VARCHAR(50) DEFAULT 'viewer',          -- system-wide role
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    llm_config JSONB DEFAULT '{}',
    embedding_config JSONB DEFAULT '{}',
    parser_config JSONB DEFAULT '{"primary": "paddleocr", "fallback": "pypdf_fallback"}',
    retrieval_config JSONB DEFAULT '{"mode": "hybrid", "bm25_weight": 0.4, "vector_weight": 0.6, "top_k": 5}',
    storage_quota_mb INTEGER DEFAULT 5000,     -- 5 GB default
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspace_members (
    user_id UUID REFERENCES users(id),
    workspace_id UUID REFERENCES workspaces(id),
    role VARCHAR(50) DEFAULT 'viewer',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id),
    filename VARCHAR(512) NOT NULL,
    storage_key VARCHAR(1024),                  -- MinIO object key
    parsed_storage_key VARCHAR(1024),           -- Parsed JSON in MinIO
    file_size BIGINT,
    mime_type VARCHAR(128),
    total_pages INTEGER,
    parsed_pages INTEGER DEFAULT 0,
    failed_pages INTEGER[] DEFAULT '{}',        -- List of failed page numbers
    total_chunks INTEGER DEFAULT 0,
    indexed_chunks INTEGER DEFAULT 0,
    parsing_status VARCHAR(50) DEFAULT 'received',
    -- received → parsing → parsed → chunking → indexing → ready → partial → error
    parser_used VARCHAR(100),
    coverage FLOAT DEFAULT 0.0,                 -- 0.0 to 1.0
    error_log TEXT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    parsed_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ
);

CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id),
    page_numbers INTEGER[] NOT NULL,            -- Can span pages [36, 37]
    section_heading TEXT,
    content TEXT NOT NULL,
    chunk_type VARCHAR(50),
    token_count INTEGER,
    embedding_id VARCHAR(255),
    es_doc_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id),
    user_id UUID REFERENCES users(id),
    title VARCHAR(512),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    citations JSONB,
    tokens_used INTEGER,
    model_used VARCHAR(128),
    retrieval_time_ms INTEGER,
    generation_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Auth Modes

The system supports two auth modes (configured at deploy time):

**Mode 1: Built-in Auth (simple deployments, <100 users)**
- JWT-based, users stored in PostgreSQL
- Admin creates users via UI
- No external dependencies

**Mode 2: Keycloak (enterprise deployments)**
- OAuth2/OIDC via Keycloak
- LDAP/SAML/Microsoft Entra ID integration
- SSO across all NpuDen services

```yaml
# docker-compose.yml
environment:
  AUTH_MODE: "builtin"    # or "keycloak"
  KEYCLOAK_URL: ""        # only if AUTH_MODE=keycloak
```

---

## 12. Frontend Design (Airbnb-Inspired)

### Design Tokens (from Airbnb design.md)

```css
:root {
  --color-primary: #ff385c;
  --color-primary-active: #e00b41;
  --color-canvas: #ffffff;
  --color-surface-soft: #f7f7f7;
  --color-ink: #222222;
  --color-muted: #6a6a6a;
  --color-hairline: #dddddd;
  --rounded-sm: 8px;
  --rounded-md: 14px;
  --rounded-full: 9999px;
  --font-family: 'Inter', -apple-system, system-ui, sans-serif;
  --shadow-card: rgba(0,0,0,0.02) 0 0 0 1px,
                 rgba(0,0,0,0.04) 0 2px 6px,
                 rgba(0,0,0,0.1) 0 4px 8px;
}
```

### Chat Interface Layout

```
┌──────────────────────────────────────────────────────┐
│ ◁ Workspaces   HR Policies Workspace   👤 Divyesh ▾ │
├──────────────┬───────────────────────┬───────────────┤
│              │                       │               │
│  Document    │     Chat Area         │  PDF Viewer   │
│  Sidebar     │                       │               │
│              │  ┌─────────────────┐  │  ┌─────────┐  │
│  📄 GFR.pdf  │  │ What does       │  │  │         │  │
│    50/50 ✓   │  │ Rule 155 say?   │  │  │  Page   │  │
│  📄 Policy2  │  └─────────────────┘  │  │   36    │  │
│    12/12 ✓   │                       │  │         │  │
│  📄 Manual3  │  Rule 155 states     │  │ [highlighted] │
│    ⚠️ 8/10   │  that procurement... │  │         │  │
│              │  [Page 36] [Page 37] │  │         │  │
│  ┌────────┐  │                       │  └─────────┘  │
│  │+Upload │  │  ┌─────────────────┐  │               │
│  └────────┘  │  │ Ask a question  │  │               │
│              │  └─────────────────┘  │               │
├──────────────┴───────────────────────┴───────────────┤
│  Parser: PaddleOCR │ LLM: qwen3.5:35b │ Mode: Hybrid │
└──────────────────────────────────────────────────────┘
```

---

## 13. Deployment Modes

### Mode 1: Docker Compose (Simple)

For small teams, demos, single-server deployments.

```bash
# GPU server
docker compose --profile gpu up -d

# Apple Silicon Mac
docker compose --profile apple up -d

# CPU-only (cloud LLM)
docker compose --profile cpu up -d
```

### Mode 2: Kubernetes (Enterprise)

For multi-node clusters, HA, auto-scaling.

```yaml
Namespace: npuden-docqa
├── docqa-api          (2-4 replicas, CPU)
├── docqa-frontend     (2 replicas, CPU)
├── docqa-worker       (2-4 replicas, CPU)
├── docqa-parser       (1 replica, GPU or CPU)
├── elasticsearch      (1-3 nodes, CPU + RAM)
├── chromadb           (1 replica, CPU)
├── minio              (1 replica, disk)
├── redis              (1 replica, CPU)
├── postgresql         (1 replica, SSD)

Namespace: auth (if Keycloak mode)
├── keycloak
├── keycloak-db

Namespace: ai-services (if Ollama is used)
├── ollama (GPU)
```

### Mode 3: Helm Chart (One-Command Deploy)

```bash
helm install docqa npuden/docqa \
  --set auth.mode=builtin \
  --set parser.type=paddleocr \
  --set llm.provider=ollama \
  --set llm.model=qwen3.5:35b \
  --set gpu.enabled=true
```

---

## 14. Development Phases

### Phase 1 — Foundation ✅ COMPLETE
**Goal:** Basic chat with documents, multi-user, workspace isolation

- [x] FastAPI project scaffold with JWT auth middleware
- [x] PostgreSQL schema (users, workspaces, documents, chunks, conversations, messages)
- [x] PyPDF-based document parsing pipeline (PDF, DOCX, XLSX, PPTX supported)
- [x] Chunking pipeline with page number tracking
- [x] Dual indexing: PostgreSQL FTS (BM25) + pgvector (semantic)
- [x] Hybrid retrieval with Reciprocal Rank Fusion (RRF)
- [x] LLM generation with page-level citations
- [x] Chat API with SSE (Server-Sent Events) streaming
- [x] MinIO for file storage (original PDFs served to PDF viewer)
- [x] React/Next.js frontend: upload + chat + citation display + PDF viewer
- [x] Workspace isolation — all queries scoped by `workspace_id`
- [x] RBAC: viewer / member / admin roles per workspace
- [x] Admin dashboard: user management, LLM config, workspace management
- [x] Docker Compose for local development
- [x] Kubernetes manifests for production deployment (single-node + GPU)
- [ ] PaddleOCR parser module (Phase 4)
- [ ] Full document coverage verifier (Phase 2)
- [ ] Hardware auto-detection (Phase 2)

**Embedding model in production:** `BAAI/bge-small-en-v1.5` via fastembed — baked into the Docker image, no runtime download needed.  
**LLM in production:** `gemma4:26b` via Ollama on NVIDIA A40 (`nid-practice`).

**Deliverable:** ✅ Working multi-user RAG platform deployed on Kubernetes.

### Phase 2 — Multi-User + Workspaces (Weeks 4-6)
**Goal:** Enterprise workspace isolation, user management

- [ ] Built-in auth (JWT) for simple deployments
- [ ] Keycloak integration for enterprise deployments
- [ ] Workspace CRUD + membership
- [ ] Workspace-scoped everything (docs, chunks, indexes, conversations)
- [ ] Per-workspace parser/LLM/embedding configuration
- [ ] Admin dashboard: user list, workspace list
- [ ] Frontend: workspace switcher, member management

**Deliverable:** Multi-tenant app with data isolation.

### Phase 3 — Enterprise Features (Weeks 7-9)
**Goal:** Production-ready for client deployment

- [ ] LLM provider management UI (add/test/switch providers)
- [ ] In-browser PDF viewer with citation highlights (PDF.js)
- [ ] Document processing progress tracking with coverage display
- [ ] Conversation history and search
- [ ] Admin analytics (queries/day, tokens, docs, coverage stats)
- [ ] RBAC enforcement
- [ ] Rate limiting, storage quotas
- [ ] Kubernetes manifests + Helm chart

**Deliverable:** Client-deployable enterprise product.

### Phase 4 — Advanced RAG + Parser Modules (Weeks 10-12)
**Goal:** Best-in-class retrieval, modular parsing

- [ ] Docling parser module
- [ ] Unstructured parser module
- [ ] Composite parser (route by page type)
- [ ] Parser comparison mode (run two parsers, compare output)
- [ ] PageIndex integration as retrieval mode
- [ ] GraphRAG with Neo4j for complex queries
- [ ] Re-ranking with cross-encoder models
- [ ] Query decomposition for multi-hop questions
- [ ] Multi-document cross-referencing

**Deliverable:** State-of-the-art RAG with pluggable parsers.

### Phase 5 — Scale + Polish (Weeks 13-16)
**Goal:** 10K users, production hardening

- [ ] Milvus migration path for vector store
- [ ] Horizontal scaling guides
- [ ] Audit logging
- [ ] SSO integration (SAML, Microsoft Entra ID)
- [ ] Airbnb design polish (animations, mobile responsive)
- [ ] Helm chart for one-command deployment
- [ ] Documentation: admin guide, user guide, API reference
- [ ] Load testing and benchmarks
- [ ] Apple Silicon optimization (CoreML for PaddleOCR)

**Deliverable:** Production-hardened, scalable, run-anywhere platform.

---

## 15. Competitive Positioning

| Feature | AnythingLLM | Kotaemon | RAGFlow | **NpuDen DocQA** |
|---------|-------------|----------|---------|-----------------|
| Document parsing | Basic PyPDF | Basic PyPDF | DeepDoc | **Modular (PaddleOCR default)** |
| Full doc coverage | ❌ (10/50 pages) | ❌ | ✅ | **✅ with verification** |
| Exact keyword search | ❌ | ✅ (BM25) | ✅ (BM25) | **✅ (BM25 + PageIndex)** |
| Page-level citations | Weak | ✅ | ✅ | **✅ + in-browser PDF** |
| Workspace isolation | ✅ | Partial | ✅ | **✅ + RBAC** |
| Enterprise SSO | ❌ | ❌ | ❌ | **✅ (Keycloak)** |
| Local LLM support | ✅ | ✅ | ✅ | **✅ (Ollama)** |
| Cloud LLM support | ✅ | ✅ | Limited | **✅ (all major)** |
| Runs on Apple Silicon | ❌ | ❌ | ❌ | **✅** |
| Runs CPU-only | Partial | Partial | ❌ | **✅ (cloud LLM)** |
| Parser swappable | ❌ | ❌ | ❌ | **✅ (modular)** |
| UI quality | Basic | Basic | Basic | **Airbnb-grade** |
| Scale (users) | ~100 | ~100 | ~1K | **100–10K** |

---

## 16. File & Folder Structure

```
npuden-docqa/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── hardware.py              # Hardware detection + auto-config
│   │   ├── auth/
│   │   │   ├── builtin.py           # Simple JWT auth
│   │   │   ├── keycloak.py          # Enterprise OIDC
│   │   │   ├── middleware.py
│   │   │   └── rbac.py
│   │   ├── api/
│   │   │   ├── workspaces.py
│   │   │   ├── documents.py
│   │   │   ├── chat.py
│   │   │   ├── admin.py
│   │   │   └── providers.py
│   │   ├── services/
│   │   │   ├── chunker.py
│   │   │   ├── indexer.py
│   │   │   ├── retriever.py
│   │   │   ├── llm_router.py
│   │   │   ├── citation.py
│   │   │   └── coverage.py          # Document coverage verification
│   │   ├── parsers/                  # ★ Pluggable parser modules
│   │   │   ├── interface.py          # DocumentParser ABC
│   │   │   ├── registry.py           # Parser registry
│   │   │   ├── paddleocr.py
│   │   │   ├── docling.py
│   │   │   ├── unstructured.py
│   │   │   ├── pypdf_fallback.py
│   │   │   └── composite.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── workspace.py
│   │   │   ├── document.py
│   │   │   └── conversation.py
│   │   └── workers/
│   │       └── tasks.py
│   ├── Dockerfile
│   ├── Dockerfile.gpu
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── workspaces/
│   │   │   └── [slug]/
│   │   │       ├── chat/page.tsx
│   │   │       ├── files/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── admin/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── CitationBadge.tsx
│   │   │   └── PDFViewer.tsx
│   │   ├── documents/
│   │   │   ├── UploadZone.tsx
│   │   │   ├── DocumentCard.tsx       # Shows coverage badge
│   │   │   └── CoverageIndicator.tsx
│   │   └── workspace/
│   ├── styles/tokens.css
│   └── Dockerfile
├── parser-services/                   # ★ Each parser is its own service
│   ├── paddleocr/
│   │   ├── app.py
│   │   ├── Dockerfile.gpu
│   │   ├── Dockerfile.cpu
│   │   └── Dockerfile.apple
│   ├── docling/
│   │   ├── app.py
│   │   └── Dockerfile
│   └── unstructured/
│       ├── app.py
│       └── Dockerfile
├── k8s/
│   ├── helm/
│   │   └── docqa/
│   │       ├── Chart.yaml
│   │       ├── values.yaml
│   │       └── templates/
│   └── manifests/                     # Raw K8s YAML
├── docker-compose.yml                 # Profiles: gpu, cpu, apple
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

*This document is the blueprint. The product runs anywhere, reads everything, finds anything.*

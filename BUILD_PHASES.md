# NpuDen DocQA — Build Phases

> Companion to `npuden-docqa-architecture-plan-v2.md`.  
> That doc is the **what and why**. This doc is the **how and when** — a practical sub-phase breakdown where each phase ends with something you can run, click, and verify before moving on.

---

## ✅ Phase 0 — Frontend Scaffold (DONE)

**Delivered:**
- Next.js 14 + Tailwind + shadcn/ui + Zustand
- Airbnb design tokens wired (colors, radius, shadow, Inter font)
- Login page (mock auth, any credentials pass)
- 3-column workspace layout: conversation sidebar / chat / tabbed right panel
- DocumentCard with coverage badges (`50/50 ✓`, `48/50 ⚠️`)
- UploadZone drag-and-drop modal
- ChatMessage + CitationBadge components
- Zustand store with realistic mock data

**You can see:** The full UI running at `localhost:3000` with mock data.

---

## Phase 1 — Backend Foundation + Real Auth

**Goal:** Replace the mock login with a real user stored in a real database.  
After this phase the login page calls a real API, JWT is issued, and protected routes work.

### What gets built
- **FastAPI project scaffold** — `backend/app/main.py`, config, CORS middleware
- **PostgreSQL + SQLAlchemy models** — `users`, `workspaces`, `workspace_members` tables
- **Built-in JWT auth** — `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Workspace API** — `GET /api/workspaces`, `POST /api/workspaces`
- **Frontend wired** — login page calls real `/api/auth/login`, JWT stored in `localStorage`, `useStore` hydrates current user, protected route redirect
- **Docker Compose** — `api` + `postgres` services, `.env.example` for local dev

### End-of-phase checkpoint
```
✓ Register a user via API (curl or Postman)
✓ Log in through the UI with real credentials
✓ Header shows your real name from the JWT
✓ Visiting /workspace without a token redirects to /login
✓ docker compose up → everything starts cleanly
```

---

## Phase 2 — File Upload + Storage

**Goal:** Drag a PDF into the UI, hit Upload, and see it appear in the document list with a "received" status badge — stored durably in MinIO.

### What gets built
- **MinIO** added to Docker Compose — S3-compatible object storage
- **Upload endpoint** — `POST /api/workspaces/{id}/documents` (multipart, streams to MinIO)
- **Document metadata** — stored in PostgreSQL (`documents` table), returns `file_id`
- **Status endpoint** — `GET /api/documents/{id}` returns current status + coverage
- **Frontend wired** — UploadZone calls real upload endpoint, document list polls for new docs, coverage badge shows live status

### End-of-phase checkpoint
```
✓ Drag a PDF into the upload modal, click Upload
✓ File appears in the Documents tab with status "received"
✓ File is durably stored in MinIO (browsable at localhost:9001)
✓ Refresh the page — document is still there (real DB, not mock)
```

---

## Phase 3 — Document Parsing Pipeline

**Goal:** Upload a PDF and watch it get parsed page by page — coverage badge counts up to `50/50 ✓` in real time.

### What gets built
- **Celery + Redis** — async task queue for background processing
- **Parser module interface** — `DocumentParser` ABC as designed in architecture doc
- **PaddleOCR parser** — GPU-accelerated when available, CPU fallback
- **PyPDF fallback parser** — zero-dep, always available
- **Coverage verifier** — `parsed_pages == total_pages` check, marks pages that fail
- **Progress WebSocket** — `WS /api/documents/{id}/progress` streams parsing updates to frontend
- **Frontend wired** — DocumentCard shows live progress, coverage badge animates from `0/50` → `50/50 ✓`
- **Docker Compose** — `celery-worker` + `redis` + `parser` services added (GPU and CPU profiles)

### End-of-phase checkpoint
```
✓ Upload GFR-2024.pdf (50 pages)
✓ Status changes: received → parsing → parsed
✓ Coverage badge counts up in real time
✓ Final badge shows 50/50 ✓ in green (or 48/50 ⚠️ with failed page numbers)
✓ docker compose --profile cpu up → works on any machine
```

---

## Phase 4 — Chunking + Indexing

**Goal:** After parsing, the document gets chunked and indexed — ready to be searched.

### What gets built
- **Structure-aware chunker** — respects tables, headings, page boundaries; every chunk carries `page_numbers[]`
- **BM25 index** — LanceDB full-text index for exact keyword search ("Rule 155")
- **Vector index** — ChromaDB with `nomic-embed-text` via Ollama for semantic search
- **Indexing verification** — chunk count matches BM25 count matches vector count
- **Status flow** — `parsed → chunking → indexing → ready`
- **Frontend wired** — DocumentCard shows "180 chunks indexed ✓" in the detail view

### End-of-phase checkpoint
```
✓ Parsed document automatically moves to chunking, then indexing
✓ Badge shows "ready" with chunk count
✓ Can verify BM25 and vector indexes contain the right number of chunks
```

---

## Phase 5 — LLM Chat + Real Citations

**Goal:** Ask a question in the chat, get a real streamed answer with clickable page citations that reference the actual indexed content.

### What gets built
- **LiteLLM integration** — unified gateway: Ollama local (qwen3.5) or cloud (Gemini / Claude / OpenAI)
- **Hybrid retrieval** — BM25 + vector search with Reciprocal Rank Fusion, top-K chunks
- **Chat API** — `POST /api/conversations/{id}/messages` triggers retrieval + generation
- **WebSocket streaming** — `WS /api/conversations/{id}/stream` streams tokens to frontend
- **Citation formatting** — LLM response includes `[Page 36]` markers, backend extracts them into structured `citations[]`
- **Conversation persistence** — messages stored in PostgreSQL `messages` table
- **Frontend wired** — replace mock messages with real API, streaming text appears token by token, citation badges are real page numbers from the indexed doc

### End-of-phase checkpoint
```
✓ Ask "What does Rule 155 say?" in the chat
✓ Response streams in token by token
✓ [Page 36] [Page 37] badges appear at the bottom of the response
✓ Conversation is saved — refresh the page and the history is still there
✓ Works with Ollama local and Gemini cloud (configurable via .env)
```

---

## Phase 6 — PDF.js Viewer

**Goal:** Click a citation badge → the right panel opens the actual PDF at that page with the cited passage highlighted.

### What gets built
- **PDF.js integration** — replaces the skeleton placeholder in the right panel
- **PDF serving endpoint** — `GET /api/documents/{id}/file` streams the original PDF from MinIO
- **Page navigation** — jump to any page, prev/next buttons work
- **Citation highlight** — cited text passages are highlighted on the page using PDF.js text layer
- **Zoom controls** — fit-to-width, fit-to-page, manual zoom

### End-of-phase checkpoint
```
✓ Click [Page 36] → PDF opens at page 36
✓ Cited passage is highlighted in yellow
✓ Can scroll through other pages
✓ Works for all documents in the workspace
```

---

## Later (Phase 3 from architecture doc)

Once the core product works end-to-end:
- Admin dashboard (usage analytics, user management)
- RBAC enforcement (viewer / editor / admin roles)
- Rate limiting + storage quotas
- Keycloak SSO integration
- Kubernetes manifests + Helm chart
- Docling and Unstructured parser modules
- GraphRAG with Neo4j

---

## Quick Reference — Phase Status

| Phase | What you get | Status |
|-------|-------------|--------|
| 0 — Frontend scaffold | Full UI with mock data | ✅ Done |
| 1 — Backend + Auth | Real login, JWT, PostgreSQL | 🔲 Next |
| 2 — File Upload | Upload PDFs to MinIO | 🔲 |
| 3 — Parsing Pipeline | PaddleOCR + coverage badges live | 🔲 |
| 4 — Chunking + Indexing | BM25 + vector, doc marked ready | 🔲 |
| 5 — LLM Chat | Real streamed answers + citations | 🔲 |
| 6 — PDF.js Viewer | Click citation → see the page | 🔲 |

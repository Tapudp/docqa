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
| 1 — Backend + Auth | Real login, JWT, PostgreSQL | ✅ Done |
| 2 — File Upload | Upload PDFs to MinIO | ✅ Done |
| 3 — Parsing Pipeline | pypdf parser + Celery worker | ✅ Done |
| 4 — Chunking + Indexing | pgvector + fastembed, doc marked ready | ✅ Done |
| 5 — LLM Chat | Real streamed answers + filtered citations | ✅ Done |
| 6 — PDF.js Viewer | Click citation → see the page | ✅ Done |
| 7 — LLM / Ollama Settings UI | Admin page: pick model from installed Ollama list | ✅ Done |
| 8 — Team & Member Management | Admin invites users, assigns workspace access | ✅ Done |
| 9 — RBAC + Per-workspace Config | Enforce viewer/member/admin roles, per-workspace LLM | ✅ Done |
| 10 — Admin Bulk Upload | Admin selects a workspace and uploads dozens of docs at once | ✅ Done |

---

## Phase 7 — LLM / Ollama Settings UI

**Goal:** Admin page where you configure which LLM the workspace uses — lists models already installed on the server's Ollama instance so you never need to touch `.env` again.

### What gets built
- **Settings API** — `GET /api/admin/llm/models` calls Ollama's `/api/tags` and returns installed models; `PATCH /api/admin/llm` saves chosen model + provider to DB config
- **Settings page** — `/settings` route (admin only): dropdown of available Ollama models with size + family info, provider switcher (Ollama / OpenAI / Anthropic), save button
- **Runtime config** — LLM client reads model from DB config at request time, so changes take effect immediately without restart

### End-of-phase checkpoint
```
✓ /settings shows list of models installed on the server's Ollama
✓ Selecting a different model and saving changes what the chat uses — no restart
✓ Non-admin users cannot access /settings
```

---

## Phase 8 — Team & Member Management

**Goal:** Admin can create user accounts and assign them to workspaces. New users who register (or are created by admin) are placed in the right workspaces — no manual DB seeding required.

### What gets built
- **Admin: create user** — `POST /api/admin/users` creates a user account with a temporary password; admin sets initial role
- **Workspace membership API** — `POST /api/admin/workspaces/{id}/members` adds a user to a workspace with a role; `DELETE` removes them; `GET` lists current members
- **Settings → Users tab** — admin sees all users, can create new accounts, set global role (admin / member / viewer)
- **Settings → Workspaces tab** — per-workspace member list with add/remove UI; role picker per member
- **Self-registration guard** — optionally disable open registration so only admin-created accounts can log in (config flag in `.env`)

### End-of-phase checkpoint
```
✓ Admin creates a new user account from the Settings page
✓ Admin adds that user to a specific workspace with "member" role
✓ New user logs in and sees only the workspaces they were added to
✓ Removing a user from a workspace immediately revokes their access
✓ A user with no workspace memberships sees an empty state, not an error
```

---

## Phase 9 — RBAC + Per-workspace Config

**Goal:** Enforce what each role can do inside a workspace, and allow each workspace to use a different LLM or embedding model.

### What gets built
- **RBAC enforcement**
  - `viewer` — can chat and view documents, cannot upload or delete
  - `member` — can upload, chat, view; cannot delete other members' docs or manage workspace
  - `admin` (workspace-level) — full control of that workspace including membership
- **Permission dependency** — `require_workspace_role(min_role)` FastAPI dep used on document upload, delete, and workspace management endpoints
- **Per-workspace LLM config** — workspace `llm_config` JSONB is respected by the chat endpoint; falls back to global system config if not set
- **Settings → Workspace config tab** — admin can override LLM provider/model per workspace (useful when one workspace needs GPT-4o and another uses local Ollama)
- **Frontend enforcement** — upload button hidden for viewers; delete button hidden for viewers; settings tab hidden for non-workspace-admins

### End-of-phase checkpoint
```
✓ A "viewer" user cannot see the Upload button or delete documents
✓ A "member" can upload but cannot remove other users from the workspace
✓ Workspace A uses llama3.2 (Ollama), workspace B uses gpt-4o-mini (OpenAI) — both work simultaneously
✓ Per-workspace LLM config overrides global config without affecting other workspaces
```

---

## ✅ Phase 10 — Admin Bulk Upload (DONE)

**Goal:** An admin can select a target workspace and upload a large batch of documents in one operation — dozens of files at once. Each file is queued, parsed, and indexed independently so a single large file can't block the rest.

### What gets built

- **Bulk upload UI** — dedicated modal (or settings page section) accessible to admins only. Workspace picker at the top so admin can target any workspace without switching to it first.
- **Multi-file staging** — drag-and-drop a folder or select many files at once (`multiple` + directory pick). Each file shown as a row with name, size, and per-file status.
- **Sequential upload with live progress** — files are uploaded one at a time (avoids saturating the backend). Each row shows its own status: `queued → uploading → parsing → indexing → ready`. Admin can add more files to the queue while earlier ones are still processing.
- **Per-file error handling** — a file that fails (bad format, size over 200 MB, parse error) is marked red with the error message inline. The rest of the batch continues unaffected.
- **ZIP extraction** — if admin drops a `.zip` archive, the backend extracts it server-side and enqueues each contained document individually. Useful for bulk handoffs of document folders.
- **Duplicate detection** — before uploading, check if a file with the same name already exists in the target workspace. Warn the admin; they can choose to skip or overwrite.
- **Backend guard** — bulk upload endpoint still enforces the per-file 200 MB limit and supported MIME types. Celery handles each file as a separate task so the queue scales naturally.

### What stays the same

- Parsing, chunking, and indexing pipelines are unchanged — each document goes through the exact same path as a single upload.
- The Celery worker concurrency setting controls how many files are processed simultaneously.

### End-of-phase checkpoint
```
✓ Admin drops 30 PDFs into the bulk upload modal targeting "Legal Documents" workspace
✓ Each file uploads and moves through queued → parsing → ready independently
✓ One oversized file (> 200 MB) shows an error inline; the other 29 complete normally
✓ Dropping a .zip extracts and enqueues all contained documents automatically
✓ A non-admin user cannot access the bulk upload UI or endpoint
✓ Duplicate filename shows a warning before upload — admin can skip or proceed
```

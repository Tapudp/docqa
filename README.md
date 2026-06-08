# NpuDen DocQA

**Enterprise RAG platform. Upload your documents, ask questions, get cited answers — on your own infrastructure.**

Built for teams that can't send sensitive documents to a third-party API. Runs entirely on-prem with Ollama, or wires to OpenAI/Groq/Together.ai when you need cloud scale. Every answer comes with page-level citations you can click to verify in the original PDF.

---

## What it does

- **Document ingestion** — drag-and-drop PDFs, Word docs, spreadsheets, images. Background workers parse and index every page automatically. Maximum file size is **200 MB per file**.
- **Hybrid retrieval** — BM25 keyword search fused with pgvector semantic search via Reciprocal Rank Fusion. Best of both worlds, no tuning required.
- **Streamed answers** — responses stream token-by-token with citations embedded. Click a citation to jump to the exact page in the built-in PDF viewer.
- **Multi-workspace** — full workspace isolation. Documents, conversations, and access controls are scoped per workspace. Users can be members of multiple workspaces.
- **RBAC** — three workspace roles: `viewer` (chat + read), `member` (upload + delete), `admin` (full control including membership). Enforced at the API level.
- **Configurable LLM** — global LLM config via the admin settings page. Per-workspace overrides let one workspace use local Ollama while another uses GPT-4o.
- **Admin tools** — create users, assign workspace membership, delete conversations, configure LLM settings. No database console required.

---

## Architecture

```
Browser (Next.js 14)
    │
    ▼
FastAPI  ─── PostgreSQL 16 + pgvector  (users, docs, chunks, conversations)
    │    └── MinIO                     (raw PDF storage)
    │    └── Redis + Celery            (async parse/index pipeline)
    │
    ├── Parse pipeline: pypdf → structured chunks → pgvector embeddings (fastembed)
    ├── Retrieval:      BM25 (pg full-text) + vector cosine → RRF fusion
    └── LLM:           LiteLLM gateway → Ollama / OpenAI / Groq / Together.ai
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Zustand, inline CSS variables |
| Backend | FastAPI, async SQLAlchemy 2.0, asyncpg, Pydantic v2 |
| Database | PostgreSQL 16 + pgvector extension |
| Storage | MinIO (S3-compatible) |
| Queue | Celery + Redis |
| Embeddings | fastembed (`nomic-embed-text`) — runs in-process, no separate service |
| LLM gateway | LiteLLM — supports Ollama, OpenAI, Anthropic-compatible APIs |
| PDF viewer | react-pdf v7 (pdfjs-dist v3) |
| Auth | JWT (HS256), bcrypt password hashing |
| Infrastructure | Docker Compose — single `docker compose up` for all backend services |

---

## Quick start

See [DEPLOY.md](./DEPLOY.md) for the full setup guide. Short version:

```bash
# 1. Clone
git clone <repo-url> DocQA && cd DocQA

# 2. Configure
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET and LLM_BASE_URL at minimum

# 3. Pull a model
ollama pull llama3.2

# 4. Start backend services
docker compose up -d

# 5. Start frontend
cd frontend && npm install && npm run dev

# 6. Open http://localhost:3000
# First account you create becomes admin.
```

---

## Project layout

```
DocQA/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers (auth, chat, documents, admin, workspaces)
│   │   ├── auth/         # JWT + deps (get_current_user, require_admin, require_workspace_role)
│   │   ├── llm/          # LiteLLM client wrapper
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── retrieval/    # Hybrid search (BM25 + vector + RRF)
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── storage/      # MinIO client
│   │   └── worker/       # Celery tasks (parse, chunk, index)
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── (app)/workspace/   # Main 3-column workspace UI
│   │   ├── (app)/settings/    # Admin settings (LLM, users, workspaces, RBAC)
│   │   └── login/
│   ├── components/
│   │   ├── chat/              # ChatMessage, CitationBadge
│   │   ├── documents/         # DocumentCard, PDFViewer, UploadZone
│   │   └── layout/            # Sidebar, PDFViewerPanel
│   └── lib/                   # Zustand store, API client, types
├── docker-compose.yml
├── BUILD_PHASES.md            # Phase-by-phase build history
└── DEPLOY.md                  # Setup and deployment guide
```

---

## API reference

Full interactive docs at `http://localhost:8000/docs` once the backend is running.

Key endpoints:

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/workspaces
POST   /api/workspaces

POST   /api/workspaces/{id}/documents       # upload (min: member)
GET    /api/workspaces/{id}/documents
DELETE /api/documents/{id}                  # (min: member)
GET    /api/documents/{id}/file             # auth-gated PDF stream

POST   /api/workspaces/{id}/conversations
GET    /api/workspaces/{id}/conversations
POST   /api/conversations/{id}/chat         # SSE streaming response
DELETE /api/conversations/{id}              # admin or owner

GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/llm/config
PATCH  /api/admin/llm/config
GET    /api/admin/workspaces/{id}/members
POST   /api/admin/workspaces/{id}/members
GET    /api/admin/workspaces/{id}/llm       # per-workspace LLM override
PATCH  /api/admin/workspaces/{id}/llm
```

---

## Configuration reference

All backend config is set in `backend/.env`. See [DEPLOY.md](./DEPLOY.md) for the full reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *(change this)* | Secret key for JWT signing — use 64+ random chars in production |
| `LLM_PROVIDER` | `ollama` | `ollama`, `openai`, or any OpenAI-compatible provider |
| `LLM_BASE_URL` | `http://host.docker.internal:11434` | Ollama host, or provider base URL |
| `LLM_MODEL` | `llama3.2` | Model name — must be pulled in Ollama or valid for the provider |
| `LLM_API_KEY` | *(empty)* | Required for OpenAI / Groq / Together.ai |
| `ALLOW_REGISTRATION` | `true` | Set `false` to require admin-created accounts only |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO root user — change in production |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO root password — change in production |

### Limits

| Limit | Value |
|-------|-------|
| Max file size | 200 MB per file |
| Supported formats | PDF, DOCX, XLSX, PPTX, PNG, JPG, TIFF |
| JWT expiry | 7 days (configurable via `JWT_EXPIRY_DAYS`) |
| Retrieval top-K | 5 chunks per query (configurable per workspace via `retrieval_config`) |

---

## Build history

See [BUILD_PHASES.md](./BUILD_PHASES.md) for a full phase-by-phase breakdown of what was built and when.

| Phase | Summary |
|-------|---------|
| 0 | Frontend scaffold — 3-column layout, mock data, design system |
| 1 | Backend + real auth — FastAPI, PostgreSQL, JWT |
| 2 | File upload — MinIO storage, document metadata |
| 3 | Parsing pipeline — pypdf, Celery, page coverage tracking |
| 4 | Chunking + indexing — pgvector, fastembed, hybrid retrieval |
| 5 | LLM chat — streaming SSE, citations, conversation history |
| 6 | PDF viewer — react-pdf, auth-gated file serving, page navigation |
| 7 | Admin LLM settings — configure provider/model from the UI, no restart |
| 8 | Team management — admin creates users, assigns workspace access |
| 9 | RBAC + per-workspace config — role enforcement, per-workspace LLM override |

---

## License

MIT

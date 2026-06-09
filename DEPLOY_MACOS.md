# NpuDen DocQA — Local Development on macOS

Run the full stack on your MacBook for development. Infrastructure (Postgres, Redis, MinIO) runs in Docker Desktop. The backend and frontend run natively so you get hot reload.

> For production Kubernetes deployment on `nid-practice`, see [DEPLOY_K8S.md](./DEPLOY_K8S.md).  
> For Docker Compose on a Linux server, see [DEPLOY.md](./DEPLOY.md).

---

## Prerequisites

Install these once:

```bash
# Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Python 3.12
brew install python@3.12

# Node 20
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Ollama — local LLM inference (native, uses Apple Metal GPU)
brew install ollama

# Docker Desktop — for Postgres, Redis, MinIO
# Download from https://www.docker.com/products/docker-desktop/
# Or via brew:
brew install --cask docker
```

Verify:
```bash
python3.12 --version   # Python 3.12.x
node --version         # v20.x.x
ollama --version       # ollama version x.x.x
docker --version       # Docker version 24+
```

---

## 1. Clone the repo

```bash
git clone git@github.com:Tapudp/docqa.git
cd docqa
```

---

## 2. Start Ollama and pull a model

Ollama runs natively on macOS and uses Apple Metal for GPU acceleration on M-series chips.

```bash
# Start Ollama (runs in the background)
ollama serve &

# Pull a model — pick based on your Mac's RAM:
ollama pull llama3.2          # 3B — ~2 GB RAM, fast, good for dev
ollama pull llama3.1:8b       # 8B — ~5 GB RAM, better quality
ollama pull qwen2.5:7b        # 7B — ~5 GB RAM, strong on documents
```

For M1/M2/M3 Pro or Max with 32+ GB RAM you can run:
```bash
ollama pull qwen2.5:14b       # 14B — ~9 GB RAM, production-quality
```

Note which model you pulled — you'll set it in `.env` below.

---

## 3. Start infrastructure services

Docker Compose runs Postgres, Redis, and MinIO. Open Docker Desktop first, then:

```bash
# From the repo root — starts only the infra services, not the API or workers
docker compose up -d postgres redis minio
```

Wait for all three to show `healthy`:
```bash
docker compose ps
```

Expected output:
```
NAME              STATUS
docqa-postgres-1  Up (healthy)
docqa-redis-1     Up (healthy)
docqa-minio-1     Up (healthy)
```

Create the MinIO bucket (one-time):
```bash
docker compose run --rm minio \
  mc alias set local http://minio:9000 minioadmin minioadmin \
  && mc mb local/docqa
```

If you get "bucket already exists" that's fine — it was created previously.

---

## 4. Configure the backend

```bash
cd backend
```

Create `backend/.env`:

```env
# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://docqa:docqa@localhost:5432/docqa

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── MinIO (S3-compatible object storage) ─────────────────────
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=docqa
MINIO_SECURE=false

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET=change-me-to-a-random-64-char-string-for-production
ALLOW_REGISTRATION=true

# ── LLM ──────────────────────────────────────────────────────
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2          # ← match whichever model you pulled
LLM_API_KEY=

# ── App ──────────────────────────────────────────────────────
APP_NAME=NpuDen DocQA
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 5. Run the backend

```bash
# From the backend/ directory

# Create a virtual environment (first time only)
python3.12 -m venv .venv
source .venv/bin/activate

# Install dependencies (first time, or after requirements.txt changes)
pip install -r requirements.txt

# Start the API with hot reload
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API auto-migrates the database on startup. You should see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Verify:
```bash
curl http://localhost:8000/health
# {"status": "ok", "service": "NpuDen DocQA"}
```

### Start the Celery worker (separate terminal)

Document uploads are processed asynchronously by Celery. Open a new terminal:

```bash
cd backend
source .venv/bin/activate

celery -A app.worker.celery_app worker --loglevel=info -Q default --concurrency 2
```

Without the worker running, uploaded documents will stay in `indexing` status indefinitely.

---

## 6. Run the frontend

Open another terminal:

```bash
cd frontend
npm install    # first time only

# Set the API URL — points to your local backend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

The frontend runs at **http://localhost:3000**.

---

## 7. First login

Open http://localhost:3000 in your browser. The **first account registered becomes admin** automatically. After registering, you can:

- Create workspaces
- Upload PDFs
- Ask questions via chat
- Manage users from the Settings page

---

## Daily workflow

```bash
# Terminal 1 — infra (keep running)
docker compose up -d postgres redis minio

# Terminal 2 — backend API
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3 — celery worker
cd backend && source .venv/bin/activate
celery -A app.worker.celery_app worker --loglevel=info -Q default --concurrency 2

# Terminal 4 — frontend
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev

# Ollama (if not already running)
ollama serve
```

---

## Embedding model

The backend uses `BAAI/bge-small-en-v1.5` via [fastembed](https://github.com/qdrant/fastembed) for query and document embeddings. It downloads automatically (~130 MB) on the first run and is cached at `~/.cache/fastembed/`. No configuration needed — it runs on CPU and is fast enough for development.

---

## Switching to a cloud LLM

If you don't want to run Ollama locally, switch to a cloud provider in `backend/.env`:

```env
# OpenAI
LLM_PROVIDER=openai
LLM_BASE_URL=
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...

# Groq (fast, free tier available)
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=gsk_...
```

Then restart the API: `Ctrl+C` and re-run `uvicorn ...`.

---

## Useful commands

```bash
# View Postgres data in the browser (optional)
docker compose --profile tools up -d adminer
# Then open http://localhost:8080
# Server: postgres, User: docqa, Password: docqa, Database: docqa

# Reset everything (wipe all data and volumes)
docker compose down -v

# Backup Postgres
docker compose exec postgres pg_dump -U docqa docqa > backup.sql

# Tail API logs (if running via Docker Compose instead of natively)
docker compose logs api -f

# See what's in MinIO
open http://localhost:9001  # minioadmin / minioadmin
```

---

## Troubleshooting

**`uvicorn` can't connect to Postgres / Redis / MinIO**  
Make sure Docker Desktop is running and `docker compose ps` shows all three infra services as `healthy`. The ports `5432`, `6379`, `9000` must be available on `localhost`.

**First document upload stays in "indexing" status forever**  
The Celery worker isn't running. Start it in a separate terminal (Step 5 above).

**Chat always says "Thinking..." and never responds**  
Check that Ollama is running (`ollama list` should show your pulled model) and that `LLM_MODEL` in `backend/.env` matches exactly what Ollama has.

**fastembed model downloads every time**  
The model caches at `~/.cache/fastembed/`. If this directory is missing or permissions are wrong, it re-downloads. Check: `ls ~/.cache/fastembed/`.

**Port 8000 already in use**  
Another process is using port 8000. Find it: `lsof -i :8000` and kill it, or run uvicorn on a different port and update `NEXT_PUBLIC_API_URL`.

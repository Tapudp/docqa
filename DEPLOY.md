# NpuDen DocQA — Deployment Guide

Deploy the full stack on any Linux server (or your local Mac) with Docker and Ollama.

---

## What runs where

| Service | Description | Port |
|---------|-------------|------|
| `api` | FastAPI backend | 8000 |
| `postgres` | PostgreSQL 16 + pgvector | 5432 |
| `minio` | Object storage (PDFs) | 9000 / 9001 |
| `redis` | Celery task queue | 6379 |
| `celery-worker` | Background parser + indexer | — |
| `adminer` *(optional)* | DB browser — start with `--profile tools` | 8080 |
| Next.js frontend | Runs **outside** Docker — `npm run dev` | 3000 |
| Ollama | LLM inference — runs on **host**, not in Docker | 11434 |

> The frontend is intentionally excluded from Docker Compose so hot-reload stays fast during development. In production, build it with `npm run build && npm start` or deploy to Vercel.

---

## Prerequisites

### Every server needs
- Docker Engine 24+ and Docker Compose v2 (`docker compose` not `docker-compose`)
- Git
- 4 GB RAM minimum (8 GB recommended for 7B models)

### For local Mac dev
```bash
brew install ollama
```

### For Linux servers
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

---

## 1. Clone and configure

```bash
git clone <your-repo-url> DocQA
cd DocQA
cp backend/.env.example backend/.env
```

Edit `backend/.env` — the only required changes are:

```env
# Strong secret for JWT signing — change this
JWT_SECRET=change-me-to-something-random-64-chars

# Ollama host
# Mac/local:  http://host.docker.internal:11434
# Linux:      http://172.17.0.1:11434  (Docker bridge gateway)
LLM_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=llama3.2

# MinIO credentials (change in production)
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

---

## 2. Start Ollama and pull a model

```bash
# Start the Ollama server (runs on host, not in Docker)
ollama serve &

# Pull the model you want — pick one:
ollama pull llama3.2        # 3B — fast, good for most tasks (~2 GB)
ollama pull llama3.1:8b     # 8B — better quality (~5 GB)
ollama pull qwen2.5:7b      # 7B — strong multilingual (~5 GB)
```

Set `LLM_MODEL` in `backend/.env` to match whichever model you pulled.

---

## 3. Start the frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

---

## 4. Start all Docker services

```bash
docker compose up -d
```

First run downloads images and builds the backend (~5 min). Subsequent starts are fast.

**Verify everything is healthy:**
```bash
docker compose ps
# All services should show "healthy" or "running"

curl http://localhost:8000/health
# {"status": "ok", "service": "NpuDen DocQA"}
```

---

## 5. Access the app

| Interface | URL |
|-----------|-----|
| App (frontend) | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (minioadmin / minioadmin) |
| Adminer (DB) | http://localhost:8080 *(start with `--profile tools`)* |

**First run:** register at http://localhost:3000/login — the very first account created becomes admin automatically.

---

## User management

### Open registration (default)
Anyone who can reach the app can self-register. Fine for internal deployments behind a firewall.

### Closed registration (admin-invite only)
Set in `backend/.env`:

```env
ALLOW_REGISTRATION=false
```

When disabled, only accounts created by an admin via **Settings → Users** can log in. Attempting to self-register returns a 403.

The admin can then:
1. Create user accounts in the Settings page
2. Assign each user to one or more workspaces with a role (`viewer`, `member`, or `admin`)

### Workspace roles

| Role | Can chat | Can upload | Can delete docs | Can manage workspace |
|------|----------|------------|-----------------|----------------------|
| `viewer` | ✓ | — | — | — |
| `member` | ✓ | ✓ | ✓ | — |
| `admin` *(workspace-level)* | ✓ | ✓ | ✓ | ✓ |

---

## Per-workspace LLM override

Each workspace can use a different LLM than the global default. Set it in **Settings → Workspaces & Members → [workspace] → LLM Override**. Leave the override empty to inherit the global config.

---

## Deploying to a new server

### Copy these files to the server
```
DocQA/
  backend/
    .env                  ← your production env file
  docker-compose.yml
  frontend/               ← only needed if running frontend from same host
```

Or just `git clone` the repo on the server and create `backend/.env` fresh.

### Linux-specific: Ollama host address

On Linux, Docker containers can't use `host.docker.internal`. Use the Docker bridge IP instead:

```bash
# Find your Docker bridge IP
ip route | grep docker0 | awk '{print $9}'
# Usually 172.17.0.1
```

Set in `backend/.env`:
```env
LLM_BASE_URL=http://172.17.0.1:11434
```

Or add `extra_hosts` to the `api` and `celery-worker` services in `docker-compose.yml`:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
This makes `host.docker.internal` work on Linux too — then no env change needed.

### GPU acceleration (NVIDIA)

Install the NVIDIA Container Toolkit, then update Ollama's systemd service to expose GPU:
```bash
sudo systemctl edit ollama
# Add:
# [Service]
# Environment="OLLAMA_ORIGINS=*"
```

Ollama auto-detects CUDA — no config needed in DocQA.

---

## Switching LLM providers

The LLM client uses the OpenAI wire format. Change `backend/.env` and restart the API:

```env
# Ollama (local/on-prem, default)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=llama3.2
LLM_API_KEY=

# OpenAI
LLM_PROVIDER=openai
LLM_BASE_URL=
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...

# Any OpenAI-compatible API (Together.ai, Groq, Fireworks, etc.)
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=gsk_...
```

```bash
docker compose restart api
```

> **Note:** Anthropic's native API is not OpenAI-compatible and is not yet supported. Use Groq or Together.ai to run Claude-class open models in the cloud.

---

## Useful commands

```bash
# View logs
docker compose logs api -f
docker compose logs celery-worker -f

# Restart a single service
docker compose restart api

# Full rebuild after code changes
docker compose up --build -d

# Stop everything (keeps data volumes)
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v
```

---

## File size limits

| Upload path | Limit |
|-------------|-------|
| Regular upload (member/admin) | 200 MB per file |
| Admin bulk upload (individual or inside ZIP) | 10 GB per file |

**nginx in production:** if you put nginx in front of the API, set `client_max_body_size 10g;` in the server block, otherwise nginx will reject large bulk uploads with HTTP 413 before they reach FastAPI.

---

## Data persistence

All data lives in named Docker volumes:

| Volume | Contains |
|--------|----------|
| `postgres_data` | Users, workspaces, documents, chunks, conversations |
| `minio_data` | Uploaded PDF files |
| `fastembed_cache` | Downloaded embedding model (~90 MB, auto-cached) |

Volumes survive `docker compose down`. Only `docker compose down -v` deletes them.

**Backup:**
```bash
# Backup postgres
docker compose exec postgres pg_dump -U docqa docqa > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U docqa docqa
```

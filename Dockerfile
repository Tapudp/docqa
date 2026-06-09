# ─────────────────────────────────────────────────────────────────────────────
# DocQA — root Dockerfile
# Two named targets, one file.
#
#   Build API image (also used for celery-worker):
#     docker build --target api -t ghcr.io/tapudp/docqa-api:latest .
#
#   Build frontend image:
#     docker build --target frontend \
#       --build-arg NEXT_PUBLIC_API_URL=http://api.docqa.nid.local \
#       -t ghcr.io/tapudp/docqa-frontend:latest .
#
#   Build both at once (Docker Buildx):
#     docker buildx bake
# ─────────────────────────────────────────────────────────────────────────────


# ═══════════════════════════════════════════════════════════════
# TARGET: api
# FastAPI backend — also used as the celery-worker image
# (different CMD passed via Kubernetes Deployment spec)
# ═══════════════════════════════════════════════════════════════
FROM python:3.12-slim AS api

WORKDIR /app

# Install system deps needed by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
  && rm -rf /var/lib/apt/lists/*

# Deps first — better layer caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]


# ═══════════════════════════════════════════════════════════════
# TARGET: frontend-deps
# Installs only production node_modules (reused in final stage)
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend-deps

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --omit=dev


# ═══════════════════════════════════════════════════════════════
# TARGET: frontend-builder
# Full install + next build
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .

# NEXT_PUBLIC_* vars are inlined at build time — pass the real
# API hostname when running docker build:
#   --build-arg NEXT_PUBLIC_API_URL=http://api.docqa.nid.local
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build


# ═══════════════════════════════════════════════════════════════
# TARGET: frontend
# Minimal runtime image — no dev deps, no source files
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend

WORKDIR /app
ENV NODE_ENV=production

COPY --from=frontend-builder /app/.next      ./.next
COPY --from=frontend-builder /app/package*.json ./
COPY --from=frontend-deps    /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]

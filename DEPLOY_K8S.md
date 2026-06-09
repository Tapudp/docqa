# NpuDen DocQA — Kubernetes Deployment Guide
# Target server: nid-practice · 64 cores · 756 GB RAM · Nvidia A40

> **What's different from DEPLOY.md?**  
> `DEPLOY.md` covers Docker Compose (local dev / single Linux server).  
> This guide deploys every service as a Kubernetes workload in your existing cluster,  
> and wires into the Ollama pod already running in the `ai-services` namespace.

---

## Your server at a glance

| | |
|---|---|
| Node | `nid-practice` |
| Node IP | `172.16.200.116` |
| CPU | 64 cores |
| RAM | 756 GB |
| GPU | Nvidia A40 — 48 GB VRAM |
| Ollama pod | `ollama-5dccdd8658-6w2tm` in namespace `ai-services` |
| Ollama endpoint | `http://ollama.ai-services.svc.cluster.local:11434` |
| Repo | `git@github.com:Tapudp/docqa.git` |

**Active model on this server:** `gemma4:26b` (17 GB — already pulled, confirmed running).  
Other options for A40: `qwen2.5:32b` (~20 GB), `llama3.1:70b` (~40 GB).

---

## Overview — what gets deployed

| Workload | Image | Namespace |
|----------|-------|-----------|
| `postgres` | `pgvector/pgvector:pg16` | `docqa` |
| `redis` | `redis:7-alpine` | `docqa` |
| `minio` | `minio/minio:latest` | `docqa` |
| `api` | `docker.io/library/docqa-api:latest` *(local, no registry)* | `docqa` |
| `celery-worker` | `docker.io/library/docqa-api:latest` *(local, no registry)* | `docqa` |
| `frontend` | `docker.io/library/docqa-frontend:latest` *(local, no registry)* | `docqa` |
| `ollama` | already running | `ai-services` |

Images are built directly on the server with Docker and imported into containerd — no registry needed.

**Access URLs (once deployed):**
- Frontend: `http://172.16.200.116:30300`
- API: `http://172.16.200.116:30800`

---

## Step 1 — Expose Ollama as a stable Service ✅ Done

Pod IP (`172.16.200.116`) changes on restarts — a ClusterIP Service makes the address stable.

**Confirmed:** pod label is `app=ollama`, service created, endpoint verified:

```
NAME     ENDPOINTS              AGE
ollama   172.16.200.116:11434   ✓
```

The Ollama URL for DocQA config:
```
http://ollama.ai-services.svc.cluster.local:11434
```

If you ever need to recreate this service:

```bash
cat <<'EOF' > /tmp/ollama-svc.yaml
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: ai-services
spec:
  selector:
    app: ollama
  ports:
    - port: 11434
      targetPort: 11434
  type: ClusterIP
EOF
kubectl apply -f /tmp/ollama-svc.yaml
kubectl get endpoints ollama -n ai-services
```

---

## Step 2 — Model ✅ Done

`gemma4:26b` is already pulled (17 GB, confirmed on this server). No action needed.

```bash
# Verify anytime:
kubectl exec -it ollama-5dccdd8658-6w2tm -n ai-services -- ollama list
```

To pull additional models later:
```bash
kubectl exec -it ollama-5dccdd8658-6w2tm -n ai-services -- ollama pull llama3.1:70b
```

---

## Step 3 — Clone repo and build images on the server

No container registry needed. Build directly on the server with Docker, then import into containerd so Kubernetes can use them with `imagePullPolicy: Never`.

### 3a. Set up SSH access for GitHub (one-time)

```bash
# Generate a deploy key
ssh-keygen -t ed25519 -C "nid-practice-deploy" -f ~/.ssh/id_ed25519 -N ""

# Print the public key — copy this entire output
cat ~/.ssh/id_ed25519.pub
```

Go to **github.com → Settings → SSH and GPG keys → New SSH key**:
- Title: `nid-practice`
- Key type: **Authentication key**
- Paste the output from `cat ~/.ssh/id_ed25519.pub`

```bash
# Verify it works
ssh -T git@github.com
# Expected: Hi Tapudp! You've successfully authenticated...
```

### 3b. Clone and build

```bash
git clone git@github.com:Tapudp/docqa.git && cd docqa

# API image — also used for the celery-worker pods
docker build --target api -t docqa-api:latest .

# Frontend — NEXT_PUBLIC_API_URL is baked into the JS bundle at build time
# It must match what the browser uses to reach the API
docker build --target frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://172.16.200.116:30800 \
  -t docqa-frontend:latest .
```

> First build takes ~10 min (downloading base images + installing packages). Subsequent rebuilds are fast thanks to Docker layer caching.

### 3c. Import into containerd

Kubernetes uses containerd, not the Docker daemon. Import both images into the `k8s.io` namespace so Kubernetes can find them.

```bash
docker save docqa-api:latest      | sudo ctr -n k8s.io images import -
docker save docqa-frontend:latest | sudo ctr -n k8s.io images import -

# Verify both are present
sudo ctr -n k8s.io images ls | grep docqa
```

Expected output:
```
docker.io/library/docqa-api:latest        ...
docker.io/library/docqa-frontend:latest   ...
```

> containerd prefixes unqualified names with `docker.io/library/`. The Kubernetes manifests below use `docker.io/library/docqa-api:latest` to match exactly.

---

## Step 4 — Generate a JWT secret

```bash
openssl rand -hex 32
# → copy the 64-character output, paste it into the Secret below
```

---

## Step 5 — Apply all Kubernetes manifests

Save the following as `docqa-k8s.yaml` and apply it.

```bash
cat <<'EOF' > /tmp/docqa-k8s.yaml
# ── Namespace ─────────────────────────────────────────────────
apiVersion: v1
kind: Namespace
metadata:
  name: docqa

---
# ── Secret — sensitive values ─────────────────────────────────
# Replace JWT_SECRET with the output of: openssl rand -hex 32
apiVersion: v1
kind: Secret
metadata:
  name: docqa-secrets
  namespace: docqa
type: Opaque
stringData:
  JWT_SECRET: "REPLACE_WITH_64_CHAR_RANDOM_STRING"
  POSTGRES_PASSWORD: "docqa_prod_password"
  MINIO_ACCESS_KEY: "minioadmin"
  MINIO_SECRET_KEY: "minioadmin_secret"

---
# ── ConfigMap — non-secret env ────────────────────────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: docqa-config
  namespace: docqa
data:
  DATABASE_URL: "postgresql+asyncpg://docqa:docqa_prod_password@postgres:5432/docqa"
  REDIS_URL: "redis://redis:6379/0"
  MINIO_ENDPOINT: "minio:9000"
  MINIO_BUCKET: "docqa"
  LLM_PROVIDER: "ollama"
  LLM_BASE_URL: "http://ollama.ai-services.svc.cluster.local:11434"
  LLM_MODEL: "gemma4:26b"
  LLM_API_KEY: ""
  ALLOW_REGISTRATION: "true"
  APP_NAME: "NpuDen DocQA"
  CORS_ORIGINS: '["http://172.16.200.116:30300","http://localhost:3000"]'

---
# ── PersistentVolumeClaims ────────────────────────────────────
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: docqa
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 50Gi

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: minio-data
  namespace: docqa
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 200Gi

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: fastembed-cache
  namespace: docqa
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi

---
# ── PostgreSQL ────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: docqa
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: postgres
          image: pgvector/pgvector:pg16
          env:
            - name: POSTGRES_USER
              value: docqa
            - name: POSTGRES_DB
              value: docqa
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: docqa-secrets
                  key: POSTGRES_PASSWORD
          ports:
            - containerPort: 5432
          resources:
            requests:
              cpu: "2"
              memory: 4Gi
            limits:
              cpu: "4"
              memory: 8Gi
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "docqa"]
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: postgres-data

---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: docqa
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432

---
# ── Redis ─────────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: docqa
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          resources:
            requests:
              cpu: "0.5"
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 3
            periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: docqa
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379

---
# ── MinIO ─────────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  namespace: docqa
spec:
  replicas: 1
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: minio
          image: minio/minio:latest
          command: ["server", "/data", "--console-address", ":9001"]
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: docqa-secrets
                  key: MINIO_ACCESS_KEY
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: docqa-secrets
                  key: MINIO_SECRET_KEY
          ports:
            - containerPort: 9000
            - containerPort: 9001
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 8Gi
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /minio/health/ready
              port: 9000
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: minio-data

---
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: docqa
spec:
  selector:
    app: minio
  ports:
    - name: api
      port: 9000
      targetPort: 9000
    - name: console
      port: 9001
      targetPort: 9001

---
# ── FastAPI backend ───────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: docqa
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: api
          image: docker.io/library/docqa-api:latest
          imagePullPolicy: Never
          command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
          envFrom:
            - configMapRef:
                name: docqa-config
            - secretRef:
                name: docqa-secrets
          ports:
            - containerPort: 8000
          resources:
            requests:
              cpu: "4"
              memory: 8Gi
            limits:
              cpu: "8"
              memory: 16Gi
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: docqa
spec:
  type: NodePort
  selector:
    app: api
  ports:
    - port: 8000
      targetPort: 8000
      nodePort: 30800

---
# ── Celery worker ─────────────────────────────────────────────
# Scale replicas to process multiple documents in parallel
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-worker
  namespace: docqa
spec:
  replicas: 4           # 4 workers × 1 concurrency = 4 parallel parse jobs
  selector:
    matchLabels:
      app: celery-worker
  template:
    metadata:
      labels:
        app: celery-worker
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: worker
          image: docker.io/library/docqa-api:latest
          imagePullPolicy: Never
          command:
            - celery
            - -A
            - app.worker.celery_app
            - worker
            - --loglevel=info
            - -Q
            - default
            - --concurrency
            - "1"
          envFrom:
            - configMapRef:
                name: docqa-config
            - secretRef:
                name: docqa-secrets
          resources:
            requests:
              cpu: "4"
              memory: 8Gi
            limits:
              cpu: "8"
              memory: 16Gi
          volumeMounts:
            - name: fastembed-cache
              mountPath: /root/.cache/fastembed
      volumes:
        - name: fastembed-cache
          persistentVolumeClaim:
            claimName: fastembed-cache

---
# ── Next.js frontend ──────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: docqa
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      nodeSelector:
        kubernetes.io/hostname: nid-practice
      containers:
        - name: frontend
          image: docker.io/library/docqa-frontend:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: "1"
              memory: 1Gi
            limits:
              cpu: "2"
              memory: 2Gi
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: docqa
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30300
EOF
kubectl apply -f /tmp/docqa-k8s.yaml
```

---

## Step 6 — First-run setup

Wait for all pods to be Running:

```bash
kubectl get pods -n docqa -w
```

Then create the MinIO bucket (only needed once):

```bash
kubectl run minio-init --image=minio/mc --restart=Never --rm -it -n docqa -- \
  sh -c "mc alias set local http://minio:9000 minioadmin minioadmin_secret && mc mb local/docqa"
```

Verify the API is up:

```bash
kubectl exec -n docqa deploy/api -- curl -s http://localhost:8000/health
# {"status": "ok", "service": "NpuDen DocQA"}
```

---

## Step 7 — Register the first admin

Open the frontend in your browser:
```
http://172.16.200.116:30300
```

The **first account registered becomes admin** automatically. After that, set `ALLOW_REGISTRATION=false` in the ConfigMap if you want invite-only access.

---

## Step 8 — Verify Ollama is reachable from the API pod

```bash
kubectl exec -n docqa deploy/api -- \
  curl -s http://ollama.ai-services.svc.cluster.local:11434/api/tags | head -c 200
```

You should see JSON listing the pulled models. If this fails, check:
1. Network policy — does `docqa` namespace have egress to `ai-services`?
2. Run `kubectl get svc -n ai-services` to confirm the Service exists and the selector matches.

---

## Updating after a code push

All builds happen on the server — no registry involved.

```bash
cd ~/docqa
git pull

# ── API changed ──────────────────────────────────────────────
docker build --target api -t docqa-api:latest .
docker save docqa-api:latest | sudo ctr -n k8s.io images import -
kubectl rollout restart deployment/api deployment/celery-worker -n docqa

# ── Frontend changed ─────────────────────────────────────────
docker build --target frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://172.16.200.116:30800 \
  -t docqa-frontend:latest .
docker save docqa-frontend:latest | sudo ctr -n k8s.io images import -
kubectl rollout restart deployment/frontend -n docqa

# Watch rollout
kubectl rollout status deployment/api -n docqa
```

> Only rebuild what changed. If you only touched the backend, skip the frontend build and vice versa.

---

## Resource summary

With your A40 + 756 GB RAM, headroom is generous. Adjust replicas freely.

| Workload | CPU req | RAM req | Notes |
|----------|---------|---------|-------|
| postgres | 2 | 4 GB | Single replica — pgvector |
| redis | 0.5 | 512 MB | |
| minio | 1 | 2 GB | 200 GB PVC |
| api | 4 × 2 replicas | 8 GB × 2 | 4 uvicorn workers each |
| celery-worker | 4 × 4 replicas | 8 GB × 4 | 4 parallel parse jobs |
| frontend | 1 | 1 GB | |
| **Total** | **~44 cores** | **~58 GB** | **leaves >700 GB for Ollama** |

`gemma4:26b` uses ~17 GB VRAM. The A40's 48 GB fits it fully — all layers stay on GPU.

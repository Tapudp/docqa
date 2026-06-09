# NpuDen DocQA — Kubernetes Deployment Guide
# Target server: nid-practice · 64 cores · 756 GB RAM · Nvidia A40 (48 GB VRAM)

> **What's different from DEPLOY.md?**  
> `DEPLOY.md` covers Docker Compose (local dev / single Linux server).  
> This guide deploys every service as a Kubernetes workload in your existing cluster,  
> and wires into the Ollama pod already running in the `ai-services` namespace.

---

## Your server at a glance

| | |
|---|---|
| Node | `nid-practice` |
| CPU | 64 cores |
| RAM | 756 GB |
| GPU | Nvidia A40 — 48 GB VRAM |
| Ollama pod | `ollama-5dccdd8658-6w2tm` in namespace `ai-services` |
| Ollama pod IP | `172.16.200.116` |
| Repo | `git@github.com:Tapudp/docqa.git` |

**Model recommendation for A40:**  
`qwen2.5:32b` (~20 GB) — excellent quality, leaves 28 GB headroom.  
`llama3.1:70b` (~40 GB) — best quality, fits in A40 VRAM. Slower first token.

---

## Overview — what gets deployed

| Workload | Image | Namespace |
|----------|-------|-----------|
| `postgres` | `pgvector/pgvector:pg16` | `docqa` |
| `redis` | `redis:7-alpine` | `docqa` |
| `minio` | `minio/minio:latest` | `docqa` |
| `api` | `ghcr.io/tapudp/docqa-api:latest` | `docqa` |
| `celery-worker` | `ghcr.io/tapudp/docqa-api:latest` | `docqa` |
| `frontend` | `ghcr.io/tapudp/docqa-frontend:latest` | `docqa` |
| `ollama` | already running | `ai-services` |

---

## Step 1 — Expose Ollama as a stable Service

The pod IP (`172.16.200.116`) changes on pod restarts. Create a stable Service that routes to it.

```bash
# Check if a Service already exists
kubectl get svc -n ai-services
```

If no Service for Ollama exists, create one:

```yaml
# kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: ai-services
spec:
  selector:
    app: ollama          # adjust if the label key/value is different
  ports:
    - port: 11434
      targetPort: 11434
  type: ClusterIP
```

```bash
# Verify the selector matches the pod
kubectl get pod ollama-5dccdd8658-6w2tm -n ai-services --show-labels
# If label is different from "app=ollama", update the selector above

# Test reachability from inside the cluster
kubectl run curl-test --image=curlimages/curl --restart=Never --rm -it \
  -- curl http://ollama.ai-services.svc.cluster.local:11434/api/tags
```

The Ollama URL for DocQA config will be:
```
http://ollama.ai-services.svc.cluster.local:11434
```

---

## Step 2 — Pull the model you want

```bash
kubectl exec -it ollama-5dccdd8658-6w2tm -n ai-services -- \
  ollama pull qwen2.5:32b
# or:
# ollama pull llama3.1:70b   (40 GB — fits in A40)
# ollama pull qwen2.5:14b    (9 GB  — fastest, good for testing)
```

---

## Step 3 — Build and push images

The repo has a single root `Dockerfile` with two named targets — `api` and `frontend`. Build both from the repo root with one context.

```bash
# On your MacBook (or any machine with Docker + access to the registry)

# Authenticate to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u Tapudp --password-stdin

# Pull latest code
git clone git@github.com:Tapudp/docqa.git   # first time
# or: git pull                               # if already cloned

cd docqa

# Build API image  (used for both api and celery-worker pods)
docker build --target api \
  -t ghcr.io/tapudp/docqa-api:latest \
  .

# Build frontend image
# Replace the URL with your actual Ingress / NodePort hostname for the API
docker build --target frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://api.docqa.nid.local \
  -t ghcr.io/tapudp/docqa-frontend:latest \
  .

# Push both
docker push ghcr.io/tapudp/docqa-api:latest
docker push ghcr.io/tapudp/docqa-frontend:latest
```

> **Note on `NEXT_PUBLIC_API_URL`:** this value is compiled into the Next.js JS bundle at build time — it is not a runtime env var. Set it to whatever hostname/IP the browser will use to reach the API. If you change it later, rebuild the frontend image.

> If your registry is private, you'll need an `imagePullSecret`. See the note at the bottom.

---

## Step 5 — Apply all Kubernetes manifests

Save the following as one file and run `kubectl apply -f docqa-k8s.yaml`.

```yaml
# ── Namespace ─────────────────────────────────────────────────
apiVersion: v1
kind: Namespace
metadata:
  name: docqa

---
# ── Secret — sensitive values ─────────────────────────────────
# Generate a JWT secret:  openssl rand -hex 32
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
  LLM_MODEL: "qwen2.5:32b"
  LLM_API_KEY: ""
  ALLOW_REGISTRATION: "true"
  APP_NAME: "NpuDen DocQA"
  CORS_ORIGINS: '["http://frontend.docqa.nid.local","http://localhost:3000"]'

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
          image: ghcr.io/tapudp/docqa-api:latest
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
  selector:
    app: api
  ports:
    - port: 8000
      targetPort: 8000

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
          image: ghcr.io/tapudp/docqa-api:latest
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
          image: ghcr.io/tapudp/docqa-frontend:latest
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
  selector:
    app: frontend
  ports:
    - port: 3000
      targetPort: 3000

---
# ── Ingress ───────────────────────────────────────────────────
# Requires an ingress controller (nginx-ingress or traefik) on the cluster.
# Replace hostnames with your actual DNS or /etc/hosts entries.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: docqa-ingress
  namespace: docqa
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "10g"          # bulk upload support
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"       # streaming responses
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
spec:
  ingressClassName: nginx
  rules:
    - host: docqa.nid.local           # ← frontend
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
    - host: api.docqa.nid.local       # ← backend API
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8000
```

Apply it:

```bash
kubectl apply -f docqa-k8s.yaml
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
http://docqa.nid.local     (or the node IP + port if no ingress)
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
2. Run `kubectl get svc -n ai-services` to confirm the Service exists and the selector matches

---

## DNS / no ingress controller fallback

If you don't have an ingress controller, expose via NodePort instead:

```bash
kubectl patch svc frontend -n docqa -p '{"spec":{"type":"NodePort"}}'
kubectl patch svc api      -n docqa -p '{"spec":{"type":"NodePort"}}'
kubectl get svc -n docqa   # shows the NodePort numbers
```

Then access via `http://<node-ip>:<nodeport>`. Update the frontend image's `NEXT_PUBLIC_API_URL` build arg to match the API NodePort URL before building.

---

## Updating after a code push

All builds use the root `Dockerfile` — run everything from the repo root.

```bash
git pull

# Rebuild API + restart
docker build --target api \
  -t ghcr.io/tapudp/docqa-api:latest . && \
  docker push ghcr.io/tapudp/docqa-api:latest
kubectl rollout restart deployment/api deployment/celery-worker -n docqa

# Rebuild frontend + restart (only needed if frontend code changed)
docker build --target frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://api.docqa.nid.local \
  -t ghcr.io/tapudp/docqa-frontend:latest . && \
  docker push ghcr.io/tapudp/docqa-frontend:latest
kubectl rollout restart deployment/frontend -n docqa
```

---

## Private registry — imagePullSecret

If `ghcr.io/tapudp/docqa` is a private repo:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=Tapudp \
  --docker-password=$GITHUB_TOKEN \
  -n docqa
```

Add to each Deployment's `spec.template.spec`:
```yaml
imagePullSecrets:
  - name: ghcr-secret
```

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

Ollama with `qwen2.5:32b` uses ~20 GB VRAM and ~40 GB RAM. The A40's 48 GB VRAM fits it fully — all layers stay on GPU, inference is fast.

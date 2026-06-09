# ── Stage 1: install production deps only ─────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: build ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_API_URL is baked into the JS bundle at build time.
# Pass the real URL when building the image:
#   docker build --build-arg NEXT_PUBLIC_API_URL=http://api.docqa.nid.local ...
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Stage 3: run ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built output and production node_modules only
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=deps    /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]

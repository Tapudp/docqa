#!/usr/bin/env bash
# REVERB — instant rollback from vLLM to the Ollama backend.
# Run on nid-practice as nidp: bash ~/docqa/scripts/rollback-to-ollama.sh
set -euo pipefail

echo "── Scale vLLM down, Ollama up"
kubectl scale deployment/vllm-engine -n ai-services --replicas=0
kubectl wait --for=delete pod -l app=vllm-engine -n ai-services --timeout=120s || true
kubectl scale deployment/vllm -n ai-services --replicas=1
kubectl rollout status deployment/vllm -n ai-services --timeout=600s

echo "── Point DocQA back at Ollama"
kubectl patch configmap docqa-config -n docqa \
  -p '{"data":{"LLM_BASE_URL":"http://172.16.200.123:30900","LLM_MODEL":"gemma4:26b","LLM_PROVIDER":"ollama","LLM_API_KEY":""}}'
kubectl rollout restart deployment/api deployment/celery-worker -n docqa
kubectl rollout status deployment/api -n docqa --timeout=180s

echo "✅ Rolled back to Ollama (gemma4:26b on 172.16.200.123:30900)"

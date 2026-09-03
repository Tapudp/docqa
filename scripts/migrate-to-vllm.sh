#!/usr/bin/env bash
# REVERB — Ollama → vLLM migration. Run on nid-practice as nidp.
# Usage: bash ~/docqa/scripts/migrate-to-vllm.sh
# Rollback anytime: bash ~/docqa/scripts/rollback-to-ollama.sh
set -euo pipefail

VLLM_URL="http://172.16.200.123:30901"

echo "── 1/7 Remove stale config.json stub next to the GGUF"
kubectl exec -n ai-services deployment/vllm -- rm -f /models/config.json 2>/dev/null \
  && echo "   removed" || echo "   ollama pod not running — skipping (stub is harmless for direct .gguf load)"

echo "── 2/7 Scale Ollama down (frees the A40 for vLLM)"
kubectl scale deployment/vllm -n ai-services --replicas=0
kubectl wait --for=delete pod -l app=vllm -n ai-services --timeout=120s || true

echo "── 3/7 Wait for vllm-engine to become Ready (GGUF load ≈ 2-5 min)"
kubectl rollout status deployment/vllm-engine -n ai-services --timeout=1200s

echo "── 4/7 Verify the OpenAI endpoint"
curl -sf "$VLLM_URL/v1/models" | python3 -m json.tool
echo
echo "   Test completion:"
curl -sf "$VLLM_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4:26b","messages":[{"role":"user","content":"Say hello in one short sentence."}],"max_tokens":100}' \
  | python3 -c "import sys,json; print('   →', json.load(sys.stdin)['choices'][0]['message']['content'])"

echo "── 5/7 Point DocQA at vLLM"
kubectl patch configmap docqa-config -n docqa \
  -p "{\"data\":{\"LLM_BASE_URL\":\"$VLLM_URL\",\"LLM_MODEL\":\"gemma4:26b\",\"LLM_PROVIDER\":\"vllm\",\"LLM_API_KEY\":\"\"}}"

echo "── 6/7 Rebuild app images (vllm provider support) and import"
cd ~/docqa
git pull
docker build --network=host --target api -t docqa-api:latest .
docker save docqa-api:latest | sudo ctr -n k8s.io images import -
docker build --network=host --target frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://172.16.200.116:30800 \
  -t docqa-frontend:latest .
docker save docqa-frontend:latest | sudo ctr -n k8s.io images import -

echo "── 7/7 Restart DocQA"
kubectl rollout restart deployment/api deployment/celery-worker deployment/frontend -n docqa
kubectl rollout status deployment/api -n docqa --timeout=180s
kubectl rollout status deployment/frontend -n docqa --timeout=180s

echo
echo "✅ Migration complete. DocQA is on vLLM at $VLLM_URL"
echo "   Chat test: http://172.16.200.116:30300"
echo "   Rollback:  bash ~/docqa/scripts/rollback-to-ollama.sh"

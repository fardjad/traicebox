#!/bin/sh
set -eu

LITELLM_URL="http://litellm:4000"
READY_URL="$LITELLM_URL/health/readiness"
KEY_INFO_URL="$LITELLM_URL/key/info?key=${LITELLM_CLIENT_KEY}"
KEY_GENERATE_URL="$LITELLM_URL/key/generate"

for _ in $(seq 1 60); do
  if curl -fsS "$READY_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS "$READY_URL" >/dev/null 2>&1; then
  echo "LiteLLM did not become ready in time" >&2
  exit 1
fi

if curl -fsS \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  "$KEY_INFO_URL" >/dev/null 2>&1; then
  echo "LiteLLM client key already exists"
  exit 0
fi

curl -fsS \
  -X POST \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  "$KEY_GENERATE_URL" \
  -d "{
    \"key_alias\": \"local-client\",
    \"key\": \"${LITELLM_CLIENT_KEY}\",
    \"models\": []
  }" >/dev/null

echo "LiteLLM client key created"

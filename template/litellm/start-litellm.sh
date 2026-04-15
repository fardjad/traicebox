#!/bin/sh
set -eu

SECRET_PATH="/run/secrets/openai_compatible_api_key"

if [ -z "${OPENAI_COMPATIBLE_API_KEY:-}" ] && [ -s "$SECRET_PATH" ]; then
  OPENAI_COMPATIBLE_API_KEY="$(cat "$SECRET_PATH")"
  export OPENAI_COMPATIBLE_API_KEY
fi

if [ -z "${OPENAI_COMPATIBLE_API_KEY:-}" ]; then
  OPENAI_COMPATIBLE_API_KEY="sk-no-auth-required"
  export OPENAI_COMPATIBLE_API_KEY
fi

exec litellm "$@"

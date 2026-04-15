import { describe, expect, test } from "bun:test";

import { buildOpencodeConfig } from "./external-config";

describe("buildOpencodeConfig", () => {
  test("includes all LiteLLM models and public defaults", () => {
    const config = buildOpencodeConfig(
      ["google/gemma-4-e2b", "qwen/qwen3-4b-2507"],
      {
        POSTGRES_SUPERUSER: "postgres",
        POSTGRES_SUPERPASS: "postgres",
        LITELLM_DB_NAME: "litellm",
        LITELLM_DB_USER: "litellm",
        LITELLM_DB_PASSWORD: "litellm",
        LANGFUSE_DB_NAME: "langfuse",
        LANGFUSE_DB_USER: "langfuse",
        LANGFUSE_DB_PASSWORD: "langfuse",
        CLICKHOUSE_DB: "default",
        CLICKHOUSE_USER: "clickhouse",
        CLICKHOUSE_PASSWORD: "clickhouse",
        LANGFUSE_REDIS_PASSWORD: "langfuse-redis",
        MINIO_ROOT_USER: "minio",
        MINIO_ROOT_PASSWORD: "miniosecret",
        TRAICEBOX_HOST: "127.0.0.1",
        TRAICEBOX_PORT: "5483",
        LANGFUSE_NEXTAUTH_SECRET: "secret",
        LANGFUSE_AUTH_DISABLE_SIGNUP: "true",
        LANGFUSE_PROXY_AUTOLOGIN: "true",
        LANGFUSE_SALT: "salt",
        LANGFUSE_ENCRYPTION_KEY: "enc",
        LANGFUSE_TELEMETRY_ENABLED: "false",
        LANGFUSE_EXPERIMENTAL_FEATURES: "false",
        LANGFUSE_TRACING_ENVIRONMENT: "local",
        LANGFUSE_INIT_ORG_ID: "local-org",
        LANGFUSE_INIT_ORG_NAME: "Local Org",
        LANGFUSE_INIT_PROJECT_ID: "local-project",
        LANGFUSE_INIT_PROJECT_NAME: "Local Project",
        LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "pk-lf-local-public-key",
        LANGFUSE_INIT_PROJECT_SECRET_KEY: "sk-lf-local-secret-key",
        LANGFUSE_INIT_USER_EMAIL: "admin@example.com",
        LANGFUSE_INIT_USER_NAME: "Local Admin",
        LANGFUSE_INIT_USER_PASSWORD: "admin123456",
        LITELLM_MASTER_KEY: "admin",
        LITELLM_CLIENT_KEY: "sk-litellm-local-client",
      },
    );

    expect(config.provider.litellm.options).toEqual({
      baseURL: "http://litellm.localhost:5483/v1",
      apiKey: "sk-litellm-local-client",
    });
    expect(Object.keys(config.provider.litellm.models)).toEqual([
      "google/gemma-4-e2b",
      "qwen/qwen3-4b-2507",
    ]);
  });
});

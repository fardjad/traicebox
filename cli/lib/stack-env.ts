const STACK_ENV_DEFAULTS = {
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
  TRAICEBOX_PORT: "8080",
  LANGFUSE_NEXTAUTH_SECRET: "langfuse-local-nextauth-secret",
  LANGFUSE_AUTH_DISABLE_SIGNUP: "true",
  LANGFUSE_PROXY_AUTOLOGIN: "true",
  LANGFUSE_SALT: "langfuse-local-salt",
  LANGFUSE_ENCRYPTION_KEY:
    "0000000000000000000000000000000000000000000000000000000000000000",
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
} as const;

export type StackEnv = Record<keyof typeof STACK_ENV_DEFAULTS, string>;

export function resolveStackEnv(
  env: Record<string, string | undefined>,
): StackEnv {
  return Object.fromEntries(
    Object.entries(STACK_ENV_DEFAULTS).map(([key, value]) => [
      key,
      env[key] ?? value,
    ]),
  ) as StackEnv;
}

export function serializeStackEnv(env: StackEnv): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`)
    .join("\n")
    .concat("\n");
}

function serializeEnvValue(value: string): string {
  return /^[A-Za-z0-9._:/-]+$/.test(value) ? value : JSON.stringify(value);
}

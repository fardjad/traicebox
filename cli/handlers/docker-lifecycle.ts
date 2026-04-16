import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Spinner } from "picospinner";

import {
  DEFAULT_EDGE_PORT,
  LANGFUSE_HOST,
  LITELLM_HOST,
} from "../lib/constants";
import { ensureDockerReady } from "../lib/docker";
import { fail } from "../lib/errors";
import { type LiteLLMConfig, readLiteLLMConfig } from "../lib/litellm-config";
import {
  ensureActiveHomeExists,
  getDefaultLiteLLMConfigPath,
  getRuntime,
} from "../lib/runtime";

type StackCommand = "start" | "stop" | "restart" | "destroy";

const TMPDIR = process.env.TMPDIR ?? "/tmp";
const SECRET_FILE_ENV = "OPENAI_COMPATIBLE_API_KEY_SECRET_FILE";

const LONG_RUNNING_SERVICES = [
  "db",
  "langfuse-clickhouse",
  "langfuse-minio",
  "langfuse-redis",
  "langfuse-web",
  "langfuse-proxy",
  "litellm",
  "litellm-ui-proxy",
  "langfuse-worker",
  "caddy",
] as const;

let activeDockerComposeProcess: ChildProcess | null = null;
let forwardedInterrupt = false;
let activeSpinner: Spinner | null = null;
let activeSecretDirectory: string | null = null;

function printAccessInfo(command: StackCommand): void {
  if (command !== "start" && command !== "restart") {
    return;
  }

  const { stackEnv } = getRuntime();
  const edgePort = stackEnv.TRAICEBOX_PORT ?? DEFAULT_EDGE_PORT;

  console.log("");
  console.log(`LiteLLM API   http://${LITELLM_HOST}:${edgePort}`);
  console.log(`Langfuse      http://${LANGFUSE_HOST}:${edgePort}`);
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  if (
    value === "localhost" ||
    value === "host.docker.internal" ||
    value === "0.0.0.0" ||
    value === "::1" ||
    value.endsWith(".localhost")
  ) {
    return true;
  }

  if (
    value.startsWith("127.") ||
    value.startsWith("10.") ||
    value.startsWith("192.168.")
  ) {
    return true;
  }

  const match172 = value.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return !value.includes(".");
}

function shouldWarnAboutMissingApiKey(config: LiteLLMConfig): boolean {
  if (process.env.OPENAI_COMPATIBLE_API_KEY) {
    return false;
  }

  return (config.model_list ?? []).some((entry) => {
    if (
      entry.litellm_params?.api_key !== "os.environ/OPENAI_COMPATIBLE_API_KEY"
    ) {
      return false;
    }

    const apiBase = entry.litellm_params.api_base;
    if (!apiBase) {
      return true;
    }

    try {
      return !isLocalOrPrivateHostname(new URL(apiBase).hostname);
    } catch {
      return true;
    }
  });
}

function prepareOpenAICompatibleApiKeySecretFile(): string {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;

  if (!apiKey) {
    return "/dev/null";
  }

  const secretDirectory = mkdtempSync(join(TMPDIR, "traicebox-"));
  const secretFilePath = join(secretDirectory, "openai-compatible-api-key");
  activeSecretDirectory = secretDirectory;

  writeFileSync(secretFilePath, `${apiKey}\n`, { mode: 0o600 });
  chmodSync(secretDirectory, 0o700);
  chmodSync(secretFilePath, 0o600);
  return secretFilePath;
}

function cleanupOpenAICompatibleApiKeySecretMaterialSync(): void {
  if (!activeSecretDirectory) {
    return;
  }

  try {
    rmSync(activeSecretDirectory, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  } finally {
    activeSecretDirectory = null;
  }
}

async function runDockerCompose(args: string[], logs: boolean): Promise<void> {
  const runtime = getRuntime();
  const env = {
    ...process.env,
    ...runtime.stackEnv,
    [SECRET_FILE_ENV]: prepareOpenAICompatibleApiKeySecretFile(),
  };

  try {
    const proc = spawn("docker", ["compose", ...args], {
      cwd: runtime.home,
      env: env as Record<string, string>,
      stdio: [
        logs ? "inherit" : "ignore",
        logs ? "inherit" : "pipe",
        logs ? "inherit" : "pipe",
      ],
    });
    activeDockerComposeProcess = proc;

    let stdout = "";
    let stderr = "";

    if (!logs) {
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
    }

    const exitCode = await new Promise((resolve) => proc.on("close", resolve));
    activeDockerComposeProcess = null;

    if (forwardedInterrupt) {
      process.exit(130);
    }

    if (exitCode !== 0) {
      if (stdout.trim()) {
        process.stdout.write(stdout);
      }
      if (stderr.trim()) {
        process.stderr.write(stderr);
      }
      fail(
        `docker compose ${args.join(" ")} failed with exit code ${exitCode}`,
      );
    }
  } finally {
    activeDockerComposeProcess = null;
    cleanupOpenAICompatibleApiKeySecretMaterialSync();
  }
}

async function runStep(
  text: string,
  logs: boolean,
  action: () => Promise<void>,
): Promise<void> {
  if (logs) {
    await action();
    return;
  }

  const spinner = new Spinner(text);
  spinner.start();
  activeSpinner = spinner;

  try {
    await action();
    spinner.succeed(text);
  } catch (error) {
    spinner.fail(text);
    throw error;
  } finally {
    activeSpinner = null;
  }
}

export function installDockerLifecycleSignalHandlers(): void {
  process.on("SIGINT", () => {
    forwardedInterrupt = true;
    activeSpinner?.stop();

    if (activeDockerComposeProcess) {
      activeDockerComposeProcess.kill("SIGINT");
      setTimeout(() => {
        activeDockerComposeProcess?.kill("SIGKILL");
      }, 1000);
    }

    cleanupOpenAICompatibleApiKeySecretMaterialSync();
    process.exit(130);
  });
}

export async function runStackCommand(
  command: StackCommand,
  logs: boolean,
): Promise<void> {
  ensureActiveHomeExists();

  await ensureDockerReady().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });

  if (command === "start" || command === "restart") {
    try {
      const config = await readLiteLLMConfig(getDefaultLiteLLMConfigPath());
      if (shouldWarnAboutMissingApiKey(config)) {
        console.warn(
          "Warning: OPENAI_COMPATIBLE_API_KEY is not set. LiteLLM config appears to use a likely authenticated upstream.",
        );
      }
    } catch {
      // Ignore preflight warnings if config inspection fails; docker compose will surface real errors.
    }

    const upArgs =
      command === "restart"
        ? [
            "up",
            "-d",
            "--force-recreate",
            "--remove-orphans",
            "--wait",
            ...LONG_RUNNING_SERVICES,
          ]
        : ["up", "-d", "--remove-orphans", "--wait", ...LONG_RUNNING_SERVICES];

    await runStep("Starting stack", logs, async () => {
      await runDockerCompose(upArgs, logs);
    });

    await runStep("Bootstrapping LiteLLM", logs, async () => {
      await runDockerCompose(
        ["run", "--rm", "--no-deps", "litellm-bootstrap"],
        logs,
      );
    });

    printAccessInfo(command);
    return;
  }

  const downArgs =
    command === "stop" ? ["stop"] : ["down", "--remove-orphans", "--volumes"];

  await runStep(
    command === "stop" ? "Stopping stack" : "Destroying stack",
    logs,
    async () => {
      await runDockerCompose(downArgs, logs);
    },
  );
}

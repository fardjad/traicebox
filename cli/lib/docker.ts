import { spawn } from "node:child_process";

export type CommandExecutorResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  errorCode?: string;
};

export type CommandExecutor = (
  command: string[],
) => Promise<CommandExecutorResult>;

export type ContainerRuntimeCommand = "docker" | "podman";

export type ContainerRuntime = {
  command: ContainerRuntimeCommand;
};

export const SUPPORTED_CONTAINER_RUNTIME_COMMANDS = [
  "docker",
  "podman",
] as const satisfies readonly ContainerRuntimeCommand[];

const SUPPORTED_RUNTIMES: readonly ContainerRuntime[] = [
  { command: "docker" },
  { command: "podman" },
] as const;

export async function ensureDockerReady(
  executor: CommandExecutor = executeCommand,
  preferredRuntime?: ContainerRuntimeCommand,
): Promise<ContainerRuntime> {
  if (preferredRuntime) {
    return ensurePreferredRuntimeReady(preferredRuntime, executor);
  }

  let sawInstalledRuntime = false;
  let sawComposeCommand = false;

  for (const runtime of SUPPORTED_RUNTIMES) {
    const composeResult = await executor([
      runtime.command,
      "compose",
      "version",
    ]);

    if (composeResult.errorCode === "ENOENT") {
      continue;
    }

    sawInstalledRuntime = true;

    if (composeResult.exitCode !== 0) {
      continue;
    }

    sawComposeCommand = true;

    const engineResult = await executor(getEngineProbeCommand(runtime.command));

    if (engineResult.exitCode === 0) {
      return runtime;
    }
  }

  if (!sawInstalledRuntime) {
    throw new Error(
      "Neither Docker nor Podman CLI is available. Install one and try again.",
    );
  }

  if (!sawComposeCommand) {
    throw new Error(
      "Neither Docker Compose nor Podman Compose is available. Check your installation and try again.",
    );
  }

  throw new Error(
    "Docker or Podman is installed but the engine is not reachable. Start it and try again.",
  );
}

async function ensurePreferredRuntimeReady(
  preferredRuntime: ContainerRuntimeCommand,
  executor: CommandExecutor,
): Promise<ContainerRuntime> {
  const composeResult = await executor([
    preferredRuntime,
    "compose",
    "version",
  ]);

  if (composeResult.errorCode === "ENOENT") {
    throw new Error(
      `${displayRuntimeName(preferredRuntime)} CLI is not available. Install ${displayRuntimeName(preferredRuntime)} and try again.`,
    );
  }

  if (composeResult.exitCode !== 0) {
    throw new Error(
      `${displayRuntimeName(preferredRuntime)} Compose is not available. Check your ${displayRuntimeName(preferredRuntime)} installation and try again.`,
    );
  }

  const engineResult = await executor(getEngineProbeCommand(preferredRuntime));

  if (engineResult.errorCode === "ENOENT") {
    throw new Error(
      `${displayRuntimeName(preferredRuntime)} CLI is not available. Install ${displayRuntimeName(preferredRuntime)} and try again.`,
    );
  }

  if (engineResult.exitCode !== 0) {
    throw new Error(
      `${displayRuntimeName(preferredRuntime)} is installed but the engine is not reachable. Start ${displayRuntimeName(preferredRuntime)} and try again.`,
    );
  }

  return { command: preferredRuntime };
}

function displayRuntimeName(runtime: ContainerRuntimeCommand): string {
  return runtime === "docker" ? "Docker" : "Podman";
}

function getEngineProbeCommand(runtime: ContainerRuntimeCommand): string[] {
  return runtime === "docker"
    ? [runtime, "info", "--format", "{{.ServerVersion}}"]
    : [runtime, "info"];
}

export function validateDockerComposeResult(
  result: CommandExecutorResult,
): void {
  if (result.errorCode === "ENOENT") {
    throw new Error(
      "Docker CLI is not available. Install Docker and try again.",
    );
  }

  if (result.exitCode !== 0) {
    throw new Error(
      "Docker Compose is not available. Check your Docker installation and try again.",
    );
  }
}

export function validateDockerEngineResult(
  result: CommandExecutorResult,
): void {
  if (result.errorCode === "ENOENT") {
    throw new Error(
      "Docker CLI is not available. Install Docker and try again.",
    );
  }

  if (result.exitCode !== 0) {
    throw new Error(
      "Docker is installed but the engine is not reachable. Start Docker and try again.",
    );
  }
}

async function executeCommand(
  command: string[],
): Promise<CommandExecutorResult> {
  try {
    const [cmd, ...args] = command;
    if (!cmd) {
      throw new Error("No command provided");
    }

    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on("close", (code) => resolve(code ?? 1));
      proc.on("error", reject);
    });

    return {
      exitCode,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      errorCode:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined,
    };
  }
}

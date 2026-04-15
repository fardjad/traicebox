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

export async function ensureDockerReady(
  executor: CommandExecutor = executeCommand,
): Promise<void> {
  const composeResult = await executor(["docker", "compose", "version"]);
  validateDockerComposeResult(composeResult);

  const engineResult = await executor([
    "docker",
    "info",
    "--format",
    "{{.ServerVersion}}",
  ]);
  validateDockerEngineResult(engineResult);
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

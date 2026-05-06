import { describe, expect, test } from "bun:test";

import { ensureDockerReady } from "./docker";

describe("ensureDockerReady", () => {
  test("uses the configured runtime when provided", async () => {
    const executed: string[][] = [];

    await expect(
      ensureDockerReady(async (command) => {
        executed.push(command);
        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
        };
      }, "podman"),
    ).resolves.toEqual({ command: "podman" });

    expect(executed).toEqual([
      ["podman", "compose", "version"],
      ["podman", "info"],
    ]);
  });

  test("falls back to podman when docker is missing", async () => {
    const executed: string[][] = [];

    await expect(
      ensureDockerReady(async (command) => {
        executed.push(command);

        if (command[0] === "docker") {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "",
            errorCode: "ENOENT",
          };
        }

        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
        };
      }),
    ).resolves.toEqual({ command: "podman" });

    expect(executed).toEqual([
      ["docker", "compose", "version"],
      ["podman", "compose", "version"],
      ["podman", "info"],
    ]);
  });

  test("accepts podman when plain info succeeds", async () => {
    await expect(
      ensureDockerReady(
        async (command) =>
          command.join(" ") === "podman compose version"
            ? {
                exitCode: 0,
                stdout: "compose ok",
                stderr: "",
              }
            : command.join(" ") === "podman info"
              ? {
                  exitCode: 0,
                  stdout: "info ok",
                  stderr: "",
                }
              : {
                  exitCode: 1,
                  stdout: "",
                  stderr: "",
                  errorCode: "ENOENT",
                },
        "podman",
      ),
    ).resolves.toEqual({ command: "podman" });
  });

  test("fails when no supported runtime is installed", async () => {
    await expect(
      ensureDockerReady(async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "",
        errorCode: "ENOENT",
      })),
    ).rejects.toThrow(
      "Neither Docker nor Podman CLI is available. Install one and try again.",
    );
  });

  test("fails when the engine is unreachable", async () => {
    await expect(
      ensureDockerReady(async (command) =>
        command[1] === "compose"
          ? {
              exitCode: 0,
              stdout: "compose ok",
              stderr: "",
            }
          : {
              exitCode: 1,
              stdout: "",
              stderr: "Cannot connect to the daemon",
            },
      ),
    ).rejects.toThrow(
      "Docker or Podman is installed but the engine is not reachable. Start it and try again.",
    );
  });

  test("fails when compose is unavailable", async () => {
    await expect(
      ensureDockerReady(async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "compose is unavailable",
      })),
    ).rejects.toThrow(
      "Neither Docker Compose nor Podman Compose is available. Check your installation and try again.",
    );
  });

  test("fails when the configured runtime is missing", async () => {
    await expect(
      ensureDockerReady(
        async () => ({
          exitCode: 1,
          stdout: "",
          stderr: "",
          errorCode: "ENOENT",
        }),
        "podman",
      ),
    ).rejects.toThrow(
      "Podman CLI is not available. Install Podman and try again.",
    );
  });
});

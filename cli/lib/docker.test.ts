import { describe, expect, test } from "bun:test";

import {
  validateDockerComposeResult,
  validateDockerEngineResult,
} from "./docker";

describe("validateDockerComposeResult", () => {
  test("fails when docker is missing", () => {
    expect(() =>
      validateDockerComposeResult({
        exitCode: 1,
        stdout: "",
        stderr: "",
        errorCode: "ENOENT",
      }),
    ).toThrow("Docker CLI is not available. Install Docker and try again.");
  });
});

describe("validateDockerEngineResult", () => {
  test("fails when the engine is unreachable", () => {
    expect(() =>
      validateDockerEngineResult({
        exitCode: 1,
        stdout: "",
        stderr: "Cannot connect to the Docker daemon",
      }),
    ).toThrow(
      "Docker is installed but the engine is not reachable. Start Docker and try again.",
    );
  });
});

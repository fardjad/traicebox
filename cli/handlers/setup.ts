import { rmSync } from "node:fs";
import { ensureDockerReady } from "../lib/docker";
import { fail } from "../lib/errors";
import { getRuntime } from "../lib/runtime";
import { materializeTemplate, writeDevelopmentDotenv } from "../lib/template";

export async function runSetup(force = false): Promise<void> {
  const runtime = getRuntime();

  await ensureDockerReady(undefined, runtime.containerRuntime).catch(
    (error) => {
      fail(error instanceof Error ? error.message : String(error));
    },
  );

  if (force) {
    rmSync(runtime.home, { recursive: true, force: true });
  }

  try {
    await materializeTemplate(runtime.home, "fail-if-exists");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (runtime.dev) {
    await writeDevelopmentDotenv(runtime.home, runtime.stackEnv);
  }

  console.log(`Created ${runtime.home}`);
}

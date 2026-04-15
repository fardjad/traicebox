import { describe, expect, test } from "bun:test";

import { materializeTemplate } from "./template";

describe("materializeTemplate", () => {
  test("creates a new stack home from the template", async () => {
    const createdPaths = new Set<string>();
    const writtenPaths = new Map<string, string>();
    const chmods = new Map<string, number>();
    const home = "/virtual/home";

    await materializeTemplate(home, "fail-if-exists", {
      exists: (path) => createdPaths.has(path) || writtenPaths.has(path),
      mkdir: (path) => {
        createdPaths.add(path);
      },
      write: async (path, contents) => {
        writtenPaths.set(path, contents);
      },
      chmod: (path, mode) => {
        chmods.set(path, mode);
      },
    });

    expect(writtenPaths.has("/virtual/home/compose.yml")).toBe(true);
    expect(writtenPaths.has("/virtual/home/litellm/config.yaml")).toBe(true);
    expect(writtenPaths.has("/virtual/home/langfuse-proxy/server.ts")).toBe(
      true,
    );
    expect(chmods.get("/virtual/home/litellm/start-litellm.sh")).toBe(0o755);
  });

  test("fails when the target home already exists", async () => {
    const home = "/virtual/existing-home";

    await expect(
      materializeTemplate(home, "fail-if-exists", {
        exists: (path) => path === home,
        mkdir: () => {},
        write: async () => {},
        chmod: () => {},
      }),
    ).rejects.toThrow(`Traicebox home already exists: ${home}`);
  });
});

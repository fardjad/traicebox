import { describe, expect, test } from "bun:test";

import { getInstalledTraiceboxHome, resolveTraiceboxHome } from "./runtime";

describe("resolveTraiceboxHome", () => {
  test("uses the installed app directory by default", () => {
    const result = resolveTraiceboxHome({
      cwd: "/workspace",
      env: {},
      platform: "linux",
      homeDir: "/home/far",
      xdgConfigHome: "/custom-config",
    });

    expect(result).toEqual({
      home: "/custom-config/traicebox",
      dev: false,
    });
  });

  test("uses the local dev home when TRAICEBOX_DEV is enabled", () => {
    const result = resolveTraiceboxHome({
      cwd: "/workspace",
      env: { TRAICEBOX_DEV: "1" },
      platform: "darwin",
      homeDir: "/Users/far",
    });

    expect(result).toEqual({
      home: "/workspace/.traicebox",
      dev: true,
    });
  });

  test("TRAICEBOX_HOME overrides the default location", () => {
    const result = resolveTraiceboxHome({
      cwd: "/workspace",
      env: {
        TRAICEBOX_DEV: "1",
        TRAICEBOX_HOME: "./custom-home",
      },
      platform: "linux",
      homeDir: "/home/far",
    });

    expect(result).toEqual({
      home: "/workspace/custom-home",
      dev: true,
    });
  });
});

describe("getInstalledTraiceboxHome", () => {
  test("uses Application Support on macOS", () => {
    expect(
      getInstalledTraiceboxHome({
        platform: "darwin",
        homeDir: "/Users/far",
      }),
    ).toBe("/Users/far/Library/Application Support/Traicebox");
  });
});

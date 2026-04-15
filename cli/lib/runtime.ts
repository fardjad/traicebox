import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import yaml from "yaml";

import {
  DEFAULT_DEV_HOME_DIRNAME,
  LITELLM_CONFIG_RELATIVE_PATH,
  TRAICEBOX_DEV_ENV,
  TRAICEBOX_HOME_ENV,
} from "./constants";
import { fail } from "./errors";
import { resolveStackEnv, type StackEnv } from "./stack-env";

export type RuntimeContext = {
  home: string;
  dev: boolean;
  stackEnv: StackEnv;
};

type ResolveHomeArgs = {
  cwd: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homeDir: string;
  appData?: string;
  xdgConfigHome?: string;
};

let runtimeContext: RuntimeContext | null = null;

export function initializeRuntime(): RuntimeContext {
  const env: Record<string, string | undefined> = { ...process.env };
  const resolvedHome = resolveTraiceboxHome({
    cwd: process.cwd(),
    env: process.env as Record<string, string | undefined>,
    platform: process.platform,
    homeDir: homedir(),
    appData: env.APPDATA,
    xdgConfigHome: env.XDG_CONFIG_HOME,
  });

  const configPath = join(resolvedHome.home, "traicebox.yaml");
  if (existsSync(configPath)) {
    try {
      const configObj = yaml.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      > | null;
      if (configObj && typeof configObj === "object") {
        if (!env.TRAICEBOX_HOST && typeof configObj.host === "string") {
          env.TRAICEBOX_HOST = configObj.host;
        }
        if (
          !env.TRAICEBOX_PORT &&
          (typeof configObj.port === "string" ||
            typeof configObj.port === "number")
        ) {
          env.TRAICEBOX_PORT = String(configObj.port);
        }
      }
    } catch {
      fail(`Failed to parse config file: ${configPath}`);
    }
  }

  runtimeContext = {
    home: resolvedHome.home,
    dev: resolvedHome.dev,
    stackEnv: resolveStackEnv(env),
  };

  return runtimeContext;
}

export function getRuntime(): RuntimeContext {
  if (!runtimeContext) {
    fail("Runtime has not been initialized");
  }

  return runtimeContext;
}

export function getDefaultLiteLLMConfigPath(): string {
  return join(getRuntime().home, LITELLM_CONFIG_RELATIVE_PATH);
}

export function ensureActiveHomeExists(): void {
  const { home } = getRuntime();
  if (existsSync(home)) {
    return;
  }

  fail(`Traicebox home not found: ${home}. Run 'traicebox setup' first.`);
}

export function resolveTraiceboxHome(args: ResolveHomeArgs): {
  home: string;
  dev: boolean;
} {
  const explicitHome = args.env[TRAICEBOX_HOME_ENV]?.trim();
  const dev = isTruthy(args.env[TRAICEBOX_DEV_ENV]);

  if (explicitHome) {
    return {
      home: toAbsolutePath(args.cwd, explicitHome),
      dev,
    };
  }

  if (dev) {
    return {
      home: join(args.cwd, DEFAULT_DEV_HOME_DIRNAME),
      dev: true,
    };
  }

  return {
    home: getInstalledTraiceboxHome(args),
    dev: false,
  };
}

export function getInstalledTraiceboxHome(
  args: Omit<ResolveHomeArgs, "env" | "cwd">,
): string {
  switch (args.platform) {
    case "darwin":
      return join(args.homeDir, "Library", "Application Support", "Traicebox");
    case "win32":
      return join(
        args.appData ?? join(args.homeDir, "AppData", "Roaming"),
        "Traicebox",
      );
    default:
      return join(
        args.xdgConfigHome ?? join(args.homeDir, ".config"),
        "traicebox",
      );
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function toAbsolutePath(cwd: string, value: string): string {
  return isAbsolute(value) ? value : join(cwd, value);
}

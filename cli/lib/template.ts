import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error Bun embedded asset import.
import caddyfile from "../../template/caddy/Caddyfile" with { type: "file" };

import composeYml from "../../template/compose.yml" with { type: "file" };
// @ts-expect-error Bun embedded asset import.
import langfuseProxyDockerfile from "../../template/langfuse-proxy/Dockerfile" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import langfuseProxyServer from "../../template/langfuse-proxy/server.ts" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import litellmBootstrapClientKey from "../../template/litellm/bootstrap-client-key.sh" with {
  type: "file",
};
import litellmConfig from "../../template/litellm/config.yaml" with {
  type: "file",
};
import litellmLoggingAsset from "../../template/litellm/logging.json" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import litellmRequestSessionMetadataCallback from "../../template/litellm/request_session_metadata_callback.py" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import litellmStart from "../../template/litellm/start-litellm.sh" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import litellmUiProxyDockerfile from "../../template/litellm-ui-proxy/Dockerfile" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import litellmUiProxyServer from "../../template/litellm-ui-proxy/server.ts" with {
  type: "file",
};
// @ts-expect-error Bun embedded asset import.
import postgresInit from "../../template/postgres/init/00-app-databases.sh" with {
  type: "file",
};
import traiceboxYaml from "../../template/traicebox.yaml" with { type: "file" };
import { type StackEnv, serializeStackEnv } from "./stack-env";

type MaterializeMode = "create-missing" | "fail-if-exists";
type TemplateFile = {
  source: string;
  target: string;
  mode?: number;
};

type TemplateFs = {
  exists(path: string): boolean;
  mkdir(path: string): void;
  write(path: string, contents: string): Promise<void>;
  chmod(path: string, mode: number): void;
};

const TEMPLATE_FILES: TemplateFile[] = [
  { source: traiceboxYaml, target: "traicebox.yaml" },
  { source: composeYml, target: "compose.yml" },
  { source: caddyfile, target: "caddy/Caddyfile" },
  { source: langfuseProxyDockerfile, target: "langfuse-proxy/Dockerfile" },
  { source: langfuseProxyServer, target: "langfuse-proxy/server.ts" },
  {
    source: litellmBootstrapClientKey,
    target: "litellm/bootstrap-client-key.sh",
    mode: 0o755,
  },
  { source: litellmConfig, target: "litellm/config.yaml" },
  {
    source: litellmLoggingAsset as unknown as string,
    target: "litellm/logging.json",
  },
  {
    source: litellmRequestSessionMetadataCallback,
    target: "litellm/request_session_metadata_callback.py",
  },
  { source: litellmStart, target: "litellm/start-litellm.sh", mode: 0o755 },
  { source: litellmUiProxyDockerfile, target: "litellm-ui-proxy/Dockerfile" },
  { source: litellmUiProxyServer, target: "litellm-ui-proxy/server.ts" },
  {
    source: postgresInit,
    target: "postgres/init/00-app-databases.sh",
    mode: 0o755,
  },
] as const;

const defaultTemplateFs: TemplateFs = {
  exists: existsSync,
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  write: async (path, contents) => {
    await writeFile(path, contents, "utf-8");
  },
  chmod: chmodSync,
};

export async function materializeTemplate(
  home: string,
  mode: MaterializeMode,
  templateFs: TemplateFs = defaultTemplateFs,
): Promise<void> {
  if (mode === "fail-if-exists" && templateFs.exists(home)) {
    throw new Error(`Traicebox home already exists: ${home}`);
  }

  templateFs.mkdir(home);

  for (const entry of TEMPLATE_FILES) {
    const targetPath = join(home, entry.target);
    if (mode === "create-missing" && templateFs.exists(targetPath)) {
      continue;
    }

    templateFs.mkdir(dirname(targetPath));

    let sourcePath = entry.source;
    if (!isAbsolute(sourcePath)) {
      const currentDir =
        typeof import.meta.dirname === "string"
          ? import.meta.dirname
          : dirname(fileURLToPath(import.meta.url));
      sourcePath = join(currentDir, sourcePath);
    }

    await templateFs.write(targetPath, await readFile(sourcePath, "utf-8"));

    if (entry.mode) {
      templateFs.chmod(targetPath, entry.mode);
    }
  }
}

export async function writeDevelopmentDotenv(
  home: string,
  stackEnv: StackEnv,
): Promise<void> {
  await writeFile(join(home, ".env"), serializeStackEnv(stackEnv), "utf-8");
}

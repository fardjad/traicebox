import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import yaml from "yaml";
import { fail } from "./errors";

export type LiteLLMModelEntry = {
  model_name?: string;
  litellm_params?: {
    model?: string;
    api_base?: string;
    api_key?: string;
  };
};

export type LiteLLMConfig = {
  model_list?: LiteLLMModelEntry[];
  [key: string]: unknown;
};

export async function readLiteLLMConfig(
  configPath: string,
): Promise<LiteLLMConfig> {
  if (!existsSync(configPath)) {
    fail(`Config file not found: ${configPath}`);
  }

  const fileContent = await readFile(configPath, "utf-8");
  return yaml.parse(fileContent) as LiteLLMConfig;
}

export async function writeLiteLLMConfig(
  configPath: string,
  config: LiteLLMConfig,
): Promise<void> {
  const rewrittenConfig = yaml.stringify(config);
  await writeFile(configPath, rewrittenConfig, "utf-8");
}

import {
  DEFAULT_EDGE_PORT,
  DEFAULT_LITELLM_CLIENT_KEY,
  LITELLM_HOST,
} from "../lib/constants";
import { fail } from "../lib/errors";
import { readLiteLLMConfig } from "../lib/litellm-config";
import { getRuntime } from "../lib/runtime";
import type { StackEnv } from "../lib/stack-env";

type OpencodeProviderConfig = {
  $schema: string;
  provider: {
    litellm: {
      npm: string;
      name: string;
      options: {
        baseURL: string;
        apiKey: string;
      };
      models: Record<string, { name: string }>;
    };
  };
};

function makeDisplayName(modelName: string): string {
  return `${modelName} (Local)`;
}

function getModelNames(config: {
  model_list?: Array<{ model_name?: string }>;
}): string[] {
  return (config.model_list ?? [])
    .map((entry) => entry.model_name?.trim())
    .filter((value): value is string => Boolean(value));
}

function buildOpencodeConfig(
  modelNames: string[],
  stackEnv: StackEnv,
): OpencodeProviderConfig {
  return {
    $schema: "https://opencode.ai/config.json",
    provider: {
      litellm: {
        npm: "@ai-sdk/openai-compatible",
        name: "LiteLLM",
        options: {
          baseURL: `http://${LITELLM_HOST}:${stackEnv.TRAICEBOX_PORT ?? DEFAULT_EDGE_PORT}/v1`,
          apiKey: stackEnv.LITELLM_CLIENT_KEY ?? DEFAULT_LITELLM_CLIENT_KEY,
        },
        models: Object.fromEntries(
          modelNames.map((modelName) => [
            modelName,
            {
              name: makeDisplayName(modelName),
            },
          ]),
        ),
      },
    },
  };
}

export async function printOpencodeConfig(configPath: string): Promise<void> {
  const config = await readLiteLLMConfig(configPath);
  const modelNames = getModelNames(config);

  if (modelNames.length === 0) {
    fail(`No models found in ${configPath}. Import models first.`);
  }

  process.stdout.write(
    `${JSON.stringify(buildOpencodeConfig(modelNames, getRuntime().stackEnv), null, 2)}\n`,
  );
}

export { buildOpencodeConfig };

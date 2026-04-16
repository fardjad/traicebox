import { fail } from "../lib/errors";
import {
  type LiteLLMModelEntry,
  readLiteLLMConfig,
  writeLiteLLMConfig,
} from "../lib/litellm-config";

type OpenAIModel = {
  id?: string;
};

type OpenAIModelsResponse = {
  data?: OpenAIModel[];
};

type LiteLLMConfigStore = {
  read(
    configPath: string,
  ): Promise<Awaited<ReturnType<typeof readLiteLLMConfig>>>;
  write(
    configPath: string,
    config: Awaited<ReturnType<typeof readLiteLLMConfig>>,
  ): Promise<void>;
};

type InternalConfigDependencies = {
  configStore?: LiteLLMConfigStore;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

const defaultConfigStore: LiteLLMConfigStore = {
  read: readLiteLLMConfig,
  write: writeLiteLLMConfig,
};

async function fetchModelIds(
  endpoint: string,
  apiKeyEnv: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const headers = new Headers();
  const apiKey = process.env[apiKeyEnv];
  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  const response = await fetchImpl(endpoint, { headers });

  if (!response.ok) {
    fail(`Request failed with ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OpenAIModelsResponse;

  if (!payload.data || !Array.isArray(payload.data)) {
    fail("Endpoint response did not include a data array");
  }

  const modelIds = payload.data
    .map((model) => model?.id?.trim())
    .filter((modelId): modelId is string => Boolean(modelId));

  if (modelIds.length === 0) {
    fail("Endpoint returned no model ids");
  }

  return [...new Set(modelIds)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function toLiteLLMApiBase(endpoint: string): string {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    fail(`Invalid endpoint URL: ${endpoint}`);
  }

  const pathname = url.pathname.replace(/\/models\/?$/, "");
  const hostname =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "0.0.0.0"
      ? "host.docker.internal"
      : url.hostname;

  return `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ""}${pathname || ""}`;
}

function toModelList(
  modelIds: string[],
  provider: string,
  apiBase: string,
  apiKeyEnv: string,
): LiteLLMModelEntry[] {
  return modelIds.map((modelId) => {
    const prefixedModel = modelId.startsWith(`${provider}/`)
      ? modelId
      : `${provider}/${modelId}`;

    return {
      model_name: modelId,
      litellm_params: {
        model: prefixedModel,
        api_base: apiBase,
        api_key: `os.environ/${apiKeyEnv}`,
      },
    };
  });
}

export async function importModelsFromOpenAICompatibleApi(
  endpoint: string,
  configPath: string,
  apiKeyEnv: string,
  dependencies: InternalConfigDependencies = {},
): Promise<void> {
  const configStore = dependencies.configStore ?? defaultConfigStore;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const log = dependencies.log ?? console.log;
  const parsedConfig = await configStore.read(configPath);
  const modelIds = await fetchModelIds(endpoint, apiKeyEnv, fetchImpl);
  const apiBase = toLiteLLMApiBase(endpoint);
  const modelList = toModelList(modelIds, "openai", apiBase, apiKeyEnv);

  await configStore.write(configPath, {
    ...parsedConfig,
    model_list: modelList,
  });

  log(
    `Imported ${modelIds.length} model${modelIds.length === 1 ? "" : "s"} into ${configPath}`,
  );
}

export async function clearImportedModels(
  configPath: string,
  dependencies: Pick<InternalConfigDependencies, "configStore" | "log"> = {},
): Promise<void> {
  const configStore = dependencies.configStore ?? defaultConfigStore;
  const log = dependencies.log ?? console.log;
  const parsedConfig = await configStore.read(configPath);
  const removedCount = parsedConfig.model_list?.length ?? 0;

  await configStore.write(configPath, {
    ...parsedConfig,
    model_list: [],
  });

  log(
    `Removed ${removedCount} model${removedCount === 1 ? "" : "s"} from ${configPath}`,
  );
}

export { toLiteLLMApiBase };

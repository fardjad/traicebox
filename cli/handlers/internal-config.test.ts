import { describe, expect, test } from "bun:test";

import type { LiteLLMConfig } from "../lib/litellm-config";
import {
  clearImportedModels,
  importModelsFromOpenAICompatibleApi,
  toLiteLLMApiBase,
} from "./internal-config";

describe("importModelsFromOpenAICompatibleApi", () => {
  test("rewrites only model_list", async () => {
    const configPath = "/virtual/config.yaml";
    let storedConfig: LiteLLMConfig & {
      litellm_settings: { callbacks: string[] };
    } = {
      model_list: [
        {
          model_name: "old-model",
          litellm_params: {
            model: "old-model",
          },
        },
      ],
      litellm_settings: {
        callbacks: ["langfuse_otel"],
      },
    };

    await importModelsFromOpenAICompatibleApi(
      "http://localhost:1234/v1/models",
      configPath,
      "OPENAI_COMPATIBLE_API_KEY",
      {
        configStore: {
          read: async () => storedConfig,
          write: async (_path, config) => {
            storedConfig = config as typeof storedConfig;
          },
        },
        fetchImpl: (() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ data: [{ id: "google/gemma-4-e2b" }] }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            ),
          )) as unknown as typeof fetch,
        log: () => {},
      },
    );

    expect(storedConfig.litellm_settings.callbacks).toEqual(["langfuse_otel"]);
    expect(storedConfig.model_list).toEqual([
      {
        model_name: "google/gemma-4-e2b",
        litellm_params: {
          model: "openai/google/gemma-4-e2b",
          api_base: "http://host.docker.internal:1234/v1",
          api_key: "os.environ/OPENAI_COMPATIBLE_API_KEY",
        },
      },
    ]);
  });

  test("normalizes local hostnames for api_base", () => {
    expect(toLiteLLMApiBase("http://127.0.0.1:11434/v1/models")).toBe(
      "http://host.docker.internal:11434/v1",
    );
  });
});

describe("clearImportedModels", () => {
  test("empties model_list", async () => {
    const configPath = "/virtual/config.yaml";
    let storedConfig: LiteLLMConfig = {
      model_list: [
        {
          model_name: "old-model",
          litellm_params: {
            model: "old-model",
          },
        },
      ],
    };

    await clearImportedModels(configPath, {
      configStore: {
        read: async () => storedConfig,
        write: async (_path, config) => {
          storedConfig = config as typeof storedConfig;
        },
      },
      log: () => {},
    });

    expect(storedConfig.model_list).toEqual([]);
  });
});

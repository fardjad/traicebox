#!/usr/bin/env node

import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  installDockerLifecycleSignalHandlers,
  runStackCommand,
} from "./handlers/docker-lifecycle";
import { printOpencodeConfig } from "./handlers/external-config";
import {
  clearImportedModels,
  importModelsFromOpenAICompatibleApi,
} from "./handlers/internal-config";
import { runSetup } from "./handlers/setup";
import { DEFAULT_API_KEY_ENV } from "./lib/constants";
import { getDefaultLiteLLMConfigPath, initializeRuntime } from "./lib/runtime";
import { materializeTemplate, writeDevelopmentDotenv } from "./lib/template";

type StackArgs = {
  logs: boolean;
};

type ImportModelsArgs = {
  endpoint: string;
  config: string;
  provider?: string;
  apiKeyEnv: string;
};

type SetupArgs = {
  force: boolean;
};

type ClearModelsArgs = {
  config: string;
};

const requestedCommand = hideBin(process.argv)[0];
const runtime = initializeRuntime();

if (runtime.dev && requestedCommand !== "setup") {
  await materializeTemplate(runtime.home, "create-missing");
  await writeDevelopmentDotenv(runtime.home, runtime.stackEnv);
}

installDockerLifecycleSignalHandlers();

const defaultConfigPath = getDefaultLiteLLMConfigPath();

await yargs(hideBin(process.argv))
  .scriptName("traicebox")
  .command(
    "setup",
    "Create the Traicebox home directory",
    (cmd: Argv) =>
      cmd.option("force", {
        alias: "f",
        type: "boolean",
        default: false,
        describe: "Delete the existing home directory and recreate it",
      }),
    async (argv) => {
      await runSetup((argv as SetupArgs).force);
    },
  )
  .command(
    "start",
    "Start the stack and wait until it is ready",
    (cmd: Argv) =>
      cmd.option("logs", {
        alias: "l",
        type: "boolean",
        default: false,
        describe: "Show docker compose output while starting",
      }),
    async (argv) => {
      await runStackCommand("start", (argv as StackArgs).logs);
    },
  )
  .command(
    "stop",
    "Stop the stack",
    (cmd: Argv) =>
      cmd.option("logs", {
        alias: "l",
        type: "boolean",
        default: false,
        describe: "Show docker compose output while stopping",
      }),
    async (argv) => {
      await runStackCommand("stop", (argv as StackArgs).logs);
    },
  )
  .command(
    "restart",
    "Recreate the stack and wait until it is ready",
    (cmd: Argv) =>
      cmd.option("logs", {
        alias: "l",
        type: "boolean",
        default: false,
        describe: "Show docker compose output while restarting",
      }),
    async (argv) => {
      await runStackCommand("restart", (argv as StackArgs).logs);
    },
  )
  .command(
    "destroy",
    "Remove the stack and local data volumes",
    (cmd: Argv) =>
      cmd.option("logs", {
        alias: "l",
        type: "boolean",
        default: false,
        describe: "Show docker compose output while destroying",
      }),
    async (argv) => {
      await runStackCommand("destroy", (argv as StackArgs).logs);
    },
  )
  .command(
    "models <command>",
    "Manage imported LiteLLM models",
    (cmd: Argv) =>
      cmd
        .command(
          "import-from-openai-api",
          "Import models from an OpenAI-compatible endpoint into LiteLLM config",
          (subcmd: Argv) =>
            subcmd
              .option("endpoint", {
                alias: "e",
                type: "string",
                demandOption: true,
                describe:
                  "Models endpoint URL or alias (lm-studio, ollama, llama-cpp)",
              })
              .option("config", {
                alias: "c",
                type: "string",
                default: defaultConfigPath,
                describe: "LiteLLM YAML config to rewrite",
              })
              .option("api-key-env", {
                type: "string",
                default: DEFAULT_API_KEY_ENV,
                describe: "Environment variable name for the upstream API key",
              }),
          async (argv) => {
            const args = argv as ImportModelsArgs;
            await importModelsFromOpenAICompatibleApi(
              args.endpoint,
              args.config,
              args.apiKeyEnv,
            );
          },
        )
        .command(
          "clear",
          "Remove imported models from LiteLLM config",
          (subcmd: Argv) =>
            subcmd.option("config", {
              alias: "c",
              type: "string",
              default: defaultConfigPath,
              describe: "LiteLLM YAML config to update",
            }),
          async (argv) => {
            await clearImportedModels((argv as ClearModelsArgs).config);
          },
        )
        .demandCommand(1)
        .strict(),
    () => {},
  )
  .command(
    "generate-harness-config <target>",
    "Print config for external tools",
    (cmd: Argv) =>
      cmd
        .positional("target", {
          type: "string",
          choices: ["opencode"],
          describe: "Target tool to generate config for",
        })
        .option("config", {
          alias: "c",
          type: "string",
          default: defaultConfigPath,
          describe: "LiteLLM YAML config to read models from",
        }),
    async (argv) => {
      await printOpencodeConfig(String(argv.config ?? defaultConfigPath));
    },
  )
  .completion("completion", "Generate shell completion script")
  .demandCommand(1)
  .strict()
  .help()
  .parseAsync();

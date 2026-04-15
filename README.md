# Tr**ai**cebox

Tr**ai**cebox is a zero-config local developer stack for tracing and session tracking around LLM and AI model workflows.

It includes:

- LiteLLM with a custom callback for session tracking
- Langfuse
- Auto-login proxies for LiteLLM UI and Langfuse
- Config generator for Harness Tools such as OpenCode

## Installation

### Published Package (Recommended)

You can install Traicebox via NPM or Bun:

```bash
# Using Bun
bun install -g traicebox

# Using NPM
npm install -g traicebox
```

### Binary Release

Download the latest prebuilt binary for your platform from the [GitHub Releases](https://github.com/fardjad/traicebox/releases) page.

Once downloaded, make it executable and move it to your path:

```bash
chmod +x traicebox-macos-arm64
mv traicebox-macos-arm64 /usr/local/bin/traicebox
```

## Shell Completion

Traicebox supports shell completion for Bash and Zsh.

### Zsh

Add the following to your `~/.zshrc`:

```bash
# Enable completion if not already enabled
autoload -Uz compinit && compinit

source <(traicebox completion)
```

### Bash

Add the following to your `~/.bashrc`:

```bash
source <(traicebox completion)
```

## Usage

Create the local Traicebox home:

```bash
traicebox setup
```

Start the stack:

```bash
traicebox start
```

Other useful commands:

```bash
traicebox stop
traicebox restart
traicebox destroy
traicebox models import-from-openai-api
traicebox models clear
traicebox generate-harness-config opencode
```

The public endpoints are:

- LiteLLM: `http://litellm.localhost:8080`
- Langfuse: `http://langfuse.localhost:8080`

## Configuration

Traicebox stores its configuration and data in `${TRAICEBOX_HOME}`. You can override this location by setting the `TRAICEBOX_HOME` environment variable.

By default, it is located at:

| OS | Default `${TRAICEBOX_HOME}` |
| :--- | :--- |
| **macOS** | `~/Library/Application Support/Traicebox` |
| **Windows** | `%APPDATA%\Traicebox` |
| **Linux / Others** | `~/.config/traicebox` (or respects `$XDG_CONFIG_HOME`) |

## LiteLLM

LiteLLM loads its proxy config from `${TRAICEBOX_HOME}/litellm/config.yaml`. The LiteLLM UI is available at `http://litellm.localhost:8080`, where Traicebox automatically manages your admin session for immediate access.

`${TRAICEBOX_HOME}/litellm/config.yaml` is the source of truth for model routing and upstream API wiring. Imported models are written directly into `model_list`, with `api_base` inferred from the import endpoint and `api_key` read from `os.environ/OPENAI_COMPATIBLE_API_KEY`.

`OPENAI_COMPATIBLE_API_KEY` is intentionally not persisted by Tr**ai**cebox. For local backends such as LM Studio, Ollama, or llama.cpp, no secret is needed. For authenticated upstreams, run `traicebox` through your password manager CLI so it injects `OPENAI_COMPATIBLE_API_KEY` into the process; Tr**ai**cebox will materialize that into an ephemeral Docker secret for LiteLLM only.

To replace the LiteLLM `model_list` from an OpenAI-compatible `/v1/models` endpoint:

```bash
traicebox models import-from-openai-api
```

If that endpoint requires auth, inject `OPENAI_COMPATIBLE_API_KEY` into the command environment first. If it does not, the command works without a key.

To clear the LiteLLM `model_list`:

```bash
traicebox models clear
```

To print an OpenCode config snippet for the current LiteLLM models:

```bash
traicebox generate-harness-config opencode
```

## Langfuse

LiteLLM sends OTEL traces to Langfuse using the built-in `langfuse_otel` callback and `LANGFUSE_OTEL_HOST=http://langfuse-web:3000`.

Langfuse is accessible at `http://langfuse.localhost:8080`. By default, Traicebox disables public signups and automatically creates a browser session for the seeded admin user so you can start tracing immediately.


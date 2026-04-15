# Tr**ai**cebox

Tr**ai**cebox is a zero-config local developer stack for tracing and session tracking around LLM and AI model workflows.

It includes:

- LiteLLM with a custom callback for session tracking
- Langfuse
- Auto-login proxies for LiteLLM UI and Langfuse
- Config generator for Harness Tools such as OpenCode

## Prerequisites

Traicebox requires [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) to be installed and running on your system.

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

### 1. Initial Setup

Initialize the Traicebox home directory:

```bash
traicebox setup
```

### 2. Import Models

Before starting the stack, you need to import your available models into LiteLLM. By default, Traicebox looks for an [LM Studio](https://lmstudio.ai/) endpoint at `http://localhost:1234/v1/models`.

```bash
traicebox models import-from-openai-api
```

To use a different OpenAI-compatible endpoint:

```bash
traicebox models import-from-openai-api --endpoint http://your-api:port/v1/models
```

If the endpoint requires authentication, provide the API key via the `OPENAI_COMPATIBLE_API_KEY` environment variable:

```bash
OPENAI_COMPATIBLE_API_KEY="your-api-key" traicebox models import-from-openai-api --endpoint http://your-api:port/v1/models
```


### 3. Configure External Tools (Optional)

If you use [OpenCode](https://github.com/fardjad/opencode), you can synchronize its model configuration with Traicebox.

> [!WARNING]
> The following command will overwrite your existing OpenCode configuration file.

```bash
traicebox generate-harness-config opencode > ~/.config/opencode/opencode.jsonc
```

### 4. Start the Stack

```bash
traicebox start
```

Once running, you can access the public endpoints:

- **LiteLLM**: `http://litellm.localhost:5483`
- **Langfuse**: `http://langfuse.localhost:5483`

### 5. Verify and Test

If you configured OpenCode in step 3, you can test the integration:

```bash
# Refresh the models cache
opencode models --refresh

# Run a test prompt
opencode run -m 'litellm/your/model' 'Just write a greeting message!'
```

> [!NOTE]
> Replace `'litellm/your/model'` with one of the models imported in step 2.

After running a prompt, you can inspect the captured traces in Langfuse by visiting:
[http://langfuse.localhost:5483/project/local-project/sessions](http://langfuse.localhost:5483/project/local-project/sessions)

There, you can select the latest session to inspect system prompts, user messages, and tool interactions.

### Other Useful Commands

| Command | Description |
| :--- | :--- |
| `traicebox stop` | Stop the stack. |
| `traicebox restart` | Recreate and restart the stack. |
| `traicebox destroy` | Remove the stack and delete local data volumes. |
| `traicebox models clear` | Clear the custom model list from LiteLLM. |

For more information on available commands and options, run `traicebox --help`.


## Configuration

Traicebox stores its configuration and data in `${TRAICEBOX_HOME}`. You can override this location by setting the `TRAICEBOX_HOME` environment variable.

By default, it is located at:

| OS | Default `${TRAICEBOX_HOME}` |
| :--- | :--- |
| **macOS** | `~/Library/Application Support/Traicebox` |
| **Windows** | `%APPDATA%\Traicebox` |
| **Linux / Others** | `~/.config/traicebox` (or respects `$XDG_CONFIG_HOME`) |

### `traicebox.yaml`

You can customize the stack behavior by creating or editing `${TRAICEBOX_HOME}/traicebox.yaml`.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | `string` | `127.0.0.1` | The host address that Traicebox services will bind to. |
| `port` | `number` | `5483` | The port that Traicebox services will be accessible through. |

Example:

```yaml
host: 127.0.0.1
port: 5483
```


## LiteLLM

LiteLLM loads its proxy config from `${TRAICEBOX_HOME}/litellm/config.yaml`. The LiteLLM UI is available at `http://litellm.localhost:5483`, where Traicebox automatically manages your admin session for immediate access.

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

Langfuse is accessible at `http://langfuse.localhost:5483`. By default, Traicebox disables public signups and automatically creates a browser session for the seeded admin user so you can start tracing immediately.


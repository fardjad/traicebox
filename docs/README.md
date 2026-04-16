# Traicebox

**Traicebox** is a zero-config local developer stack for tracing and session tracking around LLM and AI model workflows. It enables developers to have a working local tracing and inspection setup within minutes.

### Key Use Cases

- **Tool & Prompt Development**: Debug plugins, skills, or prompts for harness tools like [OpenCode](https://opencode.ai/) with full visibility.
- **Model Evaluation**: Evaluate and compare local models with detailed trace logging. The built-in config generator makes setting up tools remarkably simple.
- **Application Development**: Build AI applications with minimal code changes. Requests routed through the built-in LiteLLM proxy automatically generate traces in Langfuse. You can group these traces into sessions by adding an `x-litellm-session-id` header to your requests.

### Included in the Stack

- **LiteLLM**: Unified proxy for LLM backends with custom session-tracking callbacks.
- **Langfuse**: Open-source tracing and observability for LLM applications.
- **Auto-login Proxies**: Dynamic proxies providing immediate, authenticated access to LiteLLM UI and Langfuse.
- **Harness Integration**: Automatic configuration generation for external tools like OpenCode.

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

Before starting the stack, you need to import your available models into LiteLLM. Traicebox requires an endpoint URL or alias to fetch models from.

Supported aliases for common local tools:

| Alias       | Default Endpoint URL               |
| :---------- | :--------------------------------- |
| `lm-studio` | `http://127.0.0.1:1234/v1/models`  |
| `ollama`    | `http://localhost:11434/v1/models` |
| `llama-cpp` | `http://localhost:8080/v1/models`  |

```bash
traicebox models import-from-openai-api --endpoint lm-studio
```

To use a custom OpenAI-compatible endpoint URL:

```bash
traicebox models import-from-openai-api --endpoint http://your-api:port/v1/models
```

If the endpoint requires authentication, provide the API key via the `OPENAI_COMPATIBLE_API_KEY` environment variable:

```bash
OPENAI_COMPATIBLE_API_KEY="your-api-key" traicebox models import-from-openai-api --endpoint http://your-api:port/v1/models
```

### 3. Configure Harness Integration (Optional)

If you use [OpenCode](https://opencode.ai/), you can synchronize its model configuration with Traicebox.

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

#### Application Integration (with Session Tracking)

You can integrate Traicebox into your own applications by pointing your LLM client to the LiteLLM proxy. To group related traces together, simply include an `x-litellm-session-id` header in your requests.

Here is an example using `curl` to demonstrate session grouping:

```bash
MODEL_NAME="your-model-name"

# First request in a session
curl http://litellm.localhost:5483/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-local-client" \
  -H "x-litellm-session-id: my-test-session" \
  -d "{
    \"model\": \"$MODEL_NAME\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Hello! This is a test message to start my session.\"}]
  }"

# Second request in the same session
curl http://litellm.localhost:5483/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-local-client" \
  -H "x-litellm-session-id: my-test-session" \
  -d "{
    \"model\": \"$MODEL_NAME\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Goodbye! I am done with this test session.\"}]
  }"
```

> [!NOTE]
> Set `MODEL_NAME` to one of the exact model names imported in step 2. The default API key is `sk-litellm-local-client`.

Refresh the [Langfuse sessions page](http://langfuse.localhost:5483/project/local-project/sessions) to see both traces grouped under the `my-test-session` ID.

### Other Useful Commands

| Command                  | Description                                     |
| :----------------------- | :---------------------------------------------- |
| `traicebox stop`         | Stop the stack.                                 |
| `traicebox restart`      | Recreate and restart the stack.                 |
| `traicebox destroy`      | Remove the stack and delete local data volumes. |
| `traicebox models clear` | Clear the custom model list from LiteLLM.       |

For more information on available commands and options, run `traicebox --help`.

## Configuration

Traicebox stores its configuration and data in `${TRAICEBOX_HOME}`. You can override this location by setting the `TRAICEBOX_HOME` environment variable.

By default, it is located at:

| OS                 | Default `${TRAICEBOX_HOME}`                            |
| :----------------- | :----------------------------------------------------- |
| **macOS**          | `~/Library/Application Support/Traicebox`              |
| **Windows**        | `%APPDATA%\Traicebox`                                  |
| **Linux / Others** | `~/.config/traicebox` (or respects `$XDG_CONFIG_HOME`) |

### `traicebox.yaml`

You can customize the stack behavior by creating or editing `${TRAICEBOX_HOME}/traicebox.yaml`.

| Option | Type     | Default     | Description                                                  |
| :----- | :------- | :---------- | :----------------------------------------------------------- |
| `host` | `string` | `127.0.0.1` | The host address that Traicebox services will bind to.       |
| `port` | `number` | `5483`      | The port that Traicebox services will be accessible through. |

Example:

```yaml
host: 127.0.0.1
port: 5483
```

## LiteLLM

LiteLLM loads its proxy config from `${TRAICEBOX_HOME}/litellm/config.yaml`. The LiteLLM UI is available at `http://litellm.localhost:5483`, where Traicebox automatically manages your admin session for immediate access.

`${TRAICEBOX_HOME}/litellm/config.yaml` is the source of truth for model routing and upstream API wiring. Imported models are written directly into `model_list`, with `api_base` inferred from the import endpoint and `api_key` read from `os.environ/OPENAI_COMPATIBLE_API_KEY`.

`OPENAI_COMPATIBLE_API_KEY` is intentionally not persisted by Tr**ai**cebox. For local backends such as LM Studio, Ollama, or llama.cpp, no secret is needed. For authenticated upstreams, run `traicebox` through your password manager CLI so it injects `OPENAI_COMPATIBLE_API_KEY` into the process; Tr**ai**cebox will materialize that into an ephemeral Docker secret for LiteLLM only.

To replace the LiteLLM `model_list` from an OpenAI-compatible `/v1/models` endpoint (or alias like `lm-studio`, `ollama`, `llama-cpp`):

```bash
traicebox models import-from-openai-api --endpoint lm-studio
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

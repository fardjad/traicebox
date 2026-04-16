# Contributing

This repository uses `traicebox` as a template-backed local stack. The checked-in files under `template/` are the source for the generated Traicebox home directory.

## Local Development

Install dependencies:

```bash
bun install
```

Run the stack in repo-local dev mode:

```bash
TRAICEBOX_DEV=1 bun run traicebox start
```

## Global Development Link

For a better developer experience, you can register your local `traicebox` build as a global command on your system:

1. In this repository, run: `bun link`
2. You can now run the `traicebox` command from any directory on your system.

By default, the `traicebox` command points to `./dist/index.js`. This means you must run `bun run build` to see your changes reflected in the global command.

> [!TIP]
> To avoid rebuilding during active development, you can temporarily change the `bin` field in `package.json` to point to `./cli/index.ts` instead of `./dist/index.js`, then run `bun link`. This allows you to run the global `traicebox` command with hot-reloading (via Bun's native TS execution). Remember to revert this change before committing.

`TRAICEBOX_DEV=1` switches the active home to a gitignored `./.traicebox` directory, materializes the template there, and writes a local `.env` into that generated home.

You can override the active home explicitly:

```bash
TRAICEBOX_HOME=/path/to/home bun run traicebox start
```

## Template Layout

The template is materialized into the active Traicebox home and contains:

- `compose.yml`
- `caddy/`
- `langfuse-proxy/`
- `litellm/`
- `litellm-ui-proxy/`
- `postgres/`

The CLI reads and rewrites `litellm/config.yaml` in that home when importing or clearing models.

## Build

Bundle the CLI for distribution:

```bash
bun run build
```

The compiled output in `./dist/index.js` disables Bun dotenv autoloading so runtime behavior comes from the CLI and the active home rather than ambient `.env` discovery.

## Tests

Run the targeted test suite:

```bash
bun test
```

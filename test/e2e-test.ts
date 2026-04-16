import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { parse } from "yaml";

// Ensure all commands execute from the project root, regardless of where the script was invoked
process.chdir(join(import.meta.dir, ".."));

type ShellResult = ReturnType<typeof $>;

const TARGET_MODEL = "google/gemma-4-26b-a4b";
const MODELS_ENDPOINT = "http://127.0.0.1:1234/v1";

async function buildProject() {
  console.log("Building the project...");
  await $`bun install`.quiet();
  await $`bun run build`.quiet();
}

async function createTestEnvironment() {
  console.log("Creating isolated Traicebox environment...");
  const tempDir = join(
    tmpdir(),
    `traicebox-smoke-${Math.random().toString(36).slice(2, 10)}`,
  );
  const env = { ...process.env, TRAICEBOX_HOME: tempDir, TRAICEBOX_DEV: "1" };
  const runCmd = (args: string[]) =>
    $`bun ./dist/index.js ${args}`.env(env).throws(true);

  return { tempDir, env, runCmd };
}

async function setupAndImportModels(runCmd: (args: string[]) => ShellResult) {
  console.log(
    `Setting up defaults and importing models from ${MODELS_ENDPOINT}...`,
  );
  await runCmd(["setup"]);
  await runCmd([
    "models",
    "import-from-openai-api",
    "--endpoint",
    MODELS_ENDPOINT,
  ]);
}

async function verifyTargetModelAvailability(tempDir: string) {
  console.log(`Verifying target model (${TARGET_MODEL}) availability...`);
  const litellmConfigPath = join(tempDir, "litellm/config.yaml");
  const litellmConfigStr = await Bun.file(litellmConfigPath).text();
  const litellmConfig = parse(litellmConfigStr);
  const modelNames =
    litellmConfig.model_list?.map(
      (m: { model_name: string }) => m.model_name,
    ) || [];

  if (!modelNames.includes(TARGET_MODEL)) {
    throw new Error(
      `The smoke test requires the '${TARGET_MODEL}' model to be loaded at ${MODELS_ENDPOINT}.`,
    );
  }
}

async function configureAndStartStack(
  tempDir: string,
  runCmd: (args: string[]) => ShellResult,
): Promise<number> {
  console.log("Selecting a free port and starting the stack...");
  // Bind briefly to port 0 to let the OS reliably assign an available ephemeral port
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response("");
    },
  });
  const port = server.port;
  server.stop();

  if (typeof port !== "number") {
    throw new Error("Failed to acquire a valid port from the OS.");
  }

  await Bun.write(
    join(tempDir, "traicebox.yaml"),
    `host: 127.0.0.1\nport: ${port}\n`,
  );

  await runCmd(["start"]);

  return port;
}

async function performSimulatedRequests(port: number) {
  console.log("Simulating LiteLLM proxy chat completion requests...");
  const sendRequest = async (message: string) => {
    await fetch(`http://litellm.localhost:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-litellm-local-client",
        "x-litellm-session-id": "my-test-session",
      },
      body: JSON.stringify({
        model: TARGET_MODEL,
        messages: [{ role: "user", content: message }],
      }),
    });
  };

  await sendRequest("Hello! This is a test message to start my session.");
  await sendRequest("Goodbye! I am done with this test session.");
}

async function pollForLangfuseTraces(port: number) {
  console.log(
    "Authenticating Langfuse and preparing to poll TRPC dashboard...",
  );

  // We need to parse NextAuth cookies properly into an ephemeral cookie jar string
  const cookieMap = new Map<string, string>();
  let currentUrl = `http://langfuse.localhost:${port}/`;

  for (let step = 0; step < 5; step++) {
    const cookieHeader = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const res = await fetch(currentUrl, {
      method: "GET",
      headers: { Cookie: cookieHeader },
      redirect: "manual",
    });

    // Node/Bun fetch supports getSetCookie() to avoid commas collapsing chunked cookies
    const setCookies = res.headers.getSetCookie();
    for (const c of setCookies) {
      const kv = c.split(";")[0]; // Extract just the key=value part
      if (kv == null) continue;
      if (kv.includes("=")) {
        const [key, ...vals] = kv.split("=");
        if (key == null) continue;
        cookieMap.set(key.trim(), vals.join("="));
      }
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      currentUrl = loc.startsWith("http")
        ? loc
        : `http://langfuse.localhost:${port}${loc}`;
    } else {
      break;
    }
  }

  const cookieStr = Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const traceUrl = `http://langfuse.localhost:${port}/api/trpc/traces.all?input=%7B%22json%22%3A%7B%22projectId%22%3A%22local-project%22%2C%22filter%22%3A%5B%5D%2C%22searchQuery%22%3Anull%2C%22searchType%22%3A%5B%22id%22%5D%2C%22page%22%3A0%2C%22limit%22%3A50%2C%22orderBy%22%3A%7B%22column%22%3A%22timestamp%22%2C%22order%22%3A%22DESC%22%7D%7D%2C%22meta%22%3A%7B%22values%22%3A%7B%7D%7D%7D`;

  console.log(`Polling Langfuse for traces (Timeout: 5 minutes)...`);

  for (let i = 0; i < 30; i++) {
    await Bun.sleep(10000);
    const res = await fetch(traceUrl, {
      headers: {
        Cookie: cookieStr,
      },
    });

    const rawOut = await res.text();

    try {
      const data = JSON.parse(rawOut);
      const traces = data.result?.data?.json?.traces || [];

      const curlTraces = traces.filter(
        (t: { sessionId: string }) => t.sessionId === "my-test-session",
      );

      console.log(
        `Attempt ${i + 1}: Found ${curlTraces.length} explicit curl traces.`,
      );

      if (curlTraces.length === 2) {
        console.log(
          "Smoke test passed! All expected traces were found and correctly assigned sessions.",
        );
        return;
      }
    } catch (err) {
      console.error(`Error parsing TRPC response: ${err}`);
    }
  }

  throw new Error("Smoke test failed: Timeout waiting for expected traces.");
}

async function cleanupTestEnvironment(
  tempDir: string,
  runCmd: (args: string[]) => ShellResult,
) {
  console.log("Cleaning up test resources and destroying stack...");
  try {
    await runCmd(["destroy"]).quiet();
  } catch (_e) {
    console.warn(
      "Failed to cleanly destroy the test stack. It may have already exited.",
    );
  }
  await rm(tempDir, { recursive: true, force: true });
}

// --- Main Execution Flow --- //

await buildProject();

const { tempDir, runCmd } = await createTestEnvironment();

try {
  await setupAndImportModels(runCmd);

  await verifyTargetModelAvailability(tempDir);

  const port = await configureAndStartStack(tempDir, runCmd);

  await performSimulatedRequests(port);

  await pollForLangfuseTraces(port);
} finally {
  await cleanupTestEnvironment(tempDir, runCmd);
  console.log("Done.");
}

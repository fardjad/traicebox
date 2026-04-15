const upstreamOrigin = requiredEnv("LANGFUSE_UPSTREAM_ORIGIN");
const publicOrigin = requiredEnv("LANGFUSE_PUBLIC_ORIGIN");
const adminEmail = requiredEnv("LANGFUSE_INIT_USER_EMAIL");
const adminPassword = requiredEnv("LANGFUSE_INIT_USER_PASSWORD");
const autoLoginEnabled = envFlag("LANGFUSE_PROXY_AUTOLOGIN", true);
const port = Number(Bun.env.PORT ?? "3000");
const retryDelayMs = Number(Bun.env.LANGFUSE_PROXY_RETRY_DELAY_MS ?? "500");
const maxRetries = Number(Bun.env.LANGFUSE_PROXY_MAX_RETRIES ?? "20");

const sessionCookieNames = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

function requiredEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = Bun.env[name];
  if (value == null || value === "") {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function getSetCookies(headers: Headers): string[] {
  const bunHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof bunHeaders.getSetCookie === "function") {
    return bunHeaders.getSetCookie();
  }

  const singleValue = headers.get("set-cookie");
  return singleValue ? [singleValue] : [];
}

function serializeCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

function hasSessionCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return false;
  }

  return sessionCookieNames.some((name) => cookieHeader.includes(`${name}=`));
}

function appendSetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: URL, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

async function loginToLangfuse(): Promise<string[]> {
  const csrfResponse = await fetchWithRetry(
    new URL("/api/auth/csrf", upstreamOrigin),
    {
      redirect: "manual",
    },
  );

  if (!csrfResponse.ok) {
    throw new Error(`Langfuse CSRF request failed with ${csrfResponse.status}`);
  }

  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  if (!csrfPayload.csrfToken) {
    throw new Error("Langfuse CSRF response did not include csrfToken");
  }

  const csrfCookies = getSetCookies(csrfResponse.headers);
  const callbackBody = new URLSearchParams({
    email: adminEmail,
    password: adminPassword,
    csrfToken: csrfPayload.csrfToken,
    callbackUrl: publicOrigin,
    json: "true",
  });

  const callbackResponse = await fetchWithRetry(
    new URL("/api/auth/callback/credentials?json=true", upstreamOrigin),
    {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: serializeCookieHeader(csrfCookies),
      },
      body: callbackBody.toString(),
    },
  );

  if (callbackResponse.status >= 400) {
    throw new Error(
      `Langfuse credentials callback failed with ${callbackResponse.status}`,
    );
  }

  const mergedCookies = [
    ...csrfCookies,
    ...getSetCookies(callbackResponse.headers),
  ];
  if (!serializeCookieHeader(mergedCookies)) {
    throw new Error("Langfuse login callback did not return any cookies");
  }

  return mergedCookies;
}

async function checkLangfuseReadiness(): Promise<void> {
  const loginCookies = autoLoginEnabled ? await loginToLangfuse() : [];
  const headers = new Headers();
  const cookieHeader = serializeCookieHeader(loginCookies);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetchWithRetry(new URL("/", upstreamOrigin), {
    headers,
    redirect: "manual",
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (response.status >= 400 || !contentType.includes("text/html")) {
    throw new Error(`Langfuse readiness failed with ${response.status}`);
  }
}

async function proxyRequest(
  request: Request,
  extraCookies: string[] = [],
): Promise<Response> {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = new URL(upstreamOrigin).protocol;
  upstreamUrl.host = new URL(upstreamOrigin).host;

  const headers = copyRequestHeaders(request);
  if (extraCookies.length > 0) {
    const existingCookies = request.headers.get("cookie");
    const loginCookies = serializeCookieHeader(extraCookies);
    const combinedCookies = [existingCookies, loginCookies]
      .filter(Boolean)
      .join("; ");
    if (combinedCookies) {
      headers.set("cookie", combinedCookies);
    }
  }

  const response = await fetchWithRetry(upstreamUrl, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

const server = Bun.serve({
  port,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return new Response("ok");
    }

    if (url.pathname === "/readyz") {
      try {
        await checkLangfuseReadiness();
        return new Response("ok");
      } catch (error) {
        console.error("[langfuse-proxy] readiness check failed", error);
        return new Response("not ready", { status: 503 });
      }
    }

    if (!autoLoginEnabled || url.pathname.startsWith("/api/auth/")) {
      return proxyRequest(request);
    }

    if (hasSessionCookie(request)) {
      return proxyRequest(request);
    }

    try {
      const loginCookies = await loginToLangfuse();
      const response = await proxyRequest(request, loginCookies);
      const headers = new Headers(response.headers);
      appendSetCookies(headers, loginCookies);
      headers.set("cache-control", "no-store");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("[langfuse-proxy] auto-login failed", error);
      return new Response("Langfuse auto-login failed", { status: 502 });
    }
  },
});

console.log(`[langfuse-proxy] listening on :${server.port}`);

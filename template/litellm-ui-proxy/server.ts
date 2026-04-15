const upstreamOrigin = requiredEnv("LITELLM_UPSTREAM_ORIGIN");
const masterKey = requiredEnv("LITELLM_MASTER_KEY");
const uiUsername = Bun.env.LITELLM_UI_USERNAME ?? "admin";
const port = Number(Bun.env.PORT ?? "4000");
const retryDelayMs = Number(Bun.env.LITELLM_UI_PROXY_RETRY_DELAY_MS ?? "500");
const maxRetries = Number(Bun.env.LITELLM_UI_PROXY_MAX_RETRIES ?? "20");
const uiDefaultFlags = [
  "disableShowNewBadge",
  "disableShowPrompts",
  "disableUsageIndicator",
  "disableBlogPosts",
  "disableBouncingIcon",
] as const;

function requiredEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  headers.set("authorization", `Bearer ${masterKey}`);

  const existingCookies = request.headers.get("cookie");
  const mergedCookies = [existingCookies, `token=${masterKey}`]
    .filter(Boolean)
    .join("; ");
  headers.set("cookie", mergedCookies);
  return headers;
}

function extractTokenCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  return match?.[1] ?? null;
}

function mergeCookieHeader(
  existingCookieHeader: string | null,
  token: string,
): string {
  const cookies = [existingCookieHeader, `token=${token}`].filter(Boolean);
  return cookies.join("; ");
}

async function loginForUi(request: Request): Promise<string> {
  const requestUrl = new URL(request.url);
  const redirectTarget = `${requestUrl.origin}/ui/`;
  const body = new URLSearchParams({
    username: uiUsername,
    password: masterKey,
    redirect_to: redirectTarget,
  });

  const loginResponse = await fetchWithRetry(
    new URL("/login", upstreamOrigin),
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${masterKey}`,
      },
      body,
      redirect: "manual",
    },
  );

  const token = extractTokenCookie(loginResponse.headers.get("set-cookie"));
  if (!token) {
    throw new Error("LiteLLM UI login did not return a token cookie");
  }

  return token;
}

async function checkUiReadiness(): Promise<void> {
  const token = await loginForUi(new Request("http://localhost/ui/"));
  const response = await fetchWithRetry(new URL("/ui/", upstreamOrigin), {
    headers: {
      authorization: `Bearer ${masterKey}`,
      cookie: `token=${token}`,
    },
    redirect: "manual",
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/html")) {
    throw new Error(`LiteLLM UI readiness failed with ${response.status}`);
  }
}

function rewriteLocationHeader(
  request: Request,
  responseHeaders: Headers,
): void {
  const location = responseHeaders.get("location");
  if (!location) {
    return;
  }

  const requestOrigin = new URL(request.url).origin;
  const upstream = new URL(upstreamOrigin);

  try {
    const resolved = new URL(location, upstreamOrigin);
    if (resolved.origin === upstream.origin) {
      responseHeaders.set(
        "location",
        `${requestOrigin}${resolved.pathname}${resolved.search}${resolved.hash}`,
      );
    }
  } catch {
    // Leave malformed or non-URL locations untouched.
  }
}

function injectUiDefaults(html: string): string {
  const script = [
    "<script>",
    "try {",
    ...uiDefaultFlags.map(
      (flag) =>
        `if (window.localStorage.getItem(${JSON.stringify(flag)}) === null) window.localStorage.setItem(${JSON.stringify(flag)}, "true");`,
    ),
    "} catch {}",
    "</script>",
  ].join("");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }

  return `${script}${html}`;
}

async function proxyRequest(request: Request): Promise<Response> {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = new URL(upstreamOrigin).protocol;
  upstreamUrl.host = new URL(upstreamOrigin).host;
  const requestPath = new URL(request.url).pathname;

  let token = extractTokenCookie(request.headers.get("cookie"));
  if (requestPath.startsWith("/ui")) {
    token ??= await loginForUi(request);

    if (requestPath === "/ui/login" || requestPath === "/ui/login/") {
      upstreamUrl.pathname = "/ui/";
      upstreamUrl.search = "";
    }
  }

  const response = await fetchWithRetry(upstreamUrl, {
    method: request.method,
    headers: (() => {
      const headers = copyRequestHeaders(request);
      if (token) {
        headers.set(
          "cookie",
          mergeCookieHeader(request.headers.get("cookie"), token),
        );
      }
      return headers;
    })(),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  rewriteLocationHeader(request, responseHeaders);
  if (token) {
    responseHeaders.append(
      "set-cookie",
      `token=${token}; Path=/; SameSite=Lax`,
    );
  }

  const contentType = responseHeaders.get("content-type") ?? "";
  if (requestPath.startsWith("/ui") && contentType.includes("text/html")) {
    const html = await response.text();
    return new Response(injectUiDefaults(html), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

const server = Bun.serve({
  port,
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/healthz") {
      return new Response("ok");
    }

    if (pathname === "/readyz") {
      try {
        await checkUiReadiness();
        return new Response("ok");
      } catch (error) {
        console.error("[litellm-ui-proxy] readiness check failed", error);
        return new Response("not ready", { status: 503 });
      }
    }

    try {
      return await proxyRequest(request);
    } catch (error) {
      console.error("[litellm-ui-proxy] upstream request failed", error);
      return new Response("LiteLLM UI proxy upstream request failed", {
        status: 502,
      });
    }
  },
});

console.log(`[litellm-ui-proxy] listening on :${server.port}`);

const PAGES_ORIGIN = "https://antiantiai-site.pages.dev";
const BACKEND_ORIGIN = "https://balabot-server.onrender.com";

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("x-balabot-site-proxy", "antiantiai-pages");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname === "/balabot") {
      return Response.redirect(`${incomingUrl.origin}/balabot/`, 308);
    }

    let targetUrl;
    const isApi = incomingUrl.pathname.startsWith("/balabot/api/");

    if (isApi) {
      const strippedPath = incomingUrl.pathname.slice("/balabot".length) || "/";
      targetUrl = new URL(strippedPath + incomingUrl.search, BACKEND_ORIGIN);
    } else {
      targetUrl = new URL(PAGES_ORIGIN);
      targetUrl.pathname = incomingUrl.pathname;
      targetUrl.search = incomingUrl.search;
    }

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", incomingUrl.hostname);
    headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
    headers.set("X-Real-IP", headers.get("CF-Connecting-IP") || "");

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    try {
      const response = await fetch(proxyRequest);
      return isApi ? response : withCors(response);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "BalaBot Proxy Error",
          message: `Could not connect to origin server: ${err.message}`
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },
};

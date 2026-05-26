/**
 * Cloudflare Worker — AAA BalaBot Reverse Proxy
 *
 * This Worker intercepts all traffic to antiantiai.xyz/balabot/*
 * and proxies it to the origin Express server after stripping
 * the /balabot prefix.
 *
 * Deployment steps:
 *   1. Install Wrangler CLI: npm install -g wrangler
 *   2. Authenticate: wrangler login
 *   3. Edit wrangler.toml and set your ORIGIN_SERVER URL
 *   4. Deploy: wrangler deploy
 *   5. In Cloudflare Dashboard → Workers Routes, add route:
 *      antiantiai.xyz/balabot*  →  balabot-proxy
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── 1. Redirect /balabot → /balabot/ (trailing slash)
    if (url.pathname === '/balabot') {
      url.pathname = '/balabot/';
      return Response.redirect(url.toString(), 301);
    }

    // ── 2. Proxy all /balabot/* traffic to the origin server
    if (url.pathname.startsWith('/balabot/')) {
      // Origin server address — change this to your real server URL
      const ORIGIN = env.ORIGIN_SERVER || 'https://your-origin-server.com';

      // Strip /balabot prefix:
      //   /balabot/                    → /
      //   /balabot/api/bots            → /api/bots
      //   /balabot/assets/index-abc.js → /assets/index-abc.js
      const strippedPath = url.pathname.slice('/balabot'.length) || '/';
      const targetUrl = new URL(strippedPath + url.search, ORIGIN);

      // Clone headers and add forwarding info
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-Host', url.hostname);
      headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      headers.set('X-Real-IP', headers.get('CF-Connecting-IP') || '');

      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'manual',
      });

      try {
        const response = await fetch(proxyRequest);

        // Clone response and return with CORS-safe headers
        const newHeaders = new Headers(response.headers);
        newHeaders.set('X-Proxied-By', 'balabot-cloudflare-worker');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: 'BalaBot Proxy Error',
            message: `Could not connect to origin server: ${err.message}`,
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // ── 3. All other traffic on the domain — pass through
    return fetch(request);
  },
};

/**
 * Sabi merchant subdomain router
 *
 * Cloudflare route: *.sabibyxtop.com.ng/*
 * The Worker proxies subdomain traffic to the existing Netlify site while
 * preserving the original hostname in the browser. React uses that hostname
 * to resolve the merchant's business_slug.
 */
const NETLIFY_ORIGIN = "https://xtopbot.netlify.app";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const host = incomingUrl.hostname.toLowerCase();

    if (!host.endsWith(".sabibyxtop.com.ng")) {
      return fetch(request);
    }

    const subdomain = host.slice(0, -".sabibyxtop.com.ng".length);
    const reserved = new Set([
      "www", "app", "discover", "admin", "connect", "engr", "r",
      "mail", "api", "status", "help", "support", "auth", "assets"
    ]);

    // All existing Sabi subdomains are served by the same Netlify site.
    // The browser keeps its original hostname, so App.tsx can distinguish
    // app, Discover, admin and merchant storefront hosts.
    if (subdomain.includes(".") || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      return new Response("Invalid Sabi subdomain.", { status: 404 });
    }

    const upstreamUrl = new URL(NETLIFY_ORIGIN);
    // Assign pathname separately so a path beginning with // cannot replace
    // the trusted Netlify origin.
    upstreamUrl.pathname = incomingUrl.pathname;
    upstreamUrl.search = incomingUrl.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-forwarded-host", host);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-sabi-original-host", host);

    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual"
    });

    try {
      const response = await fetch(upstreamRequest);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("x-sabi-storefront-router", "cloudflare");

      // Preserve same-origin Netlify redirects on the requested Sabi hostname.
      const location = responseHeaders.get("location");
      if (location) {
        try {
          const redirectUrl = new URL(location, NETLIFY_ORIGIN);
          if (redirectUrl.origin === new URL(NETLIFY_ORIGIN).origin) {
            responseHeaders.set(
              "location",
              `${incomingUrl.origin}${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`
            );
          }
        } catch {
          // Leave non-URL Location values unchanged.
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (error) {
      console.error("Sabi Netlify origin request failed:", error);
      return new Response("Sabi storefront is temporarily unavailable. Please try again.", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};

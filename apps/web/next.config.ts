import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @pagepilot/core ships raw .ts; without this, webpack chokes on its types.
  transpilePackages: ["@pagepilot/core"],

  /**
   * Browsers ask for /favicon.ico on their own, including on every published
   * page, and there is no file there. The 404 came back with `max-age=0`, so
   * they asked again on the next view. `/icon` is prerendered and sends a
   * one-year `Cache-Control`, so pointing at it makes the request happen once.
   * A rewrite rather than a route: it resolves in the routing layer, which
   * costs no function invocation.
   */
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;

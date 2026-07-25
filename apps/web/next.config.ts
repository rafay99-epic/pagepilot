import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @pagepilot/core ships raw .ts; without this, webpack chokes on its types.
  transpilePackages: ["@pagepilot/core"],
  serverExternalPackages: ["@aws-sdk/client-s3"],
};

export default nextConfig;

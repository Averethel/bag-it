import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  outputFileTracingIncludes: {
    "/api/rebrickable/parts": ["./.cache/rebrickable-catalog/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;

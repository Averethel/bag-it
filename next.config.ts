import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "[::1]"],
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  outputFileTracingIncludes: {
    "/api/catalog/part-image": ["./.cache/rebrickable-catalog/**/*"],
    "/api/catalog/parts": ["./.cache/rebrickable-catalog/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/catalog/part-image": ["./.cache/rebrickable-images/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;

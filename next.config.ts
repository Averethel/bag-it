import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "[::1]"],
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  outputFileTracingIncludes: {
    "/api/catalogue/colors": [
      "./.bag-it/private/catalogue/**/*",
      "./.bag-it/private/catalogue.snapshots/**/*",
    ],
    "/api/catalogue/parts": [
      "./.bag-it/private/catalogue/**/*",
      "./.bag-it/private/catalogue.snapshots/**/*",
    ],
    "/api/catalogue/part-previews": [
      "./.bag-it/private/catalogue/**/*",
      "./.bag-it/private/catalogue.snapshots/**/*",
    ],
  },
  poweredByHeader: false,
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Avoid noisy dev-server pack-file warnings from large inline source maps.
      config.cache = { type: "memory" }
    }

    if (!isServer) {
      config.resolve = config.resolve ?? {}
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      }
    }

    return config
  },
}

export default nextConfig

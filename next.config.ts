import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@bag-it/callout-parts",
    "@bag-it/part-colors",
    "@bag-it/part-matching",
    "@bag-it/raster-quantity-labels",
    "@bag-it/step-callouts",
  ],
  webpack: (config, { dev }) => {
    if (!dev) {
      return config
    }

    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/.bag-it/**", "**/.npm-cache/**", "**/.pnpm-store/**"],
    }

    return config
  },
}

export default nextConfig

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a PDF.js worker that must not be bundled.
  serverExternalPackages: ["pdf-parse"],
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

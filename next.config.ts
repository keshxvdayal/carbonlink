import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a PDF.js worker and exceljs uses Node streams: keep both out of the bundle.
  serverExternalPackages: ["pdf-parse", "exceljs"],
  devIndicators: { position: "bottom-right" },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;

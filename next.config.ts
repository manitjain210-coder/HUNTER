import type { NextConfig } from "next";

// Cache Components is off: every Khana Bridge page is per-user, tenant-scoped data read at request time.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Up to 6 photos × 5 MB per upload form, plus multipart overhead. Each file is still checked individually.
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
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

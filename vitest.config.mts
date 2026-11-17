import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: "file:./test.db", UPLOAD_DIR: "./storage/test-uploads", DEMO_MODE: "false" },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});

import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.js"],
    environment: "node",
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules", "dist", ".git", "frontend"],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    pool: "forks",
    singleFork: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/scripts/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
    },
    deps: {
      external: ["better-sqlite3"],
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Coverage gate applies to the engine only; CLI wiring and the MCP
      // transport are exercised by integration tests without instrumentation.
      exclude: ["src/cli/**", "src/mcp/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/contract.ts",
        "src/report.ts",
        "src/rules/runtime.ts",
        "src/url.ts"
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90
      }
    }
  }
});

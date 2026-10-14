import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/database.rules.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});

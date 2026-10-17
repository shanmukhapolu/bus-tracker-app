import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
export default defineConfig({
  plugins: [
    {
      name: "frozen-spark-baseline",
      resolveId(id) {
        if (id === "virtual:legacy-compat") return "\0legacy-compat";
        if (id === "virtual:spark-baseline") return "\0spark-baseline";
      },
      load(id) {
        if (id !== "\0spark-baseline" && id !== "\0legacy-compat") return;
        return readFileSync(
          id === "\0legacy-compat" ? "scripts/security/driverTrackingService.compat.txt" : "scripts/spark/driverTrackingService.before.txt",
          "utf8",
        ).replace(
          /from "(\.[^"]+)"/g,
          (_, p) =>
            `from "${resolve(dirname(resolve("src/services/driverTrackingService.ts")), p).replaceAll("\\", "/")}"`,
        );
      },
      transform(code, id) {
        if (id === "\0spark-baseline" || id === "\0legacy-compat")
          return import("typescript").then((ts) => ({
            code: ts.transpileModule(code, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
              },
            }).outputText,
            map: null,
          }));
      },
    },
  ],
  test: {
    environment: "node",
    include: ["scripts/spark/*.test.ts"],
    fileParallelism: false,
    testTimeout: 240000,
    hookTimeout: 120000,
  },
});

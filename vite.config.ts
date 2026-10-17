import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { resolveFirebaseEnvironment } from "./src/config/deploymentEnvironment";
export default defineConfig(({ mode }) => {
  const deployment = resolveFirebaseEnvironment(
    { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env },
    mode,
    "public",
  );
  return {
    plugins: [
      react(),
      {
        name: "firebase-environment-manifest",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "deployment.json",
            source: JSON.stringify({
              environment: deployment.environment,
              projectId: deployment.config.projectId,
              site: deployment.hostingSite,
            }),
          });
        },
        transformIndexHtml(html: string) {
          return deployment.environment === "staging"
            ? html.replace("<title>", "<title>[STAGING] ")
            : html;
        },
      },
    ],
    build: {
      outDir: deployment.environment === "staging" ? "dist-staging" : "dist",
      rollupOptions: {
        output: { manualChunks: { maplibre: ["maplibre-gl"] } },
      },
    },
    test: {
      include: ["src/**/*.test.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "src/test/database.rules.test.ts",
        "phase2.security.test.ts",
        "scripts/spark/**",
      ],
    },
  };
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { maplibre: ["maplibre-gl"] } },
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/test/database.rules.test.ts",
    ],
  },
});

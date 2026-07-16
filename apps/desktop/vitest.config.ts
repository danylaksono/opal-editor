import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/mocks/tauri.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});

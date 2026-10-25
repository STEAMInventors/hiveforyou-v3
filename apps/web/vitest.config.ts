import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["**/modal-focus.test.ts", "happy-dom"],
      ["**/HiveProgressModal.test.tsx", "happy-dom"],
      ["**/HoneycombActivity.test.tsx", "happy-dom"],
      ["**/use-hive-study-run.test.tsx", "happy-dom"],
    ],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

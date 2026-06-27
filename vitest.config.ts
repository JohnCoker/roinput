import { defineConfig } from "vitest/config";

// Vitest reuses Vite's pipeline, so `?raw` imports and `import.meta.glob` (used by
// the test harness to auto-discover fixtures under test/data) work the same way the
// app does.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

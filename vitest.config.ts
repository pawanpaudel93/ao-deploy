import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup.ts"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: 1000000,
    hookTimeout: 1000000
  }
});

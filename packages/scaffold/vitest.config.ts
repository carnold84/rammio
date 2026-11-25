import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Builds dist/ first: projects load the package through its `main` entry,
    // exactly as `plop.load()` does for users.
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});

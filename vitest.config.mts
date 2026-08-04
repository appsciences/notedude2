import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom, not node: the paste converter parses HTML with DOMParser and the
    // sign-in-mode check reads matchMedia. Neither needs a real browser.
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    // Unit tests sit next to the module they cover. `e2e/` is Playwright's — its `test()`
    // comes from @playwright/test and throws if vitest tries to collect it.
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**", "out/**", "mcp/**"],
  },
});

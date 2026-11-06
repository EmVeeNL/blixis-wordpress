import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/playwright.json" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "off" },
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chrome-installed", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "chromium-playwright", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-playwright", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-playwright", use: { ...devices["Desktop Safari"] } },
  ],
});

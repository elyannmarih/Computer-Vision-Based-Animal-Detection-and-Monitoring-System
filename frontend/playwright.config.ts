import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", fullyParallel: true, workers: 3,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "api-contract", testMatch: "proxy.spec.ts" },
    { name: "desktop-chromium", testIgnore: "proxy.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1470, height: 950 } } },
    { name: "mobile-chromium", testIgnore: "proxy.spec.ts", use: { ...devices["Pixel 7"] } },
    { name: "desktop-webkit", testIgnore: "proxy.spec.ts", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    { command: "node tests/fixtures/backend-server.mjs", url: "http://127.0.0.1:8101/health", reuseExistingServer: false },
    { env: { API_BASE_URL: "http://127.0.0.1:8101" }, command: "npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 60000 },
  ],
});

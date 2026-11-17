import { defineConfig, devices } from "@playwright/test";

if (process.env.DETECTRA_SYSTEM_TEST !== "1") {
  throw new Error("Run python backend/tests/run_system.py to create an isolated test database first.");
}

export default defineConfig({
  testDir: "./tests/system",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  outputDir: "test-results/system",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3101",
    env: { API_BASE_URL: "http://127.0.0.1:8102" },
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 60000,
  },
});

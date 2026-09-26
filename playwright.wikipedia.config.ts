import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "wikipedia.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_ENABLED: "false",
      DB_MODE: "local",
      APP_URL: "http://127.0.0.1:3101",
      DEV_SEED: "true",
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: `./data/wiki-e2e-${Date.now()}.db`,
      APP_MODE: "mock",
      WIKIPEDIA_MODE: "live",
    },
  },
});

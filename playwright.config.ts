import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "app.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_ENABLED: "false",
      DB_MODE: "local",
      APP_URL: "http://127.0.0.1:3100",
      DEV_SEED: "true",
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: `./data/e2e-${Date.now()}.db`,
      APP_MODE: "mock",
      TUTOR_MODE: "mock",
      WIKIPEDIA_MODE: "mock",
    },
  },
});

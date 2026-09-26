import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["learning.spec.ts", "companion.spec.ts"],
  grepInvert: /LIVE/,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3103",
    channel: "chrome",
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3103",
    url: "http://127.0.0.1:3103",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_ENABLED: "false",
      DB_MODE: "local",
      APP_URL: "http://127.0.0.1:3103",
      DEV_SEED: "true",
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: `./data/learning-e2e-${Date.now()}.db`,
      APP_MODE: "mock",
      WIKIPEDIA_MODE: "mock",
      TUTOR_MODE: "companion",
      OPENAI_API_KEY: "",
    },
  },
});

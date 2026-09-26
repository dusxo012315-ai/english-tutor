import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "companion.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3102",
    channel: "chrome",
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3102",
    url: "http://127.0.0.1:3102",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_ENABLED: "false",
      DB_MODE: "local",
      APP_URL: "http://127.0.0.1:3102",
      DEV_SEED: "true",
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: `./data/companion-e2e-${Date.now()}.db`,
      WIKIPEDIA_MODE: "live",
      TUTOR_MODE: "companion",
      OPENAI_API_KEY: "",
    },
  },
});

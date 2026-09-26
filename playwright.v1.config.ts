import { defineConfig } from "@playwright/test";
const testPath = `./data/v1-e2e-${Date.now()}.db`;
const libsql = process.env.TEST_DB_MODE === "libsql";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "anki.spec.ts",
    "learning.spec.ts",
    "companion.spec.ts",
    "review.spec.ts",
    "stabilization.spec.ts",
  ],
  grepInvert: /LIVE/,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3106",
    channel: "chrome",
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/prepare-e2e.ts && npm run dev -- --port 3106",
    url: "http://127.0.0.1:3106",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_ENABLED: "false",
      DB_MODE: libsql ? "libsql" : "local",
      DATABASE_PURPOSE: "test",
      TURSO_DATABASE_URL: `file:${testPath}`,
      APP_URL: "http://127.0.0.1:3106",
      DATABASE_PATH: testPath,
      DEV_SEED: "true",
      NEXT_BUILD_SCOPE: "e2e",
      APP_MODE: "mock",
      WIKIPEDIA_MODE: "mock",
      TUTOR_MODE: "companion",
      OPENAI_API_KEY: "",
    },
  },
});

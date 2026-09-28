import { defineConfig } from "@playwright/test";
import { scryptSync } from "node:crypto";
const path = `./data/plan-e2e-${Date.now()}.db`;
const salt = "0123456789abcdef0123456789abcdef";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "study-plan.spec.ts",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3112",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/prepare-e2e.ts && npm run dev -- --port 3112",
    url: "http://127.0.0.1:3112/login",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: path,
      DATABASE_PURPOSE: "test",
      DB_MODE: process.env.TEST_DB_MODE === "libsql" ? "libsql" : "local",
      TURSO_DATABASE_URL: `file:${path}`,
      AUTH_ENABLED: "true",
      APP_URL: "http://127.0.0.1:3112",
      APP_PASSWORD_HASH: `${salt}:${scryptSync("test password 123456", salt, 64).toString("hex")}`,
      AUTH_SECRET: "test-only-signing-secret-not-a-production-secret",
      DEV_SEED: "false",
      WIKIPEDIA_MODE: "mock",
      TUTOR_MODE: "companion",
      PLAN_E2E_FIXTURE: "true",
    },
  },
});

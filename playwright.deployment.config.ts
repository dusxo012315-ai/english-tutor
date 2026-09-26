import { defineConfig } from "@playwright/test";
import { scryptSync } from "node:crypto";
const salt = "0123456789abcdef0123456789abcdef";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["deployment.spec.ts", "session-deletion.spec.ts"],
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:3108",
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3108",
    url: "http://127.0.0.1:3108/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_BUILD_SCOPE: "e2e",
      DATABASE_PATH: `./data/deployment-e2e-${Date.now()}.db`,
      DB_MODE: "local",
      AUTH_ENABLED: "true",
      APP_URL: "http://127.0.0.1:3108",
      APP_PASSWORD_HASH: `${salt}:${scryptSync("test password 123456", salt, 64).toString("hex")}`,
      AUTH_SECRET: "test-only-signing-secret-not-a-production-secret",
      DEV_SEED: "true",
      WIKIPEDIA_MODE: "mock",
      TUTOR_MODE: "companion",
      OPENAI_API_KEY: "",
    },
  },
});

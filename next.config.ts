import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
const config = (phase: string): NextConfig => ({
  distDir:
    process.env.NEXT_BUILD_SCOPE === "e2e"
      ? ".next-e2e"
      : phase === PHASE_DEVELOPMENT_SERVER
        ? ".next-local"
        : ".next",
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./artifacts/**/*",
      "./.env*",
      "./test-results/**/*",
      "./.git/**/*",
    ],
  },
  devIndicators: false,
});
export default config;

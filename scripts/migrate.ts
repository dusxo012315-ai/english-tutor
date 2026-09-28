import { loadEnvConfig } from "@next/env";
import { connectDatabase } from "../src/data/connection";
import { environment } from "../src/server/environment";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes("--test"))
    throw new Error(
      "Use --test. Production migrations are not enabled in this preparation phase.",
    );
  const c = environment();
  const remote =
    c.mode === "libsql" && !process.env.TURSO_DATABASE_URL?.startsWith("file:");
  if (remote && !process.argv.includes("--approved-test-cloud"))
    throw new Error("Separate TEST cloud migration approval required");
  const connection = connectDatabase({
    mode: c.mode,
    path: c.path,
    url: process.env.TURSO_DATABASE_URL,
    token: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    await connection.migrate();
  } finally {
    connection.close();
  }
  console.log(
    "TEST schema migration complete. No seed, backfill or user data import performed.",
  );
}
main().catch(() => {
  console.error(
    "Test database setup failed. Check configuration; original database access is prohibited.",
  );
  process.exitCode = 1;
});

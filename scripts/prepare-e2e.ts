import { SqliteRepository } from "../src/data/repository";
async function main() {
  if (
    process.env.DATABASE_PURPOSE !== "test" ||
    !process.env.DATABASE_PATH?.includes("e2e")
  )
    throw new Error("Isolated E2E database required");
  const mode = process.env.DB_MODE === "libsql" ? "libsql" : "local";
  const r = new SqliteRepository(
    process.env.DATABASE_PATH,
    undefined,
    true,
    {
      mode,
      path: process.env.DATABASE_PATH,
      url: process.env.TURSO_DATABASE_URL,
    },
    true,
  );
  await r.ready;
  await r.close();
}
main().catch(() => {
  console.error("Could not prepare isolated E2E database");
  process.exitCode = 1;
});

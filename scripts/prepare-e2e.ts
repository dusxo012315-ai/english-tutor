import { SqliteRepository } from "../src/data/repository";
import { planArticle } from "../tests/fixtures/plan-article";
async function main() {
  if (
    process.env.DATABASE_PURPOSE !== "test" ||
    !process.env.DATABASE_PATH?.includes("e2e")
  )
    throw new Error("Isolated E2E database required");
  const mode = process.env.DB_MODE === "libsql" ? "libsql" : "local";
  if (mode === "libsql" && !process.env.TURSO_DATABASE_URL?.startsWith("file:"))
    throw new Error("E2E setup only supports isolated file databases");
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
  if (process.env.PLAN_E2E_FIXTURE === "true") await r.saveArticle(planArticle);
  await r.close();
}
main().catch(() => {
  console.error("Could not prepare isolated E2E database");
  process.exitCode = 1;
});

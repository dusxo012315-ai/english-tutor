import { loadEnvConfig } from "@next/env";
import { SqliteRepository } from "../src/data/repository";
import { environment } from "../src/server/environment";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes("--test"))
    throw new Error(
      "Use --test. Production migrations are not enabled in this preparation phase.",
    );
  const c = environment();
  const repo = new SqliteRepository(
    c.path,
    undefined,
    false,
    {
      mode: c.mode,
      path: c.path,
      url: process.env.TURSO_DATABASE_URL,
      token: process.env.TURSO_AUTH_TOKEN,
    },
    true,
  );
  await repo.ready;
  await repo.close();
  console.log(
    "TEST database schema initialized. No original user data imported.",
  );
}
main().catch(() => {
  console.error(
    "Test database setup failed. Check configuration; original database access is prohibited.",
  );
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { connectDatabase } from "../src/data/connection";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Connection = ReturnType<typeof connectDatabase>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
function requireCheck(ok: boolean, code: string): asserts ok {
  if (!ok) throw new Error(code);
}

// No dotenv/Vercel access. Credentials are supplied only by the operator's process.
export function validateTarget(env: Record<string, string | undefined>) {
  requireCheck(env.DATABASE_PURPOSE === "test" && env.DB_MODE === "libsql", "TARGET_PURPOSE");
  requireCheck(env.VERCEL_ENV !== "production", "TARGET_PRODUCTION");
  const url = new URL(env.TURSO_DATABASE_URL || "");
  const expected = env.STUDY_PLAN_EXPECTED_TEST_HOST || "";
  requireCheck(url.protocol === "libsql:" && url.hostname.endsWith(".turso.io"), "TARGET_HOST");
  requireCheck(url.hostname === expected && /(^|[-.])test([-.]|$)/i.test(expected) && !/prod/i.test(expected), "TARGET_CONFIRMATION");
  requireCheck(!url.username && !url.password && !url.search && !url.hash && (!url.pathname || url.pathname === "/"), "TARGET_URL");
  requireCheck(!!env.TURSO_AUTH_TOKEN?.trim() && !/^\[(SENSITIVE|REDACTED)\]$/i.test(env.TURSO_AUTH_TOKEN.trim()), "TARGET_CREDENTIAL");
  return { mode: "libsql" as const, url: env.TURSO_DATABASE_URL!, token: env.TURSO_AUTH_TOKEN! };
}

async function schema(c: Connection) {
  const rows = await c.query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY type,name");
  return rows.map(row => row.map(v => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v));
}
async function healthy(c: Connection) {
  requireCheck((await c.query("PRAGMA foreign_key_check")).length === 0, "FOREIGN_KEYS");
  requireCheck(JSON.stringify(await c.query("PRAGMA integrity_check")) === '[["ok"]]', "INTEGRITY");
}
async function contents(c: Connection, tables: string[]) {
  return Promise.all(tables.map(async name => {
    const rows = await c.query(`SELECT * FROM ${quote(name)}`);
    const sorted = rows.map(r => JSON.stringify(r)).sort();
    return { name, count: rows.length, hash: digest(sorted) };
  }));
}

// Callers own connection lifecycle. This does not initialize/seed any repository.
export async function applyStudyPlan(c: Connection, backupDirectory?: string) {
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
  requireCheck(migrations.length === 5, "MIGRATION_FILES");
  const migration = migrations[4];
  requireCheck(migration.hash === "fe34620e366cd7bf8ad4acfb116e6ede0eb838c6e7bb6a8710f3ff3519a3966d", "MIGRATION_CHECKSUM");
  requireCheck(migration.folderMillis === 1790505730171, "MIGRATION_VERSION");
  requireCheck(migration.sql.length === 6 && migration.sql.every(sql => /^\s*CREATE (TABLE|(?:UNIQUE )?INDEX)\s/.test(sql)), "MIGRATION_SQL");
  const expected = connectDatabase({ mode: "local", path: ":memory:" });
  try {
    for (const m of migrations.slice(0, 4)) for (const sql of m.sql) await expected.query(sql);
    const beforeSchema = await schema(expected);
    const tables = beforeSchema.filter(r => r[0] === "table").map(r => String(r[1]));
    requireCheck(tables.length === 14, "BASELINE_TABLES");
    for (const sql of migration.sql) await expected.query(sql);
    const afterSchema = await schema(expected);
    return await c.db.transaction(async () => {
      const history = await c.query("SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at");
      requireCheck(history.length === 4 || history.length === 5, "MIGRATION_HISTORY");
      requireCheck(history.every((r, i) => r[0] === migrations[i].hash && Number(r[1]) === migrations[i].folderMillis), "MIGRATION_HISTORY");
      const already = history.length === 5;
      requireCheck(digest(await schema(c)) === digest(already ? afterSchema : beforeSchema), "SCHEMA_BASELINE");
      await healthy(c);
      const baseline = await contents(c, tables);
      if (already) return { status: "ALREADY_APPLIED", tablesVerified: tables.length };
      if (backupDirectory) {
        mkdirSync(backupDirectory, { recursive: true });
        const backup = connectDatabase({mode:"local",path:join(backupDirectory,`study-plan-before-${Date.now()}.db`)});
        try {
          await backup.query("PRAGMA foreign_keys = OFF");
          const definitions = await c.query("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
          for (const [sql] of definitions) await backup.query(String(sql));
          for (const name of [...tables,"__drizzle_migrations"]) {
            for (const row of await c.query(`SELECT * FROM ${quote(name)}`)) await backup.query(`INSERT INTO ${quote(name)} VALUES (${row.map(()=>"?").join(",")})`,row);
          }
          for (const [sql] of await c.query("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")) await backup.query(String(sql));
          await backup.query("PRAGMA foreign_keys = ON");
          await healthy(backup);
          requireCheck(digest(await schema(backup)) === digest(beforeSchema), "BACKUP_SCHEMA");
          requireCheck(digest(await contents(backup,tables)) === digest(baseline), "BACKUP_DATA");
          requireCheck(digest(await backup.query("SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at")) === digest(history), "BACKUP_HISTORY");
        } finally { backup.close(); }
      }
      for (const sql of migration.sql) await c.query(sql);
      await c.query("INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)", [migration.hash, migration.folderMillis]);
      requireCheck(digest(await schema(c)) === digest(afterSchema), "SCHEMA_AFTER");
      requireCheck(digest(await contents(c, tables)) === digest(baseline), "DATA_CHANGED");
      const afterHistory = await c.query("SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at");
      requireCheck(digest(afterHistory) === digest([...history, [migration.hash, migration.folderMillis]]), "HISTORY_AFTER");
      await healthy(c);
      return { status: "APPLIED", tablesVerified: tables.length };
    });
  } finally { expected.close(); }
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { connectDatabase } from "../src/data/connection";
import { applyStudyPlan, validateTarget } from "../scripts/study-plan-operator";

test("operator rejects incorrect purpose/host/placeholder before connection", () => {
  const env = { DB_MODE: "libsql", DATABASE_PURPOSE: "test", TURSO_DATABASE_URL: "libsql://example-test.turso.io", STUDY_PLAN_EXPECTED_TEST_HOST: "example-test.turso.io", TURSO_AUTH_TOKEN: "synthetic-fixture" };
  assert.equal(validateTarget(env).mode, "libsql");
  for (const change of [{DATABASE_PURPOSE:"production"}, {DB_MODE:"local"}, {VERCEL_ENV:"production"}, {STUDY_PLAN_EXPECTED_TEST_HOST:"other-test.turso.io"}, {TURSO_AUTH_TOKEN:"[SENSITIVE]"}, {TURSO_DATABASE_URL:"libsql://production.turso.io"}]) assert.throws(() => validateTarget({...env,...change}));
});
for (const mode of ["local", "libsql"] as const) {
  test(`${mode}: operator preserves data, rolls back failure, applies once`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "operator-test-"));
    const path = join(dir,"fixture.db");
    const c = connectDatabase({mode,path,url:`file:${path.replaceAll("\\","/")}`});
    try {
      await c.query("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
      for (const m of readMigrationFiles({migrationsFolder:"drizzle"}).slice(0,4)) {
        for (const sql of m.sql) await c.query(sql);
        await c.query("INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)",[m.hash,m.folderMillis]);
      }
      await c.query("INSERT INTO snapshots VALUES (?,?)",["fixture",'{"title":"한글 & apostrophe\u0027"}']);
      const before = await c.query("SELECT * FROM snapshots");
      const query = c.query;
      c.query = async (sql, args) => {
        if (sql.startsWith("INSERT INTO __drizzle_migrations")) throw Error("injected");
        return query(sql,args);
      };
      await assert.rejects(applyStudyPlan(c));
      c.query = query;
      assert.equal((await c.query("SELECT name FROM sqlite_master WHERE name='study_plans'")).length,0);
      assert.equal((await c.query("SELECT * FROM __drizzle_migrations")).length,4);
      assert.deepEqual(await c.query("SELECT * FROM snapshots"),before);
      assert.equal((await applyStudyPlan(c,join(dir,"backup"))).status,"APPLIED");
      assert.equal((await applyStudyPlan(c)).status,"ALREADY_APPLIED");
      assert.deepEqual(await c.query("SELECT * FROM snapshots"),before);
      await c.query("UPDATE __drizzle_migrations SET hash='invalid' WHERE created_at=(SELECT MIN(created_at) FROM __drizzle_migrations)");
      await assert.rejects(applyStudyPlan(c),/MIGRATION_HISTORY/);
    } finally { c.close(); await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
  });
}

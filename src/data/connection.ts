import Database from "better-sqlite3";
import {
  createClient,
  type Client,
  type InArgs,
  type Transaction,
} from "@libsql/client";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { AsyncLocalStorage } from "node:async_hooks";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export type AsyncDatabase = Omit<SqliteRemoteDatabase, "transaction"> & {
  transaction<T>(fn: (tx: AsyncDatabase) => Promise<T>): Promise<T>;
};
export type ConnectionOptions = {
  mode: "local" | "libsql";
  path?: string;
  url?: string;
  token?: string;
};
export function connectDatabase(options: ConnectionOptions) {
  if (options.url?.startsWith("file:")) {
    const file = options.url.startsWith("file://")
      ? fileURLToPath(options.url)
      : decodeURIComponent(options.url.slice(5));
    if (
      resolve(/* turbopackIgnore: true */ file).toLowerCase() ===
      resolve(
        /* turbopackIgnore: true */ "./data/reading-room-demo.db",
      ).toLowerCase()
    )
      throw new Error("Original database is protected");
  }
  let local: Database.Database | undefined;
  let remote: Client | undefined;
  if (options.mode === "local") {
    const path = options.path || "./data/deployment-local.db";
    if (
      resolve(/* turbopackIgnore: true */ path).toLowerCase() ===
      resolve(
        /* turbopackIgnore: true */ "./data/reading-room-demo.db",
      ).toLowerCase()
    )
      throw new Error(
        "Protected original database. Use a separate development database.",
      );
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), {
        recursive: true,
      });
    local = new Database(path);
    local.pragma("journal_mode = WAL");
    local.pragma("foreign_keys = ON");
    local.pragma("busy_timeout = 5000");
  } else remote = createClient({ url: options.url!, authToken: options.token });
  const scope = new AsyncLocalStorage<{
    remote?: Transaction;
    failed?: boolean;
  }>();
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p;
  }
  async function raw(
    sql: string,
    params: unknown[] = [],
  ): Promise<unknown[][]> {
    if (local) {
      const q = local.prepare(sql);
      if (q.reader) return q.raw().all(...params) as unknown[][];
      q.run(...params);
      return [];
    }
    const result = await (scope.getStore()?.remote || remote!).execute({
      sql,
      args: params as InArgs,
    });
    return result.rows.map((r) => Array.from(r));
  }
  async function query(sql: string, params: unknown[] = []) {
    return scope.getStore()
      ? raw(sql, params)
      : exclusive(() => raw(sql, params));
  }
  const db = drizzle(async (sql, params, method) => {
    const rows = await query(sql, params);
    return { rows: (method === "get" ? rows[0] : rows) as unknown[] };
  }) as unknown as AsyncDatabase;
  db.transaction = async (fn) => {
    if (scope.getStore()) {
      try {
        return await fn(db);
      } catch (e) {
        scope.getStore()!.failed = true;
        throw e;
      }
    } // nested failures make the outer unit rollback-only
    return exclusive(async () => {
      let tx: Transaction | undefined;
      if (local) local.exec("BEGIN IMMEDIATE");
      else tx = await remote!.transaction("write");
      try {
        const context = { remote: tx, failed: false };
        const value = await scope.run(context, () => fn(db));
        if (context.failed)
          throw new Error("Transaction was marked rollback-only");
        if (local) local.exec("COMMIT");
        else await tx!.commit();
        return value;
      } catch (e) {
        if (local) local.exec("ROLLBACK");
        else await tx!.rollback();
        throw e;
      } finally {
        tx?.close();
      }
    });
  };
  async function migrate() {
    await db.transaction(async () => {
      await raw(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
      );
      const applied = await raw(
        "SELECT hash, created_at FROM __drizzle_migrations",
      );
      for (const m of readMigrationFiles({
        migrationsFolder: resolve("drizzle"),
      })) {
        const old = applied.find((r) => Number(r[1]) === m.folderMillis);
        if (old) {
          if (old[0] !== m.hash) throw new Error("Migration checksum mismatch");
          continue;
        }
        for (const statement of m.sql)
          if (statement.trim()) await raw(statement);
        await raw(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?,?)",
          [m.hash, m.folderMillis],
        );
      }
    });
  }
  return {
    db,
    migrate,
    query,
    close: () => {
      local?.close();
      remote?.close();
    },
  };
}

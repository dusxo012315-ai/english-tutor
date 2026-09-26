import { resolve } from "node:path";
export function environment() {
  const mode = process.env.DB_MODE || "local";
  if (!["local", "libsql"].includes(mode)) throw new Error("Invalid DB_MODE");
  const production =
    process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  if (process.env.VERCEL && mode !== "libsql")
    throw new Error("Vercel requires remote database mode");
  const auth = process.env.AUTH_ENABLED !== "false";
  if (production && !auth) throw new Error("Authentication required");
  const appUrl = process.env.APP_URL || "http://127.0.0.1:3000";
  const url = new URL(appUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (production && url.protocol !== "https:")
  )
    throw new Error("Invalid APP_URL");
  if (
    auth &&
    (!/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(
      process.env.APP_PASSWORD_HASH || "",
    ) ||
      (process.env.AUTH_SECRET || "").length < 32)
  )
    throw new Error("Authentication not configured");
  if (mode === "libsql") {
    const remote = new URL(process.env.TURSO_DATABASE_URL || "");
    if (
      !["libsql:", "https:", ...(!production ? ["file:"] : [])].includes(
        remote.protocol,
      )
    )
      throw new Error("Invalid database URL");
    if (remote.protocol !== "file:" && !process.env.TURSO_AUTH_TOKEN)
      throw new Error("Database credential missing");
    if (process.env.DATABASE_PURPOSE !== "test")
      throw new Error(
        "This preparation release only supports TEST cloud databases",
      );
  }
  const path = process.env.DATABASE_PATH || "./data/deployment-local.db";
  if (
    mode === "local" &&
    resolve(/* turbopackIgnore: true */ path).toLowerCase() ===
      resolve(
        /* turbopackIgnore: true */ "./data/reading-room-demo.db",
      ).toLowerCase()
  )
    throw new Error("Original database is protected");
  return {
    mode: mode as "local" | "libsql",
    path,
    appUrl: url.origin,
    auth,
    production,
  };
}

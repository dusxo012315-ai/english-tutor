import "server-only";
import { SqliteRepository } from "@/data/repository";
import { environment } from "./environment";
const globalStore = globalThis as unknown as {
  readingRepository?: SqliteRepository;
};
export function repository() {
  const c = environment();
  return (globalStore.readingRepository ??= new SqliteRepository(
    c.path,
    undefined,
    process.env.DEV_SEED === "true",
    {
      mode: c.mode,
      path: c.path,
      url: process.env.TURSO_DATABASE_URL,
      token: process.env.TURSO_AUTH_TOKEN,
    },
    c.mode === "local" && !c.production,
  ));
}

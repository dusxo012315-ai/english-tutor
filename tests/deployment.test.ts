import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRepository } from "../src/data/repository";
import { connectDatabase } from "../src/data/connection";
import { stateRevision } from "../src/server/revision";
import { environment } from "../src/server/environment";
import {
  hashPassword,
  checkPassword,
  signSession,
  validSession,
  cookieOptions,
  TTL,
} from "../src/server/auth";
import { emptyCandidateFields } from "../src/domain/anki";
for (const mode of ["local", "libsql"] as const)
  test(`${mode}: schema, round persistence, rollback, concurrent writes, Anki export, restart`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "reading-deploy-")),
      path = join(dir, "test.db");
    const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
    let r = new SqliteRepository(path, undefined, false, options);
    try {
      await r.ready;
      const verification = connectDatabase(options);
      try {
        assert.equal(
          (await verification.query("PRAGMA foreign_keys"))[0][0],
          1,
        );
        await assert.rejects(
          verification.query(
            "INSERT INTO learning_items (id, session_id, payload) VALUES (?, ?, ?)",
            ["orphan", "missing", "{}"],
          ),
        );
      } finally {
        verification.close();
      }
      await assert.rejects(
        r.atomic(async () => {
          try {
            await r.atomic(async () => {
              await r.execute({ type: "start", articleId: "bird" });
              throw new Error("nested");
            });
          } catch {
            /* outer must not commit even if a nested failure was caught */
          }
        }),
        /rollback-only/,
      );
      const initial = await r.getState();
      assert.equal(initial.learningSessions.length, 0);
      await assert.rejects(
        r.atomic(async () => {
          await r.execute({
            type: "startListening",
            sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
            userProvidedTitle: "rolled back",
            level: "1",
          });
          throw Error("rollback");
        }),
        /rollback/,
      );
      assert.equal(stateRevision(await r.getState()), stateRevision(initial));
      const results = await Promise.all(
        [1, 2].map((i) =>
          r.atomic(() =>
            r.execute({
              type: "startListening",
              sourceUrl:
                "https://breakingnewsenglish.com/2609/260924-test.html",
              userProvidedTitle: `Test ${i}`,
              level: "1",
            }),
          ),
        ),
      );
      assert.equal((await r.getState()).learningSessions.length, 2);
      const id = results[0].id!;
      await r.execute({
        type: "saveRound1",
        sessionId: id,
        data: {
          comprehension: 45,
          keywords: "news",
          summary: "My own summary",
          difficulty: "moderate",
        },
      });
      const created = await r.execute({
        type: "createCandidate",
        requestId: crypto.randomUUID(),
        sessionId: id,
        fields: {
          ...emptyCandidateFields(),
          expression: "be able to",
          meaning: "할 수 있다",
        },
        allowDuplicate: true,
      });
      const c = created.state.ankiCandidates.find((c) => c.id === created.id)!;
      const ready = await r.execute({
        type: "updateCandidate",
        candidateId: c.id,
        expectedVersion: c.version,
        fields: {
          ...emptyCandidateFields(),
          expression: c.expression,
          meaning: c.meaning,
        },
        status: "READY",
        allowDuplicate: true,
      });
      const card = ready.state.ankiCandidates.find((c) => c.id === created.id)!;
      const out = await r.execute({
        type: "exportCandidates",
        requestId: crypto.randomUUID(),
        candidates: [{ id: card.id, version: card.version }],
        allowReexport: false,
      });
      assert.match(out.tsv!, /할 수 있다/);
      assert.equal(
        out.state.ankiCandidates.find((c) => c.id === card.id)?.status,
        "EXPORTED",
      );
      const before = stateRevision(await r.getState());
      await r.close();
      r = new SqliteRepository(path, undefined, false, options);
      assert.equal(stateRevision(await r.getState()), before);
    } finally {
      await r.close();
      try {
        rmSync(dir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        /* Windows libSQL may retain a native handle until process exit; test-only temp directory remains. */
      }
    }
  });
test("single-password signature, expiry, tampering, cookie flags and fail-closed environment", () => {
  const saved = { ...process.env };
  try {
    process.env.DB_MODE = "local";
    process.env.DATABASE_PATH = "./data/auth-test.db";
    process.env.APP_URL = "https://example.vercel.app";
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_SECRET = "test-only-secret-".repeat(4);
    process.env.APP_PASSWORD_HASH = hashPassword("test password 123456");
    assert.equal(checkPassword("wrong"), false);
    assert.equal(checkPassword("test password 123456"), true);
    const token = signSession();
    assert.ok(validSession(token));
    assert.ok(!validSession(token + "x"));
    assert.ok(!validSession(token, Date.now() + (TTL + 1) * 1000));
    assert.deepEqual(cookieOptions(), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: TTL,
    });
    process.env.AUTH_SECRET = "short";
    assert.ok(!validSession(token));
    assert.throws(environment);
    process.env.AUTH_ENABLED = "false";
    process.env.VERCEL = "1";
    assert.throws(environment);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("HTTPS login response sets Secure signed cookie; logout expires it; throttling and CSRF reject", async () => {
  const saved = { ...process.env };
  try {
    process.env.DB_MODE = "local";
    process.env.DATABASE_PATH = "./data/auth-test.db";
    process.env.APP_URL = "https://example.vercel.app";
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_SECRET = "test-only-secret-".repeat(4);
    process.env.APP_PASSWORD_HASH = hashPassword("test password 123456");
    Object.assign(process.env, { NODE_ENV: "production" });
    const login = await import("../src/app/api/auth/login/route");
    const logout = await import("../src/app/api/auth/logout/route");
    const request = (password: string, origin = "https://example.vercel.app") =>
      new Request("https://example.vercel.app/api/auth/login", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
    assert.equal(
      (
        await login.POST(
          request("test password 123456", "https://evil.example"),
        )
      ).status,
      403,
    );
    const response = await login.POST(request("test password 123456"));
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    const out = await logout.POST(
      new Request("https://example.vercel.app/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://example.vercel.app",
          cookie: cookie.split(";")[0],
        },
      }),
    );
    assert.equal(out.status, 200);
    assert.match(out.headers.get("set-cookie")!, /Max-Age=0/i);
    for (let i = 0; i < 10; i++)
      assert.equal((await login.POST(request("wrong"))).status, 401);
    assert.equal((await login.POST(request("wrong"))).status, 429);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

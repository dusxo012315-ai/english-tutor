import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { SqliteRepository } from "../src/data/repository";
import { connectDatabase } from "../src/data/connection";
import {
  planItemStatus,
  nextPlanItem,
  canPrintArticle,
} from "../src/domain/study-plan";
import { actionSchema } from "../src/domain/schemas";
import { stateRevision } from "../src/server/revision";
import { emptyCandidateFields } from "../src/domain/anki";
import { planArticle } from "./fixtures/plan-article";

test("Plan validation and Wikipedia-only print eligibility", () => {
  assert.equal(
    actionSchema.safeParse({
      type: "createPlan",
      requestId: "x",
      name: "  ",
      planType: "READING",
    }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({
      type: "createPlan",
      requestId: "x",
      name: "test",
      planType: "MIXED",
    }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({
      type: "movePlanItem",
      itemId: "",
      direction: "up",
    }).success,
    false,
  );
  assert.equal(canPrintArticle(planArticle), true);
  assert.equal(canPrintArticle({ ...planArticle, provider: "mock" }), false);
  assert.equal(
    canPrintArticle({ ...planArticle, attribution: undefined }),
    false,
  );
});
for (const mode of ["local", "libsql"] as const) {
  test(`${mode}: plan CRUD, duplicate content, ordering, start/resume, complete, detach, preservation, restart`, async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "study-plan-")),
      "isolated.db",
    );
    const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
    let r = new SqliteRepository(path, undefined, false, options);
    try {
      await r.ready;
      await r.saveArticle(planArticle);
      const before = stateRevision(await r.getState());
      for (const [id, type] of [
        ["rp", "READING"],
        ["lp", "LISTENING"],
      ] as const)
        await r.execute({
          type: "createPlan",
          requestId: id,
          name: id,
          planType: type,
        });
      assert.notEqual(stateRevision(await r.getState()), before);
      await r.execute({
        type: "createPlan",
        requestId: "rp",
        name: "rp",
        planType: "READING",
      });
      assert.equal((await r.getState()).studyPlans.length, 2);
      await r.execute({
        type: "renamePlan",
        planId: "rp",
        name: "Reading this week",
      });
      for (const requestId of ["r1", "r2", "r3"])
        await r.execute({
          type: "addReadingPlanItem",
          requestId,
          planId: "rp",
          articleId: planArticle.id,
        });
      await r.execute({
        type: "addReadingPlanItem",
        requestId: "r1",
        planId: "rp",
        articleId: planArticle.id,
      });
      assert.equal((await r.getState()).studyPlanItems.length, 3);
      await r.execute({
        type: "createPlan",
        requestId: "shared-plan",
        name: "Shared catalog",
        planType: "READING",
      });
      await r.execute({
        type: "addReadingPlanItem",
        requestId: "shared-item",
        planId: "shared-plan",
        articleId: planArticle.id,
      });
      await r.execute({ type: "deletePlan", planId: "shared-plan" });
      assert.ok(
        (await r.getState()).articles.find((a) => a.id === planArticle.id),
      );
      await r.execute({ type: "movePlanItem", itemId: "r2", direction: "up" });
      let state = await r.getState();
      assert.equal(
        nextPlanItem("rp", state.studyPlanItems, state.learningSessions)?.id,
        "r2",
      );
      await r.execute({
        type: "movePlanItem",
        itemId: "r2",
        direction: "down",
      });
      await r.execute({ type: "deletePlanItem", itemId: "r3" });
      assert.ok(
        (await r.getState()).articles.find((a) => a.id === planArticle.id),
      );
      const concurrent = await Promise.all([
        r.execute({ type: "startPlanItem", itemId: "r1" }),
        r.execute({ type: "startPlanItem", itemId: "r1" }),
      ]);
      const sessionId = concurrent[0].id!;
      assert.equal(sessionId, concurrent[1].id);
      state = await r.getState();
      assert.equal(state.learningSessions.length, 1);
      assert.equal(
        planItemStatus(
          state.studyPlanItems.find((i) => i.id === "r1")!,
          state.learningSessions,
        ),
        "IN_PROGRESS",
      );
      await r.execute({ type: "finish", sessionId });
      state = await r.getState();
      assert.equal(
        planItemStatus(
          state.studyPlanItems.find((i) => i.id === "r1")!,
          state.learningSessions,
        ),
        "COMPLETED",
      );
      assert.equal(
        (await r.execute({ type: "startPlanItem", itemId: "r1" })).id,
        sessionId,
      );
      assert.equal(
        nextPlanItem("rp", state.studyPlanItems, state.learningSessions)?.id,
        "r2",
      );
      await r.execute({
        type: "deleteLearningSession",
        sessionId,
        sessionType: "READING",
      });
      state = await r.getState();
      assert.equal(
        state.studyPlanItems.find((i) => i.id === "r1")?.sessionId,
        null,
      );
      assert.equal(
        planItemStatus(
          state.studyPlanItems.find((i) => i.id === "r1")!,
          state.learningSessions,
        ),
        "PLANNED",
      );
      const secondSession = (
        await r.execute({ type: "startPlanItem", itemId: "r1" })
      ).id!;
      assert.notEqual(secondSession, sessionId);
      await r.execute({
        type: "createCandidate",
        requestId: crypto.randomUUID(),
        sessionId: secondSession,
        fields: { ...emptyCandidateFields(), expression: "mountains" },
        allowDuplicate: true,
      });
      await r.execute({
        type: "recordReview",
        requestId: crypto.randomUUID(),
        sourceReference: `session:${secondSession}`,
        action: "REVIEWED",
        dismissal: null,
        userUnderstandingAfter: 4,
        note: "keep",
        candidateId: null,
      });
      const beforeDelete = await r.getState();
      await r.execute({ type: "deletePlan", planId: "rp" });
      state = await r.getState();
      assert.deepEqual(state.learningSessions, beforeDelete.learningSessions);
      assert.deepEqual(state.ankiCandidates, beforeDelete.ankiCandidates);
      assert.deepEqual(state.reviewEvents, beforeDelete.reviewEvents);
      assert.deepEqual(state.articles, beforeDelete.articles);
      await r.execute({
        type: "addListeningPlanItem",
        requestId: "l1",
        planId: "lp",
        title: "My listening",
        sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
        level: "2",
      });
      const ls = (await r.execute({ type: "startPlanItem", itemId: "l1" })).id!;
      await r.execute({
        type: "addListeningPlanItem",
        requestId: "l2",
        planId: "lp",
        title: "My listening",
        sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
        level: "2",
      });
      await r.execute({ type: "deletePlanItem", itemId: "l2" });
      assert.equal((await r.getState()).studyPlanItems[0].sessionId, ls);
      assert.equal(
        (await r.execute({ type: "startPlanItem", itemId: "l1" })).id,
        ls,
      );
      await r.execute({
        type: "saveRound1",
        sessionId: ls,
        data: {
          comprehension: 25,
          summary: "My summary",
          keywords: "news",
          difficulty: "hard",
        },
      });
      await r.execute({
        type: "saveRound2",
        sessionId: ls,
        data: { difficultyReasons: ["speed"], reason: "Fast" },
      });
      await r.execute({
        type: "saveRound3",
        sessionId: ls,
        data: { comprehension: 65, newlyHeard: "more", stillDifficult: "some" },
      });
      await r.execute({
        type: "saveRecall",
        sessionId: ls,
        data: {
          comprehension: 80,
          summary: "My final summary.",
          needReview: false,
        },
      });
      state = await r.getState();
      assert.equal(
        planItemStatus(state.studyPlanItems[0], state.learningSessions),
        "COMPLETED",
      );
      await r.close();
      r = new SqliteRepository(path, undefined, false, options);
      assert.deepEqual(
        (await r.getState()).studyPlanItems,
        state.studyPlanItems,
      );
      await r.execute({
        type: "deleteLearningSession",
        sessionId: ls,
        sessionType: "LISTENING",
      });
      assert.equal((await r.getState()).studyPlanItems[0].sessionId, null);
      const verify = connectDatabase(options);
      try {
        assert.deepEqual(await verify.query("PRAGMA foreign_key_check"), []);
      } finally {
        verify.close();
      }
    } finally {
      await r.close();
    }
  });

  test(`${mode}: invalid references, wrong type, rollback of session creation and History detachment`, async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "study-plan-fail-")),
      "isolated.db",
    );
    const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
    const r = new SqliteRepository(path, undefined, false, options);
    await r.ready;
    const verify = connectDatabase(options);
    try {
      await r.execute({
        type: "createPlan",
        requestId: "p",
        name: "P",
        planType: "LISTENING",
      });
      const base = stateRevision(await r.getState());
      await assert.rejects(
        r.execute({
          type: "addReadingPlanItem",
          requestId: "bad",
          planId: "p",
          articleId: "bird",
        }),
      );
      await assert.rejects(
        r.execute({ type: "startPlanItem", itemId: "missing" }),
      );
      await assert.rejects(
        r.execute({ type: "deletePlan", planId: "missing" }),
      );
      await assert.rejects(
        r.execute({
          type: "addListeningPlanItem",
          requestId: "bad",
          planId: "p",
          title: "Bad",
          level: "1",
          sourceUrl: "https://breakingnewsenglish.com/audio.mp3",
        }),
      );
      assert.equal(stateRevision(await r.getState()), base);
      await r.execute({
        type: "addListeningPlanItem",
        requestId: "i",
        planId: "p",
        title: "Test",
        level: "1",
        sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
      });
      await verify.query(
        "CREATE TRIGGER fail_link BEFORE UPDATE OF session_id ON study_plan_items BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      );
      const before = await r.getState();
      await assert.rejects(r.execute({ type: "startPlanItem", itemId: "i" }));
      assert.deepEqual(await r.getState(), before);
      await verify.query("DROP TRIGGER fail_link");
      const sessionId = (
        await r.execute({ type: "startPlanItem", itemId: "i" })
      ).id!;
      const linked = await r.getState();
      await verify.query(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON learning_sessions BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      );
      await assert.rejects(
        r.execute({
          type: "deleteLearningSession",
          sessionId,
          sessionType: "LISTENING",
        }),
      );
      assert.deepEqual(await r.getState(), linked);
      await verify.query("DROP TRIGGER fail_delete");
      await verify.query(
        "CREATE TRIGGER fail_plan BEFORE DELETE ON study_plans BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      );
      await assert.rejects(r.execute({ type: "deletePlan", planId: "p" }));
      assert.deepEqual(await r.getState(), linked);
      assert.deepEqual(await verify.query("PRAGMA foreign_key_check"), []);
    } finally {
      verify.close();
      await r.close();
    }
  });

  test(`${mode}: migration-only upgrade preserves every old table and is atomic and repeatable`, async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "study-plan-migrate-")),
      "isolated.db",
    );
    const c = connectDatabase({
      mode,
      path,
      url: `file:${path.replaceAll("\\", "/")}`,
    });
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    try {
      await c.db.transaction(async () => {
        await c.query(
          'CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)',
        );
        for (const m of migrations.slice(0, -1)) {
          for (const sql of m.sql) await c.query(sql);
          await c.query(
            'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
            [m.hash, m.folderMillis],
          );
        }
      });
      // Populate an old-version graph without initializing the newer repository.
      await c.query("INSERT INTO snapshots VALUES (?, ?)", [
        "old-article",
        JSON.stringify({ id: "old-article", title: "보존 ' &" }),
      ]);
      await c.query("INSERT INTO sessions VALUES (?, ?, ?)", [
        "old",
        "old-article",
        '{"id":"old"}',
      ]);
      await c.query("INSERT INTO learning_sessions VALUES (?, ?, ?)", [
        "old",
        "READING",
        '{"id":"old"}',
      ]);
      await c.query("INSERT INTO learning_items VALUES (?, ?, ?)", [
        "old-item",
        "old",
        '{"id":"old-item"}',
      ]);
      await c.query("INSERT INTO cards VALUES (?, ?, ?)", [
        "old-card",
        "old-item",
        '{"id":"old-card"}',
      ]);
      await c.query("INSERT INTO companion_interactions VALUES (?, ?, ?)", [
        "old-interaction",
        "old",
        '{"text":"keep"}',
      ]);
      await c.query("INSERT INTO learned_expressions VALUES (?, ?, ?)", [
        "old-expression",
        "old",
        '{"text":"keep"}',
      ]);
      await c.query("INSERT INTO anki_candidates VALUES (?, ?, ?)", [
        "old-candidate",
        "old",
        '{"text":"keep"}',
      ]);
      await c.query("INSERT INTO learning_sessions VALUES (?, ?, ?)", [
        "old-listening",
        "LISTENING",
        '{"id":"old-listening"}',
      ]);
      await c.query("INSERT INTO listening_details VALUES (?, ?)", [
        "old-listening",
        '{"summary":"나의 요약"}',
      ]);
      await c.query("INSERT INTO review_events VALUES (?, ?)", [
        "old-review",
        '{"note":"preserve"}',
      ]);
      await c.query("INSERT INTO candidate_exports VALUES (?, ?)", [
        "old-export",
        '{"tsv":"한글"}',
      ]);
      await c.query("INSERT INTO anki_settings VALUES (?, ?)", [
        "local",
        '{"decks":["English"]}',
      ]);
      await c.query("INSERT INTO preferences VALUES (?, ?)", ["local", 21]);
      await c.query("INSERT INTO export_batches VALUES (?, ?, ?)", [
        "old-batch",
        "2026-09-01",
        "[]",
      ]);
      const tables = (
        await c.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
        )
      ).map((r) => String(r[0]));
      async function snapshot() {
        return Promise.all(
          tables.map((t) => c.query(`SELECT * FROM "${t}" ORDER BY 1`)),
        );
      }
      const before = await snapshot();
      await assert.rejects(
        c.db.transaction(async () => {
          await c.migrate();
          throw Error("rollback DDL");
        }),
      );
      assert.equal(
        (
          await c.query(
            "SELECT name FROM sqlite_master WHERE name = 'study_plans'",
          )
        ).length,
        0,
      );
      await c.migrate();
      await c.migrate();
      assert.deepEqual(await snapshot(), before);
      assert.equal(
        (await c.query('SELECT * FROM "__drizzle_migrations"')).length,
        migrations.length,
      );
      assert.deepEqual(await c.query("PRAGMA foreign_key_check"), []);
      assert.deepEqual(await c.query("PRAGMA integrity_check"), [["ok"]]);
    } finally {
      c.close();
    }
  });
}

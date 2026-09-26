import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRepository } from "../src/data/repository";
import { connectDatabase } from "../src/data/connection";
import { actionSchema } from "../src/domain/schemas";
import { emptyCandidateFields, renderCandidate } from "../src/domain/anki";
import {
  expressionKey,
  reviewService,
} from "../src/domain/review/review-service";
import { stateRevision } from "../src/server/revision";
import {
  filterLearningSessions,
  type LearningType,
} from "../src/domain/learning";

async function start(r: SqliteRepository, type: LearningType) {
  return (
    await r.execute(
      type === "READING"
        ? { type: "start", articleId: "himalayas" }
        : {
            type: "startListening",
            sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
            userProvidedTitle: "Deletion test",
            level: "2",
          },
    )
  ).id!;
}
async function question(
  r: SqliteRepository,
  sessionId: string,
  startOffset = 0,
) {
  const itemId = (
    await r.execute({
      type: "select",
      sessionId,
      blockId: "h-1",
      start: startOffset,
      end: startOffset + 3,
    })
  ).id!;
  await r.execute({
    type: "recordReadingInteraction",
    itemId,
    interactionId: crypto.randomUUID(),
    questionType: "grammar",
    generatedPrompt: "Test prompt",
    chatOpened: false,
  });
  return itemId;
}
async function event(r: SqliteRepository, key: string) {
  return (
    await r.execute({
      type: "recordReview",
      requestId: crypto.randomUUID(),
      sourceReference: key,
      action: "DISMISSED",
      dismissal: "FOREVER",
      userUnderstandingAfter: null,
      note: "test",
      candidateId: null,
    })
  ).id!;
}
async function rounds(r: SqliteRepository, sessionId: string) {
  await r.execute({
    type: "saveRound1",
    sessionId,
    data: {
      comprehension: 30,
      summary: "My own summary",
      keywords: "news",
      difficulty: "hard",
    },
  });
  await r.execute({
    type: "saveRound2",
    sessionId,
    data: { difficultyReasons: ["speed"], reason: "Fast" },
  });
}

test("delete action accepts only explicit Reading/Listening type and a valid ID", () => {
  for (const sessionType of ["READING", "LISTENING"])
    assert.ok(
      actionSchema.safeParse({
        type: "deleteLearningSession",
        sessionId: "test",
        sessionType,
      }).success,
    );
  for (const input of [
    { sessionId: "", sessionType: "READING" },
    { sessionId: "test", sessionType: "MANUAL" },
    { sessionId: "test" },
    { sessionId: "test", sessionType: "READING", deleteCards: true },
  ])
    assert.equal(
      actionSchema.safeParse({ type: "deleteLearningSession", ...input })
        .success,
      false,
    );
});

for (const mode of ["local", "libsql"] as const) {
  test(`${mode}: preserve independently edited legacy/common cards and import a missing legacy copy`, async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "history-legacy-")),
      "test.db",
    );
    const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
    const r = new SqliteRepository(path, undefined, false, options);
    const inspect = connectDatabase(options);
    try {
      const id = await start(r, "READING");
      const itemId = await question(r, id);
      const cardId = (
        await r.execute({
          type: "manualCard",
          itemId,
          meaning: "Original meaning",
        })
      ).id!;
      const candidateId = `legacy:${cardId}`;
      const original = (await r.getState()).ankiCandidates.find(
        (c) => c.id === candidateId,
      )!;
      await r.execute({
        type: "updateCandidate",
        candidateId,
        expectedVersion: original.version,
        fields: {
          ...emptyCandidateFields(),
          expression: "Independent edit",
          meaning: "Edited meaning",
        },
        status: "READY",
        allowDuplicate: true,
      });
      const secondItem = await question(r, id, 4);
      const missingCardId = (
        await r.execute({
          type: "manualCard",
          itemId: secondItem,
          meaning: "Old unconverted card",
        })
      ).id!;
      await inspect.query("DELETE FROM anki_candidates WHERE id = ?", [
        `legacy:${missingCardId}`,
      ]);
      const edited = (await r.getState()).ankiCandidates.find(
        (c) => c.id === candidateId,
      )!;
      await r.execute({
        type: "deleteLearningSession",
        sessionId: id,
        sessionType: "READING",
      });
      const state = await r.getState();
      assert.deepEqual(
        renderCandidate(
          state.ankiCandidates.find((c) => c.id === candidateId)!,
        ),
        renderCandidate(edited),
      );
      assert.deepEqual(
        renderCandidate(
          state.ankiCandidates.find((c) => c.id === `preserved:${cardId}`)!,
        ),
        renderCandidate(original),
      );
      assert.equal(
        state.ankiCandidates.find((c) => c.id === `legacy:${missingCardId}`)
          ?.meaning,
        "Old unconverted card",
      );
      assert.ok(
        state.ankiCandidates.every(
          (c) => c.sourceSessionId === null && !c.legacyCardId,
        ),
      );
      const ready = state.ankiCandidates.find((c) => c.id === candidateId)!;
      const exported = await r.execute({
        type: "exportCandidates",
        requestId: crypto.randomUUID(),
        candidates: [{ id: ready.id, version: ready.version }],
        allowReexport: false,
      });
      assert.match(exported.tsv!, /Edited meaning/);
      assert.deepEqual(await inspect.query("PRAGMA foreign_key_check"), []);
    } finally {
      await r.close();
      inspect.close();
    }
  });
  for (const type of ["READING", "LISTENING"] as const) {
    test(`${mode} ${type}: ordered deletion preserves Anki, exports, shared topics and other sessions`, async () => {
      // Dedicated temporary database; never connect to an environment DB.
      const path = join(
        mkdtempSync(join(tmpdir(), "history-delete-")),
        "test.db",
      );
      const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
      let r = new SqliteRepository(path, undefined, false, options);
      const inspect = connectDatabase(options);
      try {
        await r.ready;
        assert.equal((await inspect.query("PRAGMA foreign_keys"))[0][0], 1);
        const id = await start(r, type),
          other = await start(r, type);
        let legacyId: string | undefined;
        let uniqueEvent: string | undefined;
        let sharedEvent: string;
        if (type === "READING") {
          const item = await question(r, id);
          await question(r, other);
          sharedEvent = await event(r, expressionKey("The"));
          await question(r, id, 4);
          uniqueEvent = await event(r, expressionKey("Him"));
          legacyId = (
            await r.execute({
              type: "manualCard",
              itemId: item,
              meaning: "뜻과 설명",
            })
          ).id!;
        } else {
          await rounds(r, id);
          await rounds(r, other);
          sharedEvent = await event(r, "difficulty:speed");
          await r.execute({
            type: "recordListeningInteraction",
            sessionId: id,
            interactionId: crypto.randomUUID(),
            questionType: "pronunciation",
            chatOpened: true,
          });
        }
        await r.execute({
          type: "saveExpression",
          sessionId: id,
          expression: "short phrase",
          meaning: "짧은 표현",
        });
        const sessionEvent = await event(r, `session:${id}`);
        const otherEvent = await event(r, `session:${other}`);
        const fields = {
          ...emptyCandidateFields(),
          expression: "kept expression",
          meaning: "보존할 뜻",
          explanation: "설명",
          exampleSentence: "I couldn't believe it.",
        };
        const candidateId = (
          await r.execute({
            type: "createCandidate",
            requestId: crypto.randomUUID(),
            sessionId: id,
            fields,
            allowDuplicate: true,
          })
        ).id!;
        await r.execute({
          type: "updateCandidate",
          candidateId,
          fields,
          expectedVersion: 1,
          status: "READY",
          allowDuplicate: true,
        });
        await r.execute({
          type: "exportCandidates",
          requestId: crypto.randomUUID(),
          candidates: [{ id: candidateId, version: 2 }],
          allowReexport: false,
        });
        const before = await r.getState();
        const originalCard = before.ankiCandidates.find(
          (c) => c.id === candidateId,
        )!;
        const beforeRevision = stateRevision(before);
        await assert.rejects(
          r.execute({
            type: "deleteLearningSession",
            sessionId: id,
            sessionType: type === "READING" ? "LISTENING" : "READING",
          }),
          /일치하지/,
        );
        assert.equal(stateRevision(await r.getState()), beforeRevision);

        const { state: after } = await r.execute({
          type: "deleteLearningSession",
          sessionId: id,
          sessionType: type,
        });
        assert.equal(
          filterLearningSessions(after.learningSessions, "ALL", "").some(
            (s) => s.id === id,
          ),
          false,
        );
        assert.equal(
          after.learningSessions
            .filter((s) => !s.completedAt)
            .some((s) => s.id === id),
          false,
        );
        for (const rows of [after.sessions, after.learningSessions])
          assert.ok(!rows.some((s) => s.id === id));
        for (const rows of [
          after.items,
          after.listeningDetails,
          after.companionInteractions,
          after.learnedExpressions,
          after.cards,
        ])
          assert.ok(!rows.some((s) => s.sessionId === id));
        assert.ok(!after.ankiCandidates.some((c) => c.sourceSessionId === id));
        assert.ok(
          !after.reviewEvents.some(
            (e) => e.id === sessionEvent || e.id === uniqueEvent,
          ),
        );
        assert.ok(after.reviewEvents.some((e) => e.id === sharedEvent));
        assert.ok(after.reviewEvents.some((e) => e.id === otherEvent));
        assert.ok(
          reviewService(after).all.every((s) => !s.sessionIds.includes(id)),
        );
        const kept = after.ankiCandidates.find((c) => c.id === candidateId)!;
        assert.deepEqual(renderCandidate(kept), renderCandidate(originalCard));
        assert.equal(kept.sourceSessionId, null);
        assert.equal(kept.sourceType, type);
        assert.equal(kept.version, originalCard.version + 1);
        assert.equal(kept.status, "EXPORTED");
        assert.equal(kept.exportedAt, originalCard.exportedAt);
        assert.deepEqual(after.candidateExports, before.candidateExports);
        assert.deepEqual(after.articles, before.articles);
        assert.deepEqual(
          after.learningSessions.find((s) => s.id === other),
          before.learningSessions.find((s) => s.id === other),
        );
        assert.deepEqual(
          after.items.filter((i) => i.sessionId === other),
          before.items.filter((i) => i.sessionId === other),
        );
        if (legacyId) {
          const legacy = before.ankiCandidates.find(
            (c) => c.id === `legacy:${legacyId}`,
          )!;
          const converted = after.ankiCandidates.find(
            (c) => c.id === legacy.id,
          )!;
          assert.deepEqual(renderCandidate(converted), renderCandidate(legacy));
          assert.equal(converted.legacyCardId, undefined);
          assert.equal(converted.legacyManaged, false);
          assert.equal(converted.sourceSessionId, null);
        }
        assert.deepEqual(await inspect.query("PRAGMA foreign_key_check"), []);
        const revision = stateRevision(after);
        await assert.rejects(
          r.execute({
            type: "deleteLearningSession",
            sessionId: id,
            sessionType: type,
          }),
          /이미 삭제/,
        );
        await assert.rejects(
          r.execute({
            type: "deleteLearningSession",
            sessionId: "missing",
            sessionType: type,
          }),
          /찾을 수 없는/,
        );
        assert.equal(stateRevision(await r.getState()), revision);
        await r.close();
        r = new SqliteRepository(path, undefined, false, options);
        assert.equal(
          stateRevision(await r.getState()),
          revision,
          "restart/backfill must not resurrect deleted records",
        );
        await r.execute({
          type: "sessionNotes",
          sessionId: other,
          notes: "Still editable",
        });
        assert.equal(
          (await r.getState()).learningSessions.find((s) => s.id === other)
            ?.notes,
          "Still editable",
        );
        await start(r, type);
      } finally {
        await r.close();
        inspect.close();
      }
    });
    test(`${mode} ${type}: a failure on the final parent delete rolls back ALL earlier changes`, async () => {
      const path = join(
        mkdtempSync(join(tmpdir(), "history-rollback-")),
        "test.db",
      );
      const options = { mode, path, url: `file:${path.replaceAll("\\", "/")}` };
      const r = new SqliteRepository(path, undefined, false, options);
      const inspect = connectDatabase(options);
      try {
        await r.ready;
        const id = await start(r, type);
        if (type === "READING") {
          const itemId = await question(r, id);
          await r.execute({
            type: "manualCard",
            itemId,
            meaning: "Preserve this",
          });
        } else {
          await rounds(r, id);
        }
        await r.execute({
          type: "saveExpression",
          sessionId: id,
          expression: "remain",
          meaning: "남다",
        });
        await event(r, `session:${id}`);
        await r.execute({
          type: "createCandidate",
          requestId: crypto.randomUUID(),
          sessionId: id,
          fields: { ...emptyCandidateFields(), expression: "remain" },
          allowDuplicate: true,
        });
        const before = await r.getState();
        await inspect.query(
          "CREATE TRIGGER deletion_failure BEFORE DELETE ON learning_sessions BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END",
        );
        await assert.rejects(
          r.execute({
            type: "deleteLearningSession",
            sessionId: id,
            sessionType: type,
          }),
          (error: Error) => /injected delete failure/.test(String(error.cause)),
        );
        assert.deepEqual(await r.getState(), before);
        assert.deepEqual(await inspect.query("PRAGMA foreign_key_check"), []);
        await inspect.query("DROP TRIGGER deletion_failure");
        await r.execute({
          type: "deleteLearningSession",
          sessionId: id,
          sessionType: type,
        });
      } finally {
        await r.close();
        inspect.close();
      }
    });
  }
}

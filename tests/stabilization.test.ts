import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqliteRepository } from "../src/data/repository";
import { publicError, UserFacingError } from "../src/domain/errors";
test("new user DB never receives demo learning rows; existing fixtures are opt-in", async () => {
  const r = new SqliteRepository(":memory:", undefined, false);
  try {
    const s = await r.getState();
    assert.equal(s.sessions.length, 0);
    assert.equal(s.learningSessions.length, 0);
    assert.equal(s.ankiCandidates.length, 0);
    assert.equal(s.companionInteractions.length, 0);
  } finally {
    await r.close();
  }
});
test("unexpected errors never expose paths, SQL, key material or stack traces", () => {
  for (const e of [
    new Error("SQLITE_ERROR C:/private/app.db secret"),
    new SyntaxError("Unexpected token"),
    "OPENAI_API_KEY",
  ]) {
    assert.equal(
      publicError(e),
      "저장하지 못했어요. 연결과 저장소를 확인하고 다시 시도해 주세요.",
    );
  }
  assert.equal(
    publicError(new UserFacingError("표현을 입력해 주세요.")),
    "표현을 입력해 주세요.",
  );
});
test("legacy card deletion preserves common candidate and removes dangling legacy reference", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const card = (await r.getState()).cards[0];
    await r.execute({ type: "deleteCard", cardId: card.id });
    const s = await r.getState();
    const c = s.ankiCandidates.find((c) => c.id === `legacy:${card.id}`)!;
    assert.ok(c);
    assert.equal(c.legacyCardId, undefined);
    assert.equal(c.legacyManaged, false);
    assert.ok(s.learningSessions.some((s) => s.id === c.sourceSessionId));
  } finally {
    await r.close();
  }
});
test("Listening summary correction uses the user's current summary before session completion without storing transient text", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const id = (
      await r.execute({
        type: "startListening",
        sourceUrl: "https://breakingnewsenglish.com/2609/260925-test.html",
        userProvidedTitle: "My lesson",
        level: "3",
      })
    ).id!;
    const summary = "People couldn't travel. 오늘 직접 쓴 요약.";
    await r.execute({
      type: "recordListeningInteraction",
      sessionId: id,
      interactionId: randomUUID(),
      questionType: "summary",
      chatOpened: false,
      userSummary: summary,
    });
    const i = (await r.getState()).companionInteractions.find(
      (i) => i.sessionId === id,
    )!;
    assert.ok(i.generatedPrompt.includes(summary));
    assert.equal(i.context, null);
    assert.equal(i.selectedText, null);
    assert.equal(
      (await r.getState()).learningSessions.find((s) => s.id === id)!
        .completedAt,
      null,
    );
  } finally {
    await r.close();
  }
});

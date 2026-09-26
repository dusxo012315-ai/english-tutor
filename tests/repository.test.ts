import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRepository } from "../src/data/repository";
test("SQLite workflow: guess gate, persisted attempts, cards and restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-room-test-"));
  const path = join(dir, "test.db");
  let repo = new SqliteRepository(path, undefined, true);
  try {
    const sessionId = (await repo.execute({ type: "start", articleId: "bird" }))
      .id!;
    const text = (await repo.getState()).articles.find((a) => a.id === "bird")!
      .blocks[0].text;
    const start = text.indexOf("able to");
    const itemId = (
      await repo.execute({
        type: "select",
        sessionId,
        blockId: "b-1",
        start,
        end: start + 7,
      })
    ).id!;
    await assert.rejects(
      async () =>
        await repo.execute({ type: "explain", itemId, unknown: false }),
      /추측/,
    );
    await repo.execute({
      type: "draft",
      itemId,
      questionType: "meaning",
      question: "뜻은?",
      guess: "할 수 있다",
      production: "",
    });
    await repo.execute({ type: "explain", itemId, unknown: false });
    await repo.execute({
      type: "draft",
      itemId,
      questionType: "meaning",
      question: "changed",
      guess: "changed",
      production: "I am able to swim.",
    });
    assert.equal(
      (await repo.getState()).items.find((i) => i.id === itemId)!
        .submittedGuess,
      "할 수 있다",
    );
    await repo.execute({ type: "step", itemId, step: "quiz" });
    await repo.execute({ type: "attempt", itemId, selectedId: "a" });
    await repo.execute({ type: "attempt", itemId, selectedId: "b" });
    await repo.execute({ type: "production", itemId });
    const cardId = (await repo.execute({ type: "makeCard", itemId })).id!;
    assert.equal((await repo.execute({ type: "makeCard", itemId })).id, cardId);
    let card = (await repo.getState()).cards.find((c) => c.id === cardId)!;
    await assert.rejects(
      async () => await repo.execute({ type: "export", cardIds: [cardId] }),
    );
    await repo.execute({
      type: "card",
      cardId,
      front: card.front,
      back: card.back,
      direction: card.direction,
      confirm: true,
      expectedVersion: card.version,
    });
    assert.ok(
      (await repo.execute({ type: "export", cardIds: [cardId] })).tsv?.includes(
        "ai_english reading recognition",
      ),
    );
    card = (await repo.getState()).cards.find((c) => c.id === cardId)!;
    await repo.execute({
      type: "card",
      cardId,
      front: "edited",
      back: card.back,
      direction: card.direction,
      confirm: false,
      expectedVersion: card.version,
    });
    await assert.rejects(
      async () =>
        await repo.execute({
          type: "card",
          cardId,
          front: "stale",
          back: card.back,
          direction: card.direction,
          confirm: true,
          expectedVersion: card.version,
        }),
      /変更|변경/,
    );
    await repo.close();
    repo = new SqliteRepository(path, undefined, true);
    const item = (await repo.getState()).items.find((i) => i.id === itemId)!;
    assert.equal(item.attempts.length, 2);
    assert.equal(item.attempts[0].correct, false);
    assert.equal(item.attempts[1].correct, true);
    assert.equal(item.production, "I am able to swim.");
    await repo.execute({ type: "flag", itemId });
    assert.equal(
      (await repo.getState()).cards.find((c) => c.id === cardId)!.blocked,
      true,
    );
  } finally {
    await repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("a failed mock explanation preserves the saved draft transactionally", async () => {
  const repo = new SqliteRepository(":memory:");
  try {
    const sessionId = (await repo.execute({ type: "start", articleId: "bird" }))
      .id!;
    const itemId = (
      await repo.execute({
        type: "select",
        sessionId,
        blockId: "b-1",
        start: 0,
        end: 5,
      })
    ).id!;
    await repo.execute({
      type: "draft",
      itemId,
      questionType: "meaning",
      question: "무슨 뜻?",
      guess: "새",
      production: "",
    });
    await assert.rejects(
      async () =>
        await repo.execute({ type: "explain", itemId, unknown: false }),
      /준비된 Mock/,
    );
    const item = (await repo.getState()).items.find((i) => i.id === itemId)!;
    assert.equal(item.guess, "새");
    assert.equal(item.answer, null);
    assert.equal(item.submittedGuess, null);
  } finally {
    await repo.close();
  }
});

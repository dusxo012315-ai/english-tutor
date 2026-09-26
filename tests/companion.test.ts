import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatGPTCompanionProvider,
  companionQuestions,
} from "../src/domain/tutor-provider";
import { buildTutorContext } from "../src/domain/selection";
import { articles } from "../src/fixtures/articles";
import { SqliteRepository } from "../src/data/repository";
import { actionSchema } from "../src/domain/schemas";
import {
  executeCurrentTutor,
  tutorRuntimeState,
} from "../src/server/tutor-runtime";
test("six question types preserve exact selection, original context, title and question", () => {
  const article = articles[0],
    block = article.blocks[1];
  const start = block.text.indexOf("were formed");
  const context = buildTutorContext(article, block.id, start, start + 11);
  for (const type of Object.keys(
    companionQuestions,
  ) as (keyof typeof companionQuestions)[]) {
    const prepared = new ChatGPTCompanionProvider().prepare({
      context,
      questionType: type,
      customQuestion: "왜 were인가요?",
    });
    assert.equal(prepared.url, "https://chatgpt.com");
    assert.ok(prepared.prompt.includes(article.title));
    assert.ok(prepared.prompt.includes("were formed"));
    assert.ok(prepared.prompt.includes(block.text));
    assert.ok(prepared.prompt.includes(companionQuestions[type]));
    assert.ok(prepared.prompt.includes("직접 답변과 보충 설명"));
    assert.ok(prepared.prompt.length < 16000);
    if (type === "custom")
      assert.ok(prepared.prompt.includes("왜 were인가요?"));
    if (type === "grammar")
      assert.ok(prepared.prompt.includes("주어·동사·수식 관계"));
    if (type === "quiz")
      assert.ok(prepared.prompt.includes("지금은 문제 하나만"));
  }
});
test("edited prompt and question persist; clear only deselects; manual Anki cards retain attribution", async () => {
  const dir = mkdtempSync(join(tmpdir(), "companion-test-"));
  const path = join(dir, "test.db");
  let repo = new SqliteRepository(path, undefined, true);
  try {
    const sessionId = (await repo.execute({ type: "start", articleId: "bird" }))
      .id!;
    const itemId = (
      await repo.execute({
        type: "select",
        sessionId,
        blockId: "b-1",
        start: 0,
        end: 39,
      })
    ).id!;
    await repo.execute({
      type: "companionDraft",
      itemId,
      questionType: "grammar",
      customQuestion: "내 질문",
      editedPrompt: "직접 수정한 프롬프트\n🦉 원문 유지",
    });
    const cardId = (
      await repo.execute({
        type: "manualCard",
        itemId,
        meaning: "명사 뒤에서 특징을 설명합니다.",
      })
    ).id!;
    assert.equal(
      (
        await repo.execute({
          type: "manualCard",
          itemId,
          meaning: "중복 카드 요청",
        })
      ).id,
      cardId,
    );
    let card = (await repo.getState()).cards.find((c) => c.id === cardId)!;
    assert.equal(card.status, "draft");
    assert.ok(card.attribution.includes("Bird"));
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
      (await repo.execute({ type: "export", cardIds: [cardId] })).tsv!.includes(
        "명사 뒤에서",
      ),
    );
    await repo.execute({ type: "clearSelection", sessionId });
    assert.equal(
      (await repo.getState()).sessions.find((s) => s.id === sessionId)!
        .activeItemId,
      null,
    );
    await repo.close();
    repo = new SqliteRepository(path, undefined, true);
    const item = (await repo.getState()).items.find((i) => i.id === itemId)!;
    assert.equal(item.answer, null);
    assert.equal(
      item.companion?.editedPrompt,
      "직접 수정한 프롬프트\n🦉 원문 유지",
    );
    assert.ok(item.tutorContext);
    await repo.execute({ type: "activate", sessionId, itemId });
    assert.equal(
      (await repo.getState()).sessions.find((s) => s.id === sessionId)!
        .activeItemId,
      itemId,
    );
    card = (await repo.getState()).cards.find((c) => c.id === cardId)!;
    assert.equal(card.status, "confirmed");
  } finally {
    await repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("old OpenAI environment settings cannot enable integrated calls", async () => {
  const prev = process.env.TUTOR_MODE;
  process.env.TUTOR_MODE = "openai";
  const repo = new SqliteRepository(":memory:");
  try {
    assert.deepEqual(tutorRuntimeState(), {
      mode: "companion",
      configured: true,
    });
    await assert.rejects(
      async () =>
        await executeCurrentTutor(repo, {
          type: "explain",
          itemId: "demo-item-0",
          unknown: true,
        }),
      /Companion/,
    );
    await assert.rejects(
      async () =>
        await executeCurrentTutor(repo, {
          type: "followup",
          itemId: "demo-item-0",
          question: "왜?",
        }),
      /Companion/,
    );
    assert.ok(
      (await executeCurrentTutor(repo, { type: "font", value: 20 })).state,
    );
  } finally {
    await repo.close();
    if (prev === undefined) delete process.env.TUTOR_MODE;
    else process.env.TUTOR_MODE = prev;
  }
});
test("companion schemas enforce input limits and valid question types", () => {
  const base = {
    type: "companionDraft",
    itemId: "x",
    questionType: "grammar",
    customQuestion: "",
    editedPrompt: null,
  };
  assert.ok(actionSchema.safeParse(base).success);
  assert.equal(
    actionSchema.safeParse({ ...base, editedPrompt: "x".repeat(16001) })
      .success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ ...base, customQuestion: "x".repeat(1001) })
      .success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ ...base, questionType: "unsupported" }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ type: "manualCard", itemId: "x", meaning: " " })
      .success,
    false,
  );
});

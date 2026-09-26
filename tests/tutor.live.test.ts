import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { SqliteRepository } from "../src/data/repository";
import { OpenAITutor } from "../src/server/adapters/openai";
loadEnvConfig(process.cwd());
test(
  "LIVE OpenAI explanation, quiz and contextual followup (two paid requests)",
  {
    skip:
      process.env.ENABLE_ARCHIVED_OPENAI_TESTS !== "true" ||
      !process.env.OPENAI_API_KEY?.trim()
        ? "Archived integration: disabled in Companion version"
        : false,
  },
  async () => {
    const repo = new SqliteRepository(":memory:");
    try {
      const sessionId = (
        await repo.execute({
          type: "start",
          articleId: "himalayas",
        })
      ).id!;
      const itemId = (
        await repo.execute({
          type: "select",
          sessionId,
          blockId: "h-2",
          start: (await repo.getState()).articles[0].blocks[1].text.indexOf(
            "were formed",
          ),
          end:
            (await repo.getState()).articles[0].blocks[1].text.indexOf(
              "were formed",
            ) + 11,
        })
      ).id!;
      const tutor = new OpenAITutor();
      await repo.executeTutor(
        { type: "explain", itemId, unknown: true },
        tutor,
      );
      let item = (await repo.getState()).items.find((i) => i.id === itemId)!;
      assert.ok(item.answer?.translationKo);
      assert.equal(item.quiz?.options.length, 3);
      await repo.executeTutor(
        {
          type: "followup",
          itemId,
          question: "왜 was가 아니라 were인가요?",
          requestId: crypto.randomUUID(),
        },
        tutor,
      );
      item = (await repo.getState()).items.find((i) => i.id === itemId)!;
      assert.ok(item.followups[0].reply);
    } finally {
      await repo.close();
    }
  },
);

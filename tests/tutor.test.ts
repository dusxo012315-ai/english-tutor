import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { SqliteRepository } from "../src/data/repository";
import {
  OpenAITutor,
  tutorInput,
  type TutorOutput,
  type AsyncTutor,
} from "../src/server/adapters/openai";
import { actionSchema } from "../src/domain/schemas";
export const output: TutorOutput = {
  directAnswerKo: "능력을 나타내요.",
  translationKo: "새는 날 수 있어요.",
  explanationKo: "be able to 뒤에는 동사원형이 와요.",
  expression: "able to",
  meaning: "할 수 있다",
  feedback: "추측을 문맥과 비교해 보세요.",
  chunks: [{ text: "able to", role: "능력 표현" }],
  vocabulary: [{ expression: "able", meaning: "할 수 있는" }],
  examples: [
    { en: "I am able to swim.", ko: "나는 수영할 수 있어요." },
    { en: "She is able to read.", ko: "그녀는 읽을 수 있어요." },
  ],
  quiz: {
    prompt: "able to 다음에는?",
    options: [
      { id: "a", text: "동사원형" },
      { id: "b", text: "과거형" },
      { id: "c", text: "복수명사" },
    ],
    correctId: "a",
    explanation: "to 뒤에 동사원형을 사용해요.",
  },
};
async function setup() {
  const repo = new SqliteRepository(":memory:");
  const sessionId = (await repo.execute({ type: "start", articleId: "bird" }))
    .id!;
  const block = (await repo.getState()).articles.find((a) => a.id === "bird")!
    .blocks[0];
  const start = block.text.indexOf("able to");
  const itemId = (
    await repo.execute({
      type: "select",
      sessionId,
      blockId: block.id,
      start,
      end: start + 7,
    })
  ).id!;
  return {
    repo,
    itemId,
    get item() {
      return repo
        .getState()
        .then((state) => state.items.find((i) => i.id === itemId)!);
    },
  };
}
test("guess first, immediate explanation, quiz cache, followup context and idempotency", async () => {
  const s = await setup();
  let calls = 0;
  const tutor: AsyncTutor = {
    async explain(i) {
      calls++;
      assert.equal(i.quote, "able to");
      assert.equal(i.tutorContext?.selection.quote, i.quote);
      assert.ok(i.tutorContext!.context[0].text.includes(i.quote));
      return output;
    },
    async followup(i, q) {
      calls++;
      assert.equal(i.answer?.provider, "openai");
      assert.equal(q, "can과 차이는?");
      return {
        directAnswerKo: "능력 표현이에요.",
        supplementaryKo: "시제에 따라 be가 변해요.",
      };
    },
  };
  try {
    await assert.rejects(
      s.repo.executeTutor(
        { type: "explain", itemId: s.itemId, unknown: false },
        tutor,
      ),
      /추측/,
    );
    assert.equal(calls, 0);
    await s.repo.executeTutor(
      { type: "explain", itemId: s.itemId, unknown: true },
      tutor,
    );
    await s.repo.executeTutor(
      { type: "explain", itemId: s.itemId, unknown: true },
      tutor,
    );
    assert.equal(calls, 1);
    await s.repo.execute({ type: "step", itemId: s.itemId, step: "quiz" });
    assert.deepEqual((await s.item).quiz, output.quiz);
    const action = {
      type: "followup" as const,
      itemId: s.itemId,
      question: "can과 차이는?",
      requestId: crypto.randomUUID(),
    };
    await s.repo.executeTutor(action, tutor);
    await s.repo.executeTutor(action, tutor);
    assert.equal(calls, 2);
    assert.equal((await s.item).followups.length, 1);
    const input = JSON.parse(tutorInput(await s.item, "더 설명해 줘"));
    assert.equal(input.history[0].question, action.question);
    assert.equal(input.selection.quote, "able to");
    assert.ok(input.previousExplanation);
    assert.equal(input.previousLearning.examples[0].en, output.examples[0].en);
    assert.equal(input.previousLearning.quiz.correctId, output.quiz.correctId);
  } finally {
    await s.repo.close();
  }
});
test("concurrent requests are locked, failed requests preserve draft and permit retry", async () => {
  const s = await setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const tutor: AsyncTutor = {
    async explain() {
      await gate;
      throw new Error("simulated failure");
    },
    async followup() {
      throw new Error();
    },
  };
  try {
    await s.repo.execute({
      type: "draft",
      itemId: s.itemId,
      questionType: "grammar",
      question: "구조는?",
      guess: "능력",
      production: "",
    });
    const first = s.repo.executeTutor(
      { type: "explain", itemId: s.itemId, unknown: false },
      tutor,
    );
    await assert.rejects(
      s.repo.executeTutor(
        { type: "explain", itemId: s.itemId, unknown: false },
        tutor,
      ),
      /이미/,
    );
    await assert.rejects(
      async () =>
        await s.repo.execute({
          type: "draft",
          itemId: s.itemId,
          questionType: "meaning",
          question: "변경",
          guess: "",
          production: "",
        }),
      /기다린/,
    );
    release();
    await assert.rejects(first, /simulated/);
    assert.equal((await s.item).guess, "능력");
    assert.equal((await s.item).answer, null);
    assert.equal((await s.item).tutorPending, undefined);
    await s.repo.executeTutor(
      { type: "explain", itemId: s.itemId, unknown: false },
      {
        ...tutor,
        async explain() {
          return output;
        },
      },
    );
    assert.equal((await s.item).submittedGuess, "능력");
  } finally {
    await s.repo.close();
  }
});
test("OpenAI SDK sends bounded exact context with strict output, no storage or automatic retries", async () => {
  const s = await setup();
  let calls = 0;
  try {
    const client = new OpenAI({
      apiKey: "test-key",
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string);
        assert.equal(body.store, false);
        assert.equal(body.max_output_tokens, 3200);
        assert.equal(body.text.format.strict, true);
        assert.equal(JSON.parse(body.input).selection.quote, "able to");
        assert.ok(body.instructions.includes("untrusted"));
        return Response.json({
          id: "resp_test",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_test",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(output),
                  annotations: [],
                },
              ],
            },
          ],
        });
      },
    });
    assert.deepEqual(
      await new OpenAITutor(client).explain(await s.item),
      output,
    );
    assert.equal(calls, 1);
  } finally {
    await s.repo.close();
  }
});
test("missing key and upstream errors are safe; no raw provider details leak", async () => {
  const s = await setup();
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      new OpenAITutor().explain(await s.item),
      /OPENAI_API_KEY/,
    );
    for (const status of [401, 403, 429, 500]) {
      let calls = 0;
      const client = new OpenAI({
        apiKey: "test-key",
        fetch: async () => {
          calls++;
          return Response.json(
            { error: { message: "SECRET-UPSTREAM", type: "error" } },
            { status },
          );
        },
      });
      await assert.rejects(
        new OpenAITutor(client).explain(await s.item),
        (e) => e instanceof Error && !e.message.includes("SECRET-UPSTREAM"),
      );
      assert.equal(calls, 1);
    }
    const timeout = new OpenAI({
      apiKey: "test-key",
      fetch: async () => {
        throw new OpenAI.APIConnectionTimeoutError();
      },
    });
    await assert.rejects(
      new OpenAITutor(timeout).explain(await s.item),
      /지연/,
    );
    const invalid = new OpenAI({
      apiKey: "test-key",
      fetch: async () => Response.json({ status: "incomplete", output: [] }),
    });
    await assert.rejects(
      new OpenAITutor(invalid).explain(await s.item),
      /완성/,
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
    await s.repo.close();
  }
});
test("input limits and recent conversation window", async () => {
  const s = await setup();
  try {
    const item = await s.item;
    item.followups = Array.from({ length: 10 }, (_, n) => ({
      question: `q${n}`,
      reply: "x".repeat(5000),
    }));
    const input = JSON.parse(tutorInput(item, "다음"));
    assert.equal(input.history.length, 4);
    assert.equal(input.history[0].question, "q6");
    assert.equal(input.history[0].directAnswer.length, 800);
    assert.equal(
      actionSchema.safeParse({
        type: "followup",
        itemId: item.id,
        question: "x".repeat(501),
      }).success,
      false,
    );
    item.tutorContext!.context[0].text = "x".repeat(18001);
    assert.throws(() => tutorInput(item), /너무 길/);
  } finally {
    await s.repo.close();
  }
});
test("refusal, malformed output, invented source chunks and empty followups are rejected", async () => {
  const s = await setup();
  const response = (text: string) => ({
    id: "resp_test",
    object: "response",
    status: "completed",
    output: [
      {
        id: "msg_test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  });
  try {
    for (const body of [
      response("not json"),
      response(
        JSON.stringify({
          ...output,
          chunks: [{ text: "invented sentence not in source", role: "주어" }],
        }),
      ),
      {
        status: "completed",
        output: [
          {
            id: "msg_test",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal: "cannot comply" }],
          },
        ],
      },
    ]) {
      const client = new OpenAI({
        apiKey: "test-key",
        fetch: async () => Response.json(body),
      });
      await assert.rejects(new OpenAITutor(client).explain(await s.item));
    }
    const client = new OpenAI({
      apiKey: "test-key",
      fetch: async () =>
        Response.json(
          response(JSON.stringify({ directAnswerKo: "", supplementaryKo: "" })),
        ),
    });
    await assert.rejects(
      new OpenAITutor(client).followup(await s.item, "왜?"),
      /비어/,
    );
  } finally {
    await s.repo.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqliteRepository } from "../src/data/repository";
import {
  reviewService,
  expressionKey,
  reviewPrompt,
} from "../src/domain/review/review-service";
import {
  priorityScore,
  seoulDay,
  weekStart,
} from "../src/domain/review/review-scoring";
import {
  reviewActionSchema,
  type ReviewEvent,
} from "../src/domain/review/review-types";
import type { AppState } from "../src/domain/types";
import type {
  CompanionInteraction,
  LearningSession,
} from "../src/domain/learning";
const now = new Date("2026-09-25T10:00:00Z");
const date = "2026-09-24T10:00:00Z";
async function fixture(): Promise<AppState> {
  const r = new SqliteRepository(":memory:");
  const state = await r.getState();
  await r.close();
  return {
    ...state,
    learningSessions: [],
    listeningDetails: [],
    companionInteractions: [],
    items: [],
    ankiCandidates: [],
    reviewEvents: [],
  };
}
function session(
  id = "s",
  type: LearningSession["type"] = "READING",
): LearningSession {
  return {
    id,
    type,
    sourceType: type === "READING" ? "WIKIPEDIA" : "BREAKING_NEWS_ENGLISH",
    sourceUrl: "https://example.com",
    userProvidedTitle: id,
    level: null,
    startedAt: date,
    completedAt: date,
    duration: 60,
    notes: "",
  };
}
function interaction(
  id = "i",
  selectedText = "be able to",
): CompanionInteraction {
  return {
    id,
    sessionId: "s",
    itemId: null,
    createdAt: date,
    questionType: "grammar",
    generatedPrompt: "Explain this",
    selectedText,
    context: "Original context",
    chatOpened: true,
    userTakeaway: "내가 배운 내용",
    userUnderstanding: "PARTLY",
    pastedExplanation: "",
    temporaryTextOmitted: false,
  };
}
function event(
  action: ReviewEvent["action"],
  dismissal: ReviewEvent["dismissal"] = null,
): ReviewEvent {
  return {
    id: randomUUID(),
    createdAt: now.toISOString(),
    itemType: "EXPRESSION",
    sourceReference: expressionKey("be able to"),
    action,
    dismissal,
    userUnderstandingBefore: 2,
    userUnderstandingAfter: null,
    note: "",
    candidateId: null,
  };
}
test("priority weights count each reason once; normalization only combines matching strings", () => {
  assert.equal(
    priorityScore([
      "lowUnderstanding",
      "lowUnderstanding",
      "userMarked",
      "recent",
    ]),
    7,
  );
  assert.equal(expressionKey(" Be   Able TO "), expressionKey("be able to"));
  assert.notEqual(expressionKey("can"), expressionKey("be able to"));
});
test("low understanding + repeated questions use normalized expression and real evidence", async () => {
  const s = await fixture();
  s.learningSessions = [session()];
  s.companionInteractions = [interaction(), interaction("j", "Be  Able To")];
  const item = reviewService(s, now).today[0];
  assert.equal(item.understandingBefore, 2);
  assert.equal(item.questionCount, 2);
  assert.equal(item.score, 6);
  assert.equal(item.interactionIds.length, 2);
  assert.equal(item.sessionIds.length, 1);
  assert.ok(reviewPrompt(item, s).includes("내가 배운 내용"));
  s.companionInteractions = [
    { ...interaction(), userUnderstanding: "UNDERSTOOD" },
  ];
  assert.equal(reviewService(s, now).today.length, 0);
});
test("Listening difficulty counts sessions once, low comprehension preserves zero and insights pair records", async () => {
  const s = await fixture();
  s.learningSessions = [session("a", "LISTENING"), session("b", "LISTENING")];
  s.listeningDetails = s.learningSessions.map((x) => ({
    sessionId: x.id,
    stage: "REFLECTION",
    round1: { comprehension: 0, keywords: "", summary: "", difficulty: "hard" },
    round2: {
      difficultyReasons: ["pronunciation", "pronunciation"],
      reason: "",
    },
    round3: null,
    recall:
      x.id === "a"
        ? { summary: "My summary", comprehension: 60, needReview: false }
        : null,
  }));
  const m = reviewService(s, now);
  const difficulty = m.today.find((i) => i.key === "difficulty:pronunciation")!;
  assert.equal(difficulty.sessionIds.length, 2);
  assert.equal(difficulty.score, 3);
  assert.ok(
    m.today
      .find((i) => i.key === "session:a")!
      .reasons.some((r) => r.code === "lowFinal"),
  );
  assert.deepEqual(
    [
      m.insights.listening.first,
      m.insights.listening.final,
      m.insights.listening.improvement,
      m.insights.listening.pairedCount,
    ],
    [0, 60, 60, 1],
  );
  assert.ok(
    reviewPrompt(difficulty, s).includes("실제 음원을 들었다고 주장하지 마"),
  );
});
test("unfinished Anki only selects CANDIDATE, existing READY still links to expression", async () => {
  const r = new SqliteRepository(":memory:");
  const candidate = (await r.getState()).ankiCandidates[0];
  await r.close();
  const s = await fixture();
  s.learningSessions = [session()];
  s.ankiCandidates = [
    {
      ...candidate,
      expression: "be able to",
      createdAt: date,
      status: "CANDIDATE",
    },
  ];
  assert.ok(
    reviewService(s, now).today[0].reasons.some(
      (r) => r.code === "unfinishedAnki",
    ),
  );
  s.ankiCandidates[0].status = "READY";
  assert.equal(reviewService(s, now).today.length, 0);
  s.companionInteractions = [interaction()];
  assert.deepEqual(reviewService(s, now).today[0].candidateIds, [candidate.id]);
});
test("missing takeaway, incomplete sessions and manual review are explained; limit six and 30 days", async () => {
  const s = await fixture();
  s.learningSessions = [session()];
  s.companionInteractions = [
    { ...interaction(), userUnderstanding: null, userTakeaway: "" },
  ];
  assert.ok(
    reviewService(s, now).today[0].reasons.some((r) => r.code === "incomplete"),
  );
  s.companionInteractions = [];
  s.learningSessions = Array.from({ length: 10 }, (_, i) => ({
    ...session(`s${i}`),
    completedAt: null,
    needReview: i === 0,
  }));
  assert.equal(reviewService(s, now).today.length, 6);
  assert.equal(reviewService(s, now).today[0].key, "session:s0");
  s.learningSessions = [
    { ...session(), startedAt: "2026-08-01T00:00:00Z", needReview: true },
  ];
  assert.equal(reviewService(s, now).today.length, 0);
});
test("Not now expires next Seoul day, permanent dismissal persists without changing original records", async () => {
  const s = await fixture();
  s.learningSessions = [session()];
  s.companionInteractions = [interaction()];
  s.reviewEvents = [event("DISMISSED", "TODAY")];
  assert.equal(reviewService(s, now).today.length, 0);
  assert.equal(
    reviewService(s, new Date("2026-09-25T15:00:00Z")).today.length,
    1,
  );
  s.reviewEvents = [event("DISMISSED", "FOREVER")];
  assert.equal(
    reviewService(s, new Date("2026-09-26T10:00:00Z")).today.length,
    0,
  );
  assert.equal(s.companionInteractions.length, 1);
  assert.equal(seoulDay("2026-09-25T15:00:00Z"), "2026-09-26");
  assert.equal(
    new Date(weekStart(now)).toISOString(),
    "2026-09-20T15:00:00.000Z",
  );
});
test("reassessment removes low understanding until new evidence; weekly items are distinct", async () => {
  const s = await fixture();
  s.learningSessions = [session()];
  s.companionInteractions = [interaction()];
  s.reviewEvents = [
    { ...event("REVIEWED"), userUnderstandingAfter: 4 },
    { ...event("REVIEWED"), userUnderstandingAfter: 4 },
  ];
  const m = reviewService(s, new Date("2026-09-26T10:00:00Z"));
  assert.equal(m.today.length, 0);
  assert.equal(m.all[0].understandingBefore, 4);
  assert.equal(m.insights.weekly.reviewed, 1);
  assert.equal(m.insights.weekly.improved, 1);
  s.companionInteractions.push({
    ...interaction("new"),
    createdAt: "2026-09-26T09:00:00Z",
  });
  assert.equal(
    reviewService(s, new Date("2026-09-26T10:00:00Z")).today[0]
      .understandingBefore,
    2,
  );
});
test("ReviewEvent repository persists references, validates actions and is idempotent without copying learning data", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const sessionId = (await r.execute({ type: "start", articleId: "bird" }))
      .id!;
    const text = (await r.getState()).articles.find((a) => a.id === "bird")!
      .blocks[0].text;
    const start = text.indexOf("able to");
    const itemId = (
      await r.execute({
        type: "select",
        sessionId,
        blockId: "b-1",
        start,
        end: start + 7,
      })
    ).id!;
    const interactionId = randomUUID();
    await r.execute({
      type: "recordReadingInteraction",
      itemId,
      interactionId,
      questionType: "grammar",
      generatedPrompt: "Explain able to",
      chatOpened: false,
    });
    await r.execute({
      type: "interactionReflection",
      interactionId,
      userTakeaway: "시제",
      userUnderstanding: "PARTLY",
      pastedExplanation: "",
    });
    const original = (await r.getState()).companionInteractions;
    const action = {
      type: "recordReview" as const,
      requestId: randomUUID(),
      sourceReference: expressionKey("able to"),
      action: "REVIEWED" as const,
      userUnderstandingAfter: 4,
      note: "예문을 만들었다",
      dismissal: null,
      candidateId: null,
    };
    await r.execute(action);
    await r.execute(action);
    assert.equal((await r.getState()).reviewEvents.length, 1);
    assert.equal(
      (await r.getState()).reviewEvents[0].userUnderstandingBefore,
      2,
    );
    assert.equal(
      (await r.getState()).reviewEvents[0].userUnderstandingAfter,
      4,
    );
    assert.deepEqual((await r.getState()).companionInteractions, original);
    assert.equal(
      "generatedPrompt" in (await r.getState()).reviewEvents[0],
      false,
    );
    for (const n of [0, 6, 1.2])
      assert.equal(
        reviewActionSchema.safeParse({ ...action, userUnderstandingAfter: n })
          .success,
        false,
      );
    await assert.rejects(
      async () =>
        await r.execute({
          ...action,
          requestId: randomUUID(),
          sourceReference: "missing",
        }),
    );
    await assert.rejects(
      async () =>
        await r.execute({
          ...action,
          requestId: randomUUID(),
          action: "ANKI",
          userUnderstandingAfter: null,
          candidateId: "missing",
        }),
    );
    await r.execute({ type: "markSessionReview", sessionId, needReview: true });
    assert.equal(
      (await r.getState()).learningSessions.find((s) => s.id === sessionId)!
        .needReview,
      true,
    );
  } finally {
    await r.close();
  }
});

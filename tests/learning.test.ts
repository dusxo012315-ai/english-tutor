import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { SqliteRepository } from "../src/data/repository";
import { actionSchema } from "../src/domain/schemas";
import { articles } from "../src/fixtures/articles";
import {
  comprehension,
  validateBneUrl,
  newLearningSession,
  filterLearningSessions,
  learningStats,
  listeningPrompt,
  listeningQuestions,
  type ListeningDetails,
} from "../src/domain/learning";
const sourceUrl =
  "https://breakingnewsenglish.com/2609/260925-test-lesson.html";
const start = async (r: SqliteRepository) =>
  (
    await r.execute({
      type: "startListening",
      sourceUrl,
      userProvidedTitle: "My listening lesson",
      level: "3",
    })
  ).id!;
test("LearningSession creates distinct Reading and Listening records without snapshots for BNE", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const articleCount = (await r.getState()).articles.length;
    const listening = await start(r);
    const reading = (await r.execute({ type: "start", articleId: "himalayas" }))
      .id!;
    const state = await r.getState();
    assert.equal(
      state.learningSessions.find((s) => s.id === listening)?.type,
      "LISTENING",
    );
    assert.equal(
      state.learningSessions.find((s) => s.id === reading)?.type,
      "READING",
    );
    assert.equal(state.articles.length, articleCount);
    assert.ok(state.listeningDetails.find((d) => d.sessionId === listening));
    assert.equal(
      state.learningSessions.find((s) => s.id === listening)?.sourceType,
      "BREAKING_NEWS_ENGLISH",
    );
  } finally {
    await r.close();
  }
});
test("comprehension enforces integers 0–100, including genuine zero", () => {
  for (const n of [0, 45, 100]) assert.ok(comprehension.safeParse(n).success);
  for (const n of [-1, 101, NaN, 1.5, "50", null])
    assert.equal(comprehension.safeParse(n).success, false);
});
test("BNE validator accepts only lesson HTML URLs on exact HTTPS host", () => {
  assert.equal(validateBneUrl(sourceUrl), sourceUrl);
  assert.ok(validateBneUrl(sourceUrl.replace("https://", "https://www.")));
  for (const url of [
    "http://breakingnewsenglish.com/2609/260925-test.html",
    "https://evil.com/2609/260925-test.html",
    "https://breakingnewsenglish.com.evil.com/2609/260925-test.html",
    "https://u:p@breakingnewsenglish.com/2609/260925-test.html",
    "https://breakingnewsenglish.com/2609/260925-test.mp3",
    "https://breakingnewsenglish.com/2609/260925-test.html?file=test.mp3",
    "https://breakingnewsenglish.com/index.html",
    "javascript:alert(1)",
    "https://breakingnewsenglish.com:8080/2609/260925-test.html",
  ])
    assert.throws(() => validateBneUrl(url));
});
test("Listening rounds persist, enforce sequence, complete once and retain notes/expressions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "learning-flow-"));
  const path = join(dir, "app.db");
  let r = new SqliteRepository(path, undefined, true);
  try {
    const id = await start(r);
    await assert.rejects(
      async () =>
        await r.execute({
          type: "saveRound3",
          sessionId: id,
          data: { comprehension: 70, newlyHeard: "", stillDifficult: "" },
        }),
      /Round 2/,
    );
    await r.execute({
      type: "saveRound1",
      sessionId: id,
      data: {
        comprehension: 0,
        keywords: "weather",
        summary: "People study the weather.",
        difficulty: "hard",
      },
    });
    await r.execute({
      type: "saveRound2",
      sessionId: id,
      data: {
        difficultyReasons: ["vocabulary", "pronunciation", "vocabulary"],
        reason: "I did not hear the weak sounds.",
      },
    });
    await r.execute({
      type: "saveRound3",
      sessionId: id,
      data: {
        comprehension: 70,
        newlyHeard: "weather forecasts",
        stillDifficult: "fast linking",
      },
    });
    await r.execute({
      type: "saveExpression",
      sessionId: id,
      expression: "be able to",
      meaning: "할 수 있다",
    });
    await r.execute({
      type: "sessionNotes",
      sessionId: id,
      notes: "My own learning note",
    });
    await r.execute({
      type: "saveRecall",
      sessionId: id,
      data: {
        summary: "People learn about the weather. It helps them plan.",
        comprehension: 85,
        needReview: true,
      },
    });
    await assert.rejects(
      async () =>
        await r.execute({
          type: "saveRecall",
          sessionId: id,
          data: { summary: "new", comprehension: 99, needReview: false },
        }),
      /완료/,
    );
    await r.close();
    r = new SqliteRepository(path, undefined, true);
    const state = await r.getState();
    const d = state.listeningDetails.find((d) => d.sessionId === id)!;
    assert.equal(d.stage, "REFLECTION");
    assert.equal(d.round1?.comprehension, 0);
    assert.equal(d.round2?.difficultyReasons.length, 2);
    assert.equal(d.round3?.comprehension, 70);
    assert.equal(d.recall?.comprehension, 85);
    assert.equal(
      state.learningSessions.find((s) => s.id === id)?.notes,
      "My own learning note",
    );
    assert.ok(state.learningSessions.find((s) => s.id === id)?.completedAt);
    assert.equal(
      state.learnedExpressions.filter((e) => e.sessionId === id).length,
      1,
    );
  } finally {
    await r.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Listening prompt has 7 modes; transient text never enters stored interaction or request schema", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const id = await start(r);
    const state = await r.getState();
    const session = state.learningSessions.find((s) => s.id === id)!;
    const d = state.listeningDetails.find((d) => d.sessionId === id)!;
    const secret = "TRANSIENT_BNE_SOURCE_DO_NOT_STORE";
    for (const type of Object.keys(
      listeningQuestions,
    ) as (keyof typeof listeningQuestions)[]) {
      assert.ok(listeningPrompt(session, d, type, secret).includes(secret));
      const interactionId = crypto.randomUUID();
      await r.execute({
        type: "recordListeningInteraction",
        sessionId: id,
        questionType: type,
        interactionId,
        chatOpened: false,
      });
      await r.execute({
        type: "recordListeningInteraction",
        sessionId: id,
        questionType: type,
        interactionId,
        chatOpened: true,
      });
    }
    assert.equal(
      (await r.getState()).companionInteractions.filter(
        (i) => i.sessionId === id,
      ).length,
      7,
    );
    assert.equal(JSON.stringify(await r.getState()).includes(secret), false);
    for (const i of (await r.getState()).companionInteractions.filter(
      (i) => i.sessionId === id,
    )) {
      assert.equal(i.selectedText, null);
      assert.equal(i.context, null);
      assert.equal(i.chatOpened, true);
      assert.ok(
        i.generatedPrompt.includes("[임시 질문 텍스트: 저장하지 않음]"),
      );
    }
    assert.equal(
      actionSchema.safeParse({
        type: "recordListeningInteraction",
        sessionId: id,
        questionType: "custom",
        interactionId: crypto.randomUUID(),
        chatOpened: false,
        generatedPrompt: secret,
      }).success,
      false,
    );
    assert.equal(
      actionSchema.safeParse({
        type: "saveExpression",
        sessionId: id,
        expression: "word ".repeat(20),
        meaning: "",
      }).success,
      false,
    );
  } finally {
    await r.close();
  }
});
test("Reading interaction preserves trusted selection and manual takeaways without AI responses", async () => {
  const r = new SqliteRepository(":memory:");
  try {
    const sessionId = (await r.execute({ type: "start", articleId: "bird" }))
      .id!;
    const itemId = (
      await r.execute({
        type: "select",
        sessionId,
        blockId: "b-1",
        start: 0,
        end: 5,
      })
    ).id!;
    const id = crypto.randomUUID();
    await r.execute({
      type: "recordReadingInteraction",
      itemId,
      interactionId: id,
      questionType: "grammar",
      generatedPrompt: "My manually edited prompt",
      chatOpened: false,
    });
    await r.execute({
      type: "interactionReflection",
      interactionId: id,
      userTakeaway: "Birds is the subject",
      userUnderstanding: "UNDERSTOOD",
      pastedExplanation: "주어 역할",
    });
    const i = (await r.getState()).companionInteractions.find(
      (i) => i.id === id,
    )!;
    assert.equal(i.selectedText, "Birds");
    assert.ok(i.context?.includes("Birds are animals"));
    assert.equal(i.userTakeaway, "Birds is the subject");
    assert.equal(
      (await r.getState()).items.find((i) => i.id === itemId)?.answer,
      null,
    );
  } finally {
    await r.close();
  }
});
test("unified History filters and weekly stats distinguish missing values from zero", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const reading = newLearningSession(
    {
      type: "READING",
      sourceType: "WIKIPEDIA",
      sourceUrl: "https://simple.wikipedia.org/wiki/Physics",
      userProvidedTitle: "Physics",
    },
    now,
  );
  const listening = newLearningSession(
    {
      type: "LISTENING",
      sourceType: "BREAKING_NEWS_ENGLISH",
      sourceUrl,
      userProvidedTitle: "News",
    },
    now,
  );
  const details: ListeningDetails = {
    sessionId: listening.id,
    stage: "REFLECTION",
    round1: { comprehension: 0, keywords: "", summary: "", difficulty: "hard" },
    round2: { difficultyReasons: ["speed"], reason: "" },
    round3: { comprehension: 50, newlyHeard: "", stillDifficult: "" },
    recall: { comprehension: 80, summary: "My summary.", needReview: true },
  };
  assert.equal(filterLearningSessions([reading, listening], "ALL").length, 2);
  assert.equal(
    filterLearningSessions([reading, listening], "LISTENING")[0].id,
    listening.id,
  );
  assert.equal(
    filterLearningSessions([reading, listening], "READING", "physics").length,
    1,
  );
  assert.deepEqual(learningStats([reading, listening], [details], now), {
    reading: 1,
    listening: 1,
    first: 0,
    final: 80,
    difficulties: [{ key: "speed", count: 1 }],
  });
  assert.equal(learningStats([reading], [], now).first, null);
});
test("actual v1 SQL migration preserves Reading IDs, source, cards and legacy Companion exactly once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "learning-migration-"));
  const folder = join(dir, "migrations");
  mkdirSync(join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
  writeFileSync(
    join(folder, "0000_lazy_ultragirl.sql"),
    readFileSync("drizzle/0000_lazy_ultragirl.sql"),
  );
  const path = join(dir, "legacy.db");
  const db = new Database(path);
  migrate(drizzle(db), { migrationsFolder: folder });
  db.prepare("INSERT INTO snapshots VALUES (?,?)").run(
    "himalayas",
    JSON.stringify(articles[0]),
  );
  const old = {
    id: "old-session",
    articleId: "himalayas",
    status: "completed",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:10:00Z",
    activeItemId: "old-item",
    cursor: "h-1",
    pane: "tutor",
  };
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    old.id,
    old.articleId,
    JSON.stringify(old),
  );
  const item = {
    id: "old-item",
    sessionId: old.id,
    blockId: "h-1",
    start: 0,
    end: 3,
    quote: "The",
    questionType: "meaning",
    question: "뜻?",
    guess: "",
    submittedGuess: null,
    unknown: false,
    step: "guess",
    answer: null,
    quiz: null,
    attempts: [],
    production: "",
    productionSaved: false,
    needsReview: false,
    followups: [],
    createdAt: old.createdAt,
    companion: {
      questionType: "grammar",
      customQuestion: "",
      editedPrompt: "Historical edited prompt",
    },
  };
  db.prepare("INSERT INTO learning_items VALUES (?,?,?)").run(
    item.id,
    old.id,
    JSON.stringify(item),
  );
  db.prepare("INSERT INTO cards VALUES (?,?,?)").run(
    "old-card",
    item.id,
    JSON.stringify({
      id: "old-card",
      itemId: item.id,
      sessionId: old.id,
      front: "The",
      back: "관사",
    }),
  );
  await db.close();
  let r = new SqliteRepository(path, undefined, true);
  try {
    const state = await r.getState();
    const migrated = state.learningSessions.find((s) => s.id === old.id)!;
    assert.equal(migrated.type, "READING");
    assert.equal(migrated.startedAt, old.createdAt);
    assert.equal(migrated.completedAt, old.updatedAt);
    assert.equal(migrated.duration, null);
    assert.ok(state.cards.find((c) => c.id === "old-card"));
    assert.equal(
      state.companionInteractions.find((i) => i.itemId === item.id)
        ?.generatedPrompt,
      "Historical edited prompt",
    );
    await r.close();
    r = new SqliteRepository(path, undefined, true);
    assert.equal(
      (await r.getState()).companionInteractions.filter(
        (i) => i.itemId === item.id,
      ).length,
      1,
    );
  } finally {
    await r.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

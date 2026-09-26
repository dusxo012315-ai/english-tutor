import { UserFacingError } from "@/domain/errors";
import {
  connectDatabase,
  type AsyncDatabase,
  type ConnectionOptions,
} from "./connection";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type {
  AppState,
  Article,
  Card,
  LearningItem,
  Session,
  TutorAdapter,
} from "@/domain/types";
import type { Action } from "@/domain/schemas";
import { defaultQuestions } from "@/domain/schemas";
import { articles } from "@/fixtures/articles";
import { MockTutorAdapter } from "@/server/adapters/mock";
import { serializeTsv } from "@/domain/tsv";
import { buildTutorContext } from "@/domain/selection";
import type { AsyncTutor } from "@/server/adapters/openai";
import { LearningRepository, isLearningAction } from "./learning-repository";
import { newLearningSession, finishLearningSession } from "@/domain/learning";
import { isReviewAction, recordReview } from "./review-repository";
import { deleteLearningSession } from "./session-deletion";
import {
  AnkiRepository,
  isAnkiAction,
  type AnkiResult,
} from "./anki-repository";
export interface Repository {
  getState(): Promise<AppState>;
  execute(action: Action): Promise<{
    state: AppState;
    id?: string;
    tsv?: string;
  }>;
}
export class SqliteRepository implements Repository {
  private connection;
  private db: AsyncDatabase;
  readonly ready: Promise<void>;
  constructor(
    path = "./data/deployment-local.db",
    private tutor: TutorAdapter = new MockTutorAdapter(),
    private seedDemo = path === ":memory:" || process.env.DEV_SEED === "true",
    options?: ConnectionOptions,
    initialize = true,
  ) {
    this.connection = connectDatabase(options || { mode: "local", path });
    this.db = this.connection.db;
    this.ready = initialize ? this.initialize() : Promise.resolve();
  }
  private async initialize() {
    await this.connection.migrate();
    await this.seed();
    await new LearningRepository(this.db).backfill();
    await new AnkiRepository(this.db).backfill();
  }
  async close() {
    await this.ready;
    this.connection.close();
  }
  async atomic<T>(fn: () => Promise<T>) {
    await this.ready;
    return await this.db.transaction(fn);
  }
  async executeTutor(action: Action, tutor: AsyncTutor) {
    await this.ready;
    if (action.type !== "explain" && action.type !== "followup")
      return await this.execute(action);
    const token = crypto.randomUUID();
    const reserved = await this.db.transaction(async (tx) => {
      const item = (
        await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, action.itemId))
          .get()
      )?.payload;
      if (!item) throw new UserFacingError("질문을 찾을 수 없어요.");
      if (action.type === "explain" && item.answer) return null;
      if (
        action.type === "followup" &&
        item.followups.some(
          (t) => t.requestId === action.requestId && action.requestId,
        )
      )
        return null;
      if (item.tutorPending && item.tutorPending.until > Date.now())
        throw new UserFacingError(
          "이미 AI가 답변을 준비하고 있어요. 잠시 후 다시 확인해 주세요.",
        );
      if (
        action.type === "followup" &&
        (!item.answer || item.followups.length >= 10)
      )
        throw new UserFacingError(
          "설명을 먼저 확인해 주세요. 추가 질문은 10개까지 가능해요.",
        );
      if (action.type === "explain") {
        if (!item.question.trim() || (!action.unknown && !item.guess.trim()))
          throw new UserFacingError(
            "질문과 추측을 입력하거나 바로 해설 보기를 선택해 주세요.",
          );
        item.unknown = action.unknown;
        item.submittedGuess = action.unknown ? null : item.guess;
      }
      const session = (await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, item.sessionId))
        .get())!.payload;
      const article = (await tx
        .select()
        .from(schema.snapshots)
        .where(eq(schema.snapshots.id, session.articleId))
        .get())!.payload;
      item.tutorContext = buildTutorContext(
        article,
        item.blockId,
        item.start,
        item.end,
      );
      item.tutorPending = { token, until: Date.now() + 60000 };
      await tx
        .update(schema.items)
        .set({ payload: item })
        .where(eq(schema.items.id, item.id))
        .run();
      return item;
    });
    if (!reserved) return { state: await this.getState() };
    try {
      const output =
        action.type === "explain"
          ? await tutor.explain(reserved)
          : await tutor.followup(reserved, action.question);
      await this.db.transaction(async (tx) => {
        const current = (await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, reserved.id))
          .get())!.payload;
        if (current.tutorPending?.token !== token)
          throw new UserFacingError("요청이 만료되었어요. 다시 확인해 주세요.");
        if ("quiz" in output) {
          const { quiz, ...answer } = output;
          current.answer = { ...answer, provider: "openai" };
          current.quiz = quiz;
          current.step = "explanation";
        } else if (action.type === "followup")
          current.followups.push({
            question: action.question,
            reply: output.directAnswerKo,
            supplementaryKo: output.supplementaryKo,
            requestId: action.requestId,
          });
        delete current.tutorPending;
        await tx
          .update(schema.items)
          .set({ payload: current })
          .where(eq(schema.items.id, current.id))
          .run();
      });
      return { state: await this.getState() };
    } finally {
      await this.db.transaction(async (tx) => {
        const current = (await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, reserved.id))
          .get())!.payload;
        if (current.tutorPending?.token === token) {
          delete current.tutorPending;
          await tx
            .update(schema.items)
            .set({ payload: current })
            .where(eq(schema.items.id, current.id))
            .run();
        }
      });
    }
  }
  async saveArticle(article: Article) {
    await this.ready;
    await this.db
      .insert(schema.snapshots)
      .values({ id: article.id, payload: article })
      .onConflictDoNothing()
      .run();
  }
  private async seed() {
    await this.db.transaction(async (tx) => {
      for (const article of articles)
        await tx
          .insert(schema.snapshots)
          .values({ id: article.id, payload: article })
          .onConflictDoNothing()
          .run();
      if (await tx.select().from(schema.preferences).get()) return;
      await tx
        .insert(schema.preferences)
        .values({ id: "local", fontSize: 21 })
        .run();
      if (!this.seedDemo || process.env.NODE_ENV === "production") return;
      const now = new Date().toISOString();
      const session: Session = {
        id: "demo-himalayas",
        articleId: "himalayas",
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
        activeItemId: null,
        cursor: "h-1",
        pane: "read",
      };
      await tx
        .insert(schema.sessions)
        .values({
          id: session.id,
          articleId: session.articleId,
          payload: session,
        })
        .run();
      const expressions = ["home to", "were formed", "depend on"];
      await Promise.all(
        expressions.map(async (expression, index) => {
          const block = articles[0].blocks[index];
          const start = block.text.indexOf(expression);
          const item = this.newItem(
            session.id,
            block.id,
            start,
            start + expression.length,
            expression,
          );
          item.id = `demo-item-${index}`;
          item.guess = [
            "여러 높은 산들이 있다는 뜻 같다.",
            "과거에 만들어졌다는 뜻 같다.",
            "무언가에 의지한다는 뜻 같다.",
          ][index];
          item.submittedGuess = item.guess;
          item.answer = this.tutor.explain(item);
          item.step = "explanation";
          item.quiz = this.tutor.quiz(item);
          if (index === 1)
            item.attempts.push({
              id: crypto.randomUUID(),
              selectedId: "a",
              correct: false,
              createdAt: now,
            });
          await tx
            .insert(schema.items)
            .values({ id: item.id, sessionId: session.id, payload: item })
            .run();
          const card = await this.newCard(item);
          if (index === 0) card.status = "confirmed";
          await tx
            .insert(schema.cards)
            .values({ id: card.id, itemId: item.id, payload: card })
            .run();
        }),
      );
    });
  }
  async getState(): Promise<AppState> {
    await this.ready;
    const anki = new AnkiRepository(this.db);

    return {
      ...(await anki.read()),
      reviewEvents: (await this.db.select().from(schema.reviewEvents).all())
        .map((r) => r.payload)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ...(await new LearningRepository(this.db).read()),
      mode: "mock",
      schemaVersion: 4,
      articles: (await this.db.select().from(schema.snapshots).all()).map(
        (r) => r.payload,
      ),
      sessions: (await this.db.select().from(schema.sessions).all())
        .map((r) => r.payload)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      items: (await this.db.select().from(schema.items).all()).map(
        (r) => r.payload,
      ),
      cards: (await this.db.select().from(schema.cards).all()).map(
        (r) => r.payload,
      ),
      fontSize:
        (await this.db.select().from(schema.preferences).get())?.fontSize ?? 21,
    };
  }
  private newItem(
    sessionId: string,
    blockId: string,
    start: number,
    end: number,
    quote: string,
  ): LearningItem {
    return {
      id: crypto.randomUUID(),
      sessionId,
      blockId,
      start,
      end,
      quote,
      questionType: "meaning",
      question: defaultQuestions.meaning,
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
      createdAt: new Date().toISOString(),
    };
  }
  private async newCard(
    item: LearningItem,
    manualMeaning?: string,
  ): Promise<Card> {
    if ((!item.answer && !manualMeaning) || item.needsReview)
      throw new UserFacingError(
        "검토가 필요한 설명에서는 카드를 만들 수 없어요.",
      );
    const session = (await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, item.sessionId))
      .get())!.payload;
    const article = (await this.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.id, session.articleId))
      .get())!.payload;
    const attribution = article.attribution
      ? `${article.title}\n${article.sourceUrl}\n${article.attribution.creatorLabel}\n${article.attribution.historyUrl}\n${article.attribution.revisionUrl}\n${article.attribution.licenseName}\n${article.attribution.licenseUrl}\n${article.attribution.extraNotices.join("\n")}\n원문 인용 · 읽기용 텍스트 추출\n${article.attribution.changes.join(" · ")}`
      : `${article.title} · 창작 Mock 자료 (Wikipedia 원문 아님)\n참고 링크: ${article.sourceUrl}\n작성: Reading Room demo fixtures · CC0 1.0\nhttps://creativecommons.org/publicdomain/zero/1.0/`;
    const expression = manualMeaning ? item.quote : item.answer!.expression;
    const meaning = manualMeaning ?? item.answer!.meaning;
    const front = manualMeaning ? item.quote : `${expression}\n${item.quote}`;
    const back =
      manualMeaning ??
      `${meaning}\n${item.answer!.examples[0].en}\n${item.answer!.examples[0].ko}`;
    return {
      id: crypto.randomUUID(),
      itemId: item.id,
      sessionId: item.sessionId,
      expression,
      meaning,
      front,
      back,
      direction: "recognition",
      status: "draft",
      blocked: false,
      version: 1,
      exportedAt: null,
      attribution,
    };
  }
  async execute(action: Action): Promise<
    {
      state: AppState;
    } & AnkiResult
  > {
    await this.ready;
    if (action.type === "deleteLearningSession") {
      await deleteLearningSession(this.db, action);
      return { state: await this.getState() };
    }
    if (isReviewAction(action)) {
      const id = await recordReview(this.db, action, await this.getState());
      return { state: await this.getState(), id };
    }
    if (isAnkiAction(action)) {
      const anki = new AnkiRepository(this.db);
      await anki.backfill();
      const result = await anki.execute(action);
      return { ...result, state: await this.getState() };
    }
    if (isLearningAction(action)) {
      const id = await new LearningRepository(this.db).execute(action);
      return { state: await this.getState(), id };
    }
    let id: string | undefined;
    let tsv: string | undefined;
    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      if (action.type === "start") {
        if (
          !(await tx
            .select()
            .from(schema.snapshots)
            .where(eq(schema.snapshots.id, action.articleId))
            .get())
        )
          throw new UserFacingError("자료를 찾을 수 없어요.");
        const session: Session = {
          id: crypto.randomUUID(),
          articleId: action.articleId,
          status: "in_progress",
          createdAt: now,
          updatedAt: now,
          activeItemId: null,
          cursor: "",
          pane: "read",
        };
        await tx
          .insert(schema.sessions)
          .values({
            id: session.id,
            articleId: session.articleId,
            payload: session,
          })
          .run();
        id = session.id;
        const article = (await tx
          .select()
          .from(schema.snapshots)
          .where(eq(schema.snapshots.id, session.articleId))
          .get())!.payload;
        const common = newLearningSession({
          id: session.id,
          type: "READING",
          sourceType:
            article.provider === "simple_wikipedia" ? "WIKIPEDIA" : "MANUAL",
          sourceUrl: article.sourceUrl,
          userProvidedTitle: article.title,
        });
        await tx
          .insert(schema.learningSessions)
          .values({ id: common.id, type: common.type, payload: common })
          .run();
      } else if (action.type === "font")
        await tx
          .update(schema.preferences)
          .set({ fontSize: action.value })
          .where(eq(schema.preferences.id, "local"))
          .run();
      else if (action.type === "export") {
        const cards = (await tx.select().from(schema.cards).all())
          .map((r) => r.payload)
          .filter((c) => action.cardIds.includes(c.id));
        if (cards.length !== new Set(action.cardIds).size)
          throw new UserFacingError("선택한 카드를 찾을 수 없어요.");
        tsv = serializeTsv(cards);
        await tx
          .insert(schema.exportsTable)
          .values({ id: crypto.randomUUID(), createdAt: now, payload: cards })
          .run();
        await Promise.all(
          cards.map(
            async (card) =>
              await tx
                .update(schema.cards)
                .set({ payload: { ...card, exportedAt: now } })
                .where(eq(schema.cards.id, card.id))
                .run(),
          ),
        );
      } else if ("cardId" in action) {
        const card = (
          await tx
            .select()
            .from(schema.cards)
            .where(eq(schema.cards.id, action.cardId))
            .get()
        )?.payload;
        if (!card) throw new UserFacingError("카드를 찾을 수 없어요.");
        if (action.type === "deleteCard") {
          // Keep exported/source history; detach the optional legacy reference.
          const id = `legacy:${card.id}`;
          const candidate = (
            await tx
              .select()
              .from(schema.ankiCandidates)
              .where(eq(schema.ankiCandidates.id, id))
              .get()
          )?.payload;
          if (candidate)
            await tx
              .update(schema.ankiCandidates)
              .set({
                payload: {
                  ...candidate,
                  legacyCardId: undefined,
                  legacyVersion: undefined,
                  legacyManaged: false,
                },
              })
              .where(eq(schema.ankiCandidates.id, id))
              .run();
          await tx
            .delete(schema.cards)
            .where(eq(schema.cards.id, card.id))
            .run();
        } else {
          if (card.version !== action.expectedVersion)
            throw new UserFacingError(
              "다른 화면에서 카드가 변경됐어요. 닫은 뒤 다시 열어 주세요.",
            );
          if (
            action.confirm &&
            (!action.front.trim() || !action.back.trim() || card.blocked)
          )
            throw new UserFacingError(
              "앞면과 뒷면을 입력하고 검토가 필요한 설명을 확인해 주세요.",
            );
          const changed =
            card.front !== action.front ||
            card.back !== action.back ||
            card.direction !== action.direction;
          await tx
            .update(schema.cards)
            .set({
              payload: {
                ...card,
                front: action.front,
                back: action.back,
                direction: action.direction,
                status: action.confirm ? "confirmed" : "draft",
                version: card.version + (changed ? 1 : 0),
              },
            })
            .where(eq(schema.cards.id, card.id))
            .run();
        }
      } else if ("sessionId" in action) {
        const session = (
          await tx
            .select()
            .from(schema.sessions)
            .where(eq(schema.sessions.id, action.sessionId))
            .get()
        )?.payload;
        if (!session) throw new UserFacingError("학습 기록을 찾을 수 없어요.");
        if (action.type === "select") {
          const article = (await tx
            .select()
            .from(schema.snapshots)
            .where(eq(schema.snapshots.id, session.articleId))
            .get())!.payload;
          const tutorContext = buildTutorContext(
            article,
            action.blockId,
            action.start,
            action.end,
          );
          const block = article.blocks.find((b) => b.id === action.blockId)!;
          const existing = (await tx.select().from(schema.items).all())
            .map((r) => r.payload)
            .find(
              (i) =>
                i.sessionId === session.id &&
                i.blockId === block.id &&
                i.start === action.start &&
                i.end === action.end,
            );
          const item =
            existing ??
            this.newItem(
              session.id,
              block.id,
              action.start,
              action.end,
              block.text.slice(action.start, action.end),
            );
          item.tutorContext = tutorContext;
          item.companion ??= {
            questionType: "translation",
            customQuestion: "",
            editedPrompt: null,
          };
          if (!existing)
            await tx
              .insert(schema.items)
              .values({ id: item.id, sessionId: session.id, payload: item })
              .run();
          else
            await tx
              .update(schema.items)
              .set({ payload: item })
              .where(eq(schema.items.id, item.id))
              .run();
          session.activeItemId = item.id;
          session.cursor = block.id;
          session.pane = "tutor";
          id = item.id;
        } else if (action.type === "clearSelection") {
          session.activeItemId = null;
          session.pane = "read";
        } else if (action.type === "finish") {
          session.status = "completed";
          const common = (await tx
            .select()
            .from(schema.learningSessions)
            .where(eq(schema.learningSessions.id, session.id))
            .get())!.payload;
          await tx
            .update(schema.learningSessions)
            .set({ payload: finishLearningSession(common) })
            .where(eq(schema.learningSessions.id, session.id))
            .run();
        } else if (action.type === "cursor") {
          session.cursor = action.blockId;
          session.pane = action.pane;
        } else {
          const item = (
            await tx
              .select()
              .from(schema.items)
              .where(eq(schema.items.id, action.itemId))
              .get()
          )?.payload;
          if (!item || item.sessionId !== session.id)
            throw new UserFacingError("연결된 질문을 찾을 수 없어요.");
          session.activeItemId = item.id;
          session.cursor = item.blockId;
          session.pane = "tutor";
        }
        session.updatedAt = now;
        await tx
          .update(schema.sessions)
          .set({ payload: session })
          .where(eq(schema.sessions.id, session.id))
          .run();
      } else if ("itemId" in action) {
        const item = (
          await tx
            .select()
            .from(schema.items)
            .where(eq(schema.items.id, action.itemId))
            .get()
        )?.payload;
        if (!item) throw new UserFacingError("질문을 찾을 수 없어요.");
        if (
          action.type === "draft" &&
          item.tutorPending &&
          item.tutorPending.until > Date.now()
        )
          throw new UserFacingError(
            "AI 응답을 기다린 뒤 질문을 수정해 주세요.",
          );
        switch (action.type) {
          case "companionDraft":
            item.companion = {
              questionType: action.questionType,
              customQuestion: action.customQuestion,
              editedPrompt: action.editedPrompt,
            };
            break;
          case "manualCard": {
            const existing = (await tx.select().from(schema.cards).all()).find(
              (c) => c.itemId === item.id,
            );
            const card =
              existing?.payload ?? (await this.newCard(item, action.meaning));
            if (!existing)
              await tx
                .insert(schema.cards)
                .values({ id: card.id, itemId: item.id, payload: card })
                .run();
            id = card.id;
            break;
          }
          case "draft":
            if (!item.answer) {
              item.questionType = action.questionType;
              item.question = action.question;
              item.guess = action.guess;
            }
            item.production = action.production;
            item.productionSaved = false;
            break;
          case "explain":
            if (item.answer) break;
            if (!item.question.trim())
              throw new UserFacingError("질문을 입력해 주세요.");
            item.unknown = action.unknown;
            item.submittedGuess = action.unknown ? null : item.guess;
            item.answer = this.tutor.explain(item);
            item.step = "explanation";
            break;
          case "step":
            if (!item.answer)
              throw new UserFacingError("설명을 먼저 확인해 주세요.");
            item.step = action.step;
            if (action.step === "quiz" && !item.quiz)
              item.quiz = this.tutor.quiz(item);
            break;
          case "attempt":
            if (!item.quiz)
              throw new UserFacingError("문제를 먼저 열어 주세요.");
            item.attempts.push({
              id: crypto.randomUUID(),
              selectedId: action.selectedId,
              correct: action.selectedId === item.quiz.correctId,
              createdAt: now,
            });
            break;
          case "production":
            if (!item.production.trim())
              throw new UserFacingError("영어 문장을 입력해 주세요.");
            item.productionSaved = true;
            break;
          case "followup":
            if (!item.answer)
              throw new UserFacingError("설명을 먼저 확인해 주세요.");
            if (item.followups.length >= 10)
              throw new UserFacingError(
                "추가 질문은 10개까지 저장할 수 있어요.",
              );
            item.followups.push({
              question: action.question,
              reply: this.tutor.followup(item, action.question),
            });
            break;
          case "flag":
            item.needsReview = true;
            await Promise.all(
              (await tx.select().from(schema.cards).all())
                .map((r) => r.payload)
                .filter((c) => c.itemId === item.id)
                .map(
                  async (c) =>
                    await tx
                      .update(schema.cards)
                      .set({
                        payload: { ...c, blocked: true, status: "draft" },
                      })
                      .where(eq(schema.cards.id, c.id))
                      .run(),
                ),
            );
            break;
          case "makeCard": {
            const existing = (await tx.select().from(schema.cards).all()).find(
              (c) => c.itemId === item.id,
            );
            const card = existing?.payload ?? (await this.newCard(item));
            if (!existing)
              await tx
                .insert(schema.cards)
                .values({ id: card.id, itemId: item.id, payload: card })
                .run();
            id = card.id;
            break;
          }
        }
        await tx
          .update(schema.items)
          .set({ payload: item })
          .where(eq(schema.items.id, item.id))
          .run();
      }
    });
    await new AnkiRepository(this.db).backfill();
    return { state: await this.getState(), id, tsv };
  }
}

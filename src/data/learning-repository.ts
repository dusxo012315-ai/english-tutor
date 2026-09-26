import { UserFacingError } from "@/domain/errors";
import type { AsyncDatabase } from "./connection";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { actionSchema, type Action } from "@/domain/schemas";
import {
  newLearningSession,
  finishLearningSession,
  listeningPrompt,
  validateBneUrl,
  type CompanionInteraction,
  type LearningSession,
  type ListeningDetails,
} from "@/domain/learning";
import { buildTutorContext } from "@/domain/selection";
import { companionProvider } from "@/domain/tutor-provider";
const learningActions = new Set([
  "startListening",
  "saveRound1",
  "saveRound2",
  "saveRound3",
  "saveRecall",
  "sessionNotes",
  "saveExpression",
  "recordReadingInteraction",
  "recordListeningInteraction",
  "interactionReflection",
]);
type LearningAction = Extract<
  Action,
  {
    type:
      | "startListening"
      | "saveRound1"
      | "saveRound2"
      | "saveRound3"
      | "saveRecall"
      | "sessionNotes"
      | "saveExpression"
      | "recordReadingInteraction"
      | "recordListeningInteraction"
      | "interactionReflection";
  }
>;
export const isLearningAction = (action: Action): action is LearningAction =>
  learningActions.has(action.type);
export class LearningRepository {
  constructor(private db: AsyncDatabase) {}
  async read() {
    return {
      learningSessions: (
        await this.db.select().from(schema.learningSessions).all()
      ).map((r) => r.payload),
      listeningDetails: (
        await this.db.select().from(schema.listeningDetails).all()
      ).map((r) => r.payload),
      companionInteractions: (
        await this.db.select().from(schema.companionInteractions).all()
      )
        .map((r) => r.payload)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      learnedExpressions: (
        await this.db.select().from(schema.learnedExpressions).all()
      ).map((r) => r.payload),
    };
  }
  async backfill() {
    await this.db.transaction(async (tx) => {
      for (const { payload: s } of await tx
        .select()
        .from(schema.sessions)
        .all()) {
        const article = (await tx
          .select()
          .from(schema.snapshots)
          .where(eq(schema.snapshots.id, s.articleId))
          .get())!.payload;
        const common: LearningSession = {
          id: s.id,
          type: "READING",
          sourceType:
            article.provider === "simple_wikipedia" ? "WIKIPEDIA" : "MANUAL",
          sourceUrl: article.sourceUrl,
          userProvidedTitle: article.title,
          level: null,
          startedAt: s.createdAt,
          completedAt: s.status === "completed" ? s.updatedAt : null,
          duration: null,
          notes: "",
          migrated: true,
        };
        await tx
          .insert(schema.learningSessions)
          .values({ id: s.id, type: "READING", payload: common })
          .onConflictDoNothing()
          .run();
      }
      for (const { payload: item } of await tx
        .select()
        .from(schema.items)
        .all()) {
        if (!item.companion) continue;
        const id = `legacy-companion:${item.id}`;
        if (
          await tx
            .select()
            .from(schema.companionInteractions)
            .where(eq(schema.companionInteractions.id, id))
            .get()
        )
          continue;
        const session = (await tx
          .select()
          .from(schema.learningSessions)
          .where(eq(schema.learningSessions.id, item.sessionId))
          .get())!.payload;
        if (!session.migrated || session.legacyCompanionImported) continue;
        const old = (await tx
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.id, item.sessionId))
          .get())!.payload;
        const article = (await tx
          .select()
          .from(schema.snapshots)
          .where(eq(schema.snapshots.id, old.articleId))
          .get())!.payload;
        const context = buildTutorContext(
          article,
          item.blockId,
          item.start,
          item.end,
        );
        const interaction: CompanionInteraction = {
          id,
          sessionId: item.sessionId,
          itemId: item.id,
          createdAt: item.createdAt,
          questionType: item.companion.questionType,
          generatedPrompt:
            item.companion.editedPrompt ??
            companionProvider.prepare({ context, ...item.companion }).prompt,
          selectedText: item.quote,
          context: context.context.map((b) => b.text).join("\n\n"),
          chatOpened: false,
          userTakeaway: "",
          userUnderstanding: null,
          pastedExplanation: "",
          temporaryTextOmitted: false,
          migrated: true,
        };
        await tx
          .insert(schema.companionInteractions)
          .values({ id, sessionId: item.sessionId, payload: interaction })
          .onConflictDoNothing()
          .run();
      }
      for (const row of await tx.select().from(schema.learningSessions).all())
        if (row.payload.migrated && !row.payload.legacyCompanionImported)
          await tx
            .update(schema.learningSessions)
            .set({ payload: { ...row.payload, legacyCompanionImported: true } })
            .where(eq(schema.learningSessions.id, row.id))
            .run();
    });
  }
  async execute(unparsed: Action) {
    const action = actionSchema.parse(unparsed);
    if (!isLearningAction(action))
      throw new UserFacingError("지원하지 않는 학습 요청입니다.");
    let id: string | undefined;
    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      if (action.type === "startListening") {
        const session = newLearningSession({
          type: "LISTENING",
          sourceType: "BREAKING_NEWS_ENGLISH",
          sourceUrl: validateBneUrl(action.sourceUrl),
          userProvidedTitle: action.userProvidedTitle,
          level: action.level,
        });
        await tx
          .insert(schema.learningSessions)
          .values({ id: session.id, type: session.type, payload: session })
          .run();
        await tx
          .insert(schema.listeningDetails)
          .values({
            sessionId: session.id,
            payload: {
              sessionId: session.id,
              stage: "ROUND1",
              round1: null,
              round2: null,
              round3: null,
              recall: null,
            },
          })
          .run();
        id = session.id;
        return;
      }
      if (action.type === "interactionReflection") {
        const row = await tx
          .select()
          .from(schema.companionInteractions)
          .where(eq(schema.companionInteractions.id, action.interactionId))
          .get();
        if (!row) throw new UserFacingError("질문 기록을 찾을 수 없어요.");
        await tx
          .update(schema.companionInteractions)
          .set({
            payload: {
              ...row.payload,
              userTakeaway: action.userTakeaway,
              userUnderstanding: action.userUnderstanding,
              pastedExplanation: action.pastedExplanation,
            },
          })
          .where(eq(schema.companionInteractions.id, row.id))
          .run();
        id = row.id;
        return;
      }
      if (action.type === "recordReadingInteraction") {
        const item = (
          await tx
            .select()
            .from(schema.items)
            .where(eq(schema.items.id, action.itemId))
            .get()
        )?.payload;
        if (!item) throw new UserFacingError("Reading 선택을 찾을 수 없어요.");
        const common = (
          await tx
            .select()
            .from(schema.learningSessions)
            .where(eq(schema.learningSessions.id, item.sessionId))
            .get()
        )?.payload;
        if (common?.type !== "READING")
          throw new UserFacingError("Reading 세션이 아니에요.");
        const old = (await tx
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.id, item.sessionId))
          .get())!.payload;
        const article = (await tx
          .select()
          .from(schema.snapshots)
          .where(eq(schema.snapshots.id, old.articleId))
          .get())!.payload;
        const context = buildTutorContext(
          article,
          item.blockId,
          item.start,
          item.end,
        );
        const existing = (
          await tx
            .select()
            .from(schema.companionInteractions)
            .where(eq(schema.companionInteractions.id, action.interactionId))
            .get()
        )?.payload;
        if (
          existing &&
          (existing.itemId !== item.id ||
            existing.generatedPrompt !== action.generatedPrompt ||
            existing.questionType !== action.questionType)
        )
          throw new UserFacingError(
            "질문 기록이 변경됐어요. 새 질문으로 저장해 주세요.",
          );
        const payload: CompanionInteraction = existing
          ? {
              ...existing,
              chatOpened: existing.chatOpened || action.chatOpened,
            }
          : {
              id: action.interactionId,
              sessionId: item.sessionId,
              itemId: item.id,
              createdAt: now,
              questionType: action.questionType,
              generatedPrompt: action.generatedPrompt,
              selectedText: context.selection.quote,
              context: context.context.map((b) => b.text).join("\n\n"),
              chatOpened: action.chatOpened,
              userTakeaway: "",
              userUnderstanding: null,
              pastedExplanation: "",
              temporaryTextOmitted: false,
            };
        await tx
          .insert(schema.companionInteractions)
          .values({ id: payload.id, sessionId: payload.sessionId, payload })
          .onConflictDoUpdate({
            target: schema.companionInteractions.id,
            set: { payload },
          })
          .run();
        id = payload.id;
        return;
      }
      if (!("sessionId" in action))
        throw new UserFacingError("지원하지 않는 학습 기록 요청이에요.");
      const session = (
        await tx
          .select()
          .from(schema.learningSessions)
          .where(eq(schema.learningSessions.id, action.sessionId))
          .get()
      )?.payload;
      if (!session) throw new UserFacingError("학습 기록을 찾을 수 없어요.");
      if (action.type === "sessionNotes") {
        await tx
          .update(schema.learningSessions)
          .set({ payload: { ...session, notes: action.notes } })
          .where(eq(schema.learningSessions.id, session.id))
          .run();
        return;
      }
      if (action.type === "saveExpression") {
        const existing = (
          await tx.select().from(schema.learnedExpressions).all()
        ).find(
          (e) =>
            e.sessionId === session.id &&
            e.payload.expression === action.expression,
        );
        id = existing?.id ?? crypto.randomUUID();
        if (!existing)
          await tx
            .insert(schema.learnedExpressions)
            .values({
              id,
              sessionId: session.id,
              payload: {
                id,
                sessionId: session.id,
                expression: action.expression,
                meaning: action.meaning,
                createdAt: now,
              },
            })
            .run();
        return;
      }
      if (session.type !== "LISTENING")
        throw new UserFacingError("Listening 세션이 아니에요.");
      const details = (await tx
        .select()
        .from(schema.listeningDetails)
        .where(eq(schema.listeningDetails.sessionId, session.id))
        .get())!.payload;
      if (action.type === "recordListeningInteraction") {
        const existing = (
          await tx
            .select()
            .from(schema.companionInteractions)
            .where(eq(schema.companionInteractions.id, action.interactionId))
            .get()
        )?.payload;
        if (
          existing &&
          (existing.sessionId !== session.id ||
            existing.questionType !== action.questionType)
        )
          throw new UserFacingError("다른 질문의 기록이에요.");
        // No raw prompt, temporary text, selection or context is accepted by this action.
        const payload: CompanionInteraction = existing
          ? {
              ...existing,
              chatOpened: existing.chatOpened || action.chatOpened,
            }
          : {
              id: action.interactionId,
              sessionId: session.id,
              itemId: null,
              createdAt: now,
              questionType: action.questionType,
              generatedPrompt: listeningPrompt(
                session,
                details,
                action.questionType,
                undefined,
                action.questionType === "summary"
                  ? action.userSummary
                  : undefined,
              ),
              selectedText: null,
              context: null,
              chatOpened: action.chatOpened,
              userTakeaway: "",
              userUnderstanding: null,
              pastedExplanation: "",
              temporaryTextOmitted: true,
              stage: details.stage,
            };
        await tx
          .insert(schema.companionInteractions)
          .values({ id: payload.id, sessionId: session.id, payload })
          .onConflictDoUpdate({
            target: schema.companionInteractions.id,
            set: { payload },
          })
          .run();
        id = payload.id;
        return;
      }
      if (session.completedAt)
        throw new UserFacingError(
          "완료한 학습이에요. 메모와 배운 내용을 추가할 수 있어요.",
        );
      const updated: ListeningDetails = { ...details };
      switch (action.type) {
        case "saveRound1":
          updated.round1 = action.data;
          if (details.stage === "ROUND1") updated.stage = "ROUND2";
          break;
        case "saveRound2":
          if (!details.round1)
            throw new UserFacingError("Round 1을 먼저 저장해 주세요.");
          updated.round2 = {
            ...action.data,
            difficultyReasons: [...new Set(action.data.difficultyReasons)],
          };
          if (details.stage === "ROUND2") updated.stage = "ROUND3";
          break;
        case "saveRound3":
          if (!details.round2)
            throw new UserFacingError("Round 2를 먼저 저장해 주세요.");
          updated.round3 = action.data;
          if (details.stage === "ROUND3") updated.stage = "FINAL";
          break;
        case "saveRecall":
          if (!details.round3)
            throw new UserFacingError("Round 3을 먼저 저장해 주세요.");
          updated.recall = action.data;
          updated.stage = "REFLECTION";
          await tx
            .update(schema.learningSessions)
            .set({ payload: finishLearningSession(session) })
            .where(eq(schema.learningSessions.id, session.id))
            .run();
          break;
        default:
          throw new UserFacingError("지원하지 않는 학습 기록 요청이에요.");
      }
      await tx
        .update(schema.listeningDetails)
        .set({ payload: updated })
        .where(eq(schema.listeningDetails.sessionId, session.id))
        .run();
    });
    return id;
  }
}

import { z } from "zod";
import { ankiActions } from "./anki";
import { reviewActions } from "./review/review-types";
import {
  round1Schema,
  round2Schema,
  round3Schema,
  recallSchema,
  shortExpression,
  validateBneUrl,
} from "./learning";
const id = z.string().min(1).max(100);
export const actionSchema = z.discriminatedUnion("type", [
  ...ankiActions,
  ...reviewActions,
  z
    .object({
      type: z.literal("deleteLearningSession"),
      sessionId: id,
      sessionType: z.enum(["READING", "LISTENING"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("startListening"),
      sourceUrl: z
        .string()
        .max(2048)
        .transform((v, ctx) => {
          try {
            return validateBneUrl(v);
          } catch (e) {
            ctx.addIssue({ code: "custom", message: (e as Error).message });
            return z.NEVER;
          }
        }),
      userProvidedTitle: z.string().trim().min(1).max(200),
      level: z.enum(["0", "1", "2", "3", "4", "5", "6", "other"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveRound1"),
      sessionId: id,
      data: round1Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal("saveRound2"),
      sessionId: id,
      data: round2Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal("saveRound3"),
      sessionId: id,
      data: round3Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal("saveRecall"),
      sessionId: id,
      data: recallSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("sessionNotes"),
      sessionId: id,
      notes: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveExpression"),
      sessionId: id,
      expression: shortExpression,
      meaning: z.string().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("recordReadingInteraction"),
      itemId: id,
      interactionId: z.string().uuid(),
      questionType: z.enum([
        "translation",
        "grammar",
        "vocabulary",
        "examples",
        "quiz",
        "custom",
      ]),
      generatedPrompt: z.string().min(1).max(16000),
      chatOpened: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("recordListeningInteraction"),
      userSummary: z.string().max(2000).optional(),
      sessionId: id,
      interactionId: z.string().uuid(),
      questionType: z.enum([
        "missed",
        "pronunciation",
        "grammar",
        "vocabulary",
        "quiz",
        "summary",
        "custom",
      ]),
      chatOpened: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("interactionReflection"),
      interactionId: id,
      userTakeaway: z.string().max(1000),
      userUnderstanding: z.enum(["NOT_YET", "PARTLY", "UNDERSTOOD"]).nullable(),
      pastedExplanation: z.string().max(2000),
    })
    .strict(),
  z.object({ type: z.literal("clearSelection"), sessionId: id }),
  z.object({
    type: z.literal("companionDraft"),
    itemId: id,
    questionType: z.enum([
      "translation",
      "grammar",
      "vocabulary",
      "examples",
      "quiz",
      "custom",
    ]),
    customQuestion: z.string().max(1000),
    editedPrompt: z.string().max(16000).nullable(),
  }),
  z.object({
    type: z.literal("manualCard"),
    itemId: id,
    meaning: z.string().trim().min(1).max(2000),
  }),
  z.object({ type: z.literal("start"), articleId: id }),
  z.object({
    type: z.literal("select"),
    sessionId: id,
    blockId: id,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("draft"),
    itemId: id,
    questionType: z.enum(["meaning", "grammar", "usage", "custom"]),
    question: z.string().max(1000),
    guess: z.string().max(1000),
    production: z.string().max(500),
  }),
  z.object({ type: z.literal("explain"), itemId: id, unknown: z.boolean() }),
  z.object({
    type: z.literal("step"),
    itemId: id,
    step: z.enum(["guess", "explanation", "quiz"]),
  }),
  z.object({
    type: z.literal("attempt"),
    itemId: id,
    selectedId: z.enum(["a", "b", "c"]).nullable(),
  }),
  z.object({ type: z.literal("production"), itemId: id }),
  z.object({
    type: z.literal("followup"),
    itemId: id,
    question: z.string().trim().min(1).max(500),
    requestId: z.string().uuid().optional(),
  }),
  z.object({ type: z.literal("flag"), itemId: id }),
  z.object({ type: z.literal("makeCard"), itemId: id }),
  z.object({
    type: z.literal("card"),
    cardId: id,
    front: z.string().max(2000),
    back: z.string().max(2000),
    direction: z.enum(["recognition", "production"]),
    confirm: z.boolean(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ type: z.literal("deleteCard"), cardId: id }),
  z.object({ type: z.literal("finish"), sessionId: id }),
  z.object({
    type: z.literal("cursor"),
    sessionId: id,
    blockId: id,
    pane: z.enum(["read", "tutor"]),
  }),
  z.object({ type: z.literal("activate"), sessionId: id, itemId: id }),
  z.object({
    type: z.literal("font"),
    value: z.number().int().min(18).max(26),
  }),
  z.object({ type: z.literal("export"), cardIds: z.array(id).min(1).max(200) }),
]);
export type Action = z.infer<typeof actionSchema>;
export const questionLabels = {
  meaning: "뜻·해석",
  grammar: "문장 구조·문법",
  usage: "표현·예문",
  custom: "직접 질문",
} as const;
export const defaultQuestions = {
  meaning: "이 표현은 문맥에서 어떤 뜻인가요?",
  grammar: "이 문장의 구조와 문법을 설명해 주세요.",
  usage: "이 표현을 어떻게 사용하나요?",
  custom: "",
};

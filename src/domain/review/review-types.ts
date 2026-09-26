import { z } from "zod";
export const reviewItemTypes = [
  "EXPRESSION",
  "LISTENING_DIFFICULTY",
  "SESSION",
] as const;
export type ReviewItemType = (typeof reviewItemTypes)[number];
export interface ReviewEvent {
  id: string;
  createdAt: string;
  itemType: ReviewItemType;
  sourceReference: string;
  action: "REVIEWED" | "CHATGPT" | "ANKI" | "DISMISSED";
  userUnderstandingBefore: number | null;
  userUnderstandingAfter: number | null;
  note: string;
  dismissal: "TODAY" | "FOREVER" | null;
  candidateId: string | null;
}
export interface ReviewSuggestion {
  key: string;
  itemType: ReviewItemType;
  title: string;
  category: string;
  sessionIds: string[];
  interactionIds: string[];
  candidateIds: string[];
  lastStudied: string;
  understandingBefore: number | null;
  understandingOrigin: string;
  reasons: { code: string; text: string }[];
  score: number;
  questionCount: number;
  difficulty?: string;
}
export const reviewActions = [
  z
    .object({
      type: z.literal("recordReview"),
      requestId: z.string().uuid(),
      sourceReference: z.string().min(1).max(5000),
      action: z.enum(["REVIEWED", "CHATGPT", "ANKI", "DISMISSED"]),
      userUnderstandingAfter: z.number().int().min(1).max(5).nullable(),
      note: z.string().max(1000),
      dismissal: z.enum(["TODAY", "FOREVER"]).nullable(),
      candidateId: z.string().max(100).nullable(),
    })
    .strict()
    .refine(
      (a) => (a.action === "DISMISSED") === (a.dismissal !== null),
      "숨김 범위를 확인하세요.",
    )
    .refine(
      (a) => a.action === "REVIEWED" || a.userUnderstandingAfter === null,
      "이해도 재평가는 Review 완료 시 기록하세요.",
    )
    .refine(
      (a) => (a.action === "ANKI") === (a.candidateId !== null),
      "Anki 카드 연결을 확인하세요.",
    ),
  z
    .object({
      type: z.literal("markSessionReview"),
      sessionId: z.string().min(1).max(100),
      needReview: z.boolean(),
    })
    .strict(),
] as const;
export const reviewActionSchema = z.discriminatedUnion("type", reviewActions);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

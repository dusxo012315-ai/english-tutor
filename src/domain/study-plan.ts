import { z } from "zod";
import type { LearningSession } from "./learning";
import type { Article } from "./types";

export interface StudyPlan {
  id: string;
  type: "READING" | "LISTENING";
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface StudyPlanItem {
  id: string;
  planId: string;
  position: number;
  title: string;
  sourceType: "WIKIPEDIA" | "BREAKING_NEWS_ENGLISH";
  sourceUrl: string;
  level: string | null;
  articleId: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
const id = z.string().min(1).max(100);
export const planActions = [
  z
    .object({
      type: z.literal("createPlan"),
      requestId: id,
      name: z.string().trim().min(1).max(200),
      planType: z.enum(["READING", "LISTENING"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("renamePlan"),
      planId: id,
      name: z.string().trim().min(1).max(200),
    })
    .strict(),
  z.object({ type: z.literal("deletePlan"), planId: id }).strict(),
  z
    .object({
      type: z.literal("addReadingPlanItem"),
      planId: id,
      requestId: id,
      articleId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("addListeningPlanItem"),
      planId: id,
      requestId: id,
      title: z.string().trim().min(1).max(200),
      sourceUrl: z.string().max(2048),
      level: z.enum(["0", "1", "2", "3", "4", "5", "6", "other"]),
    })
    .strict(),
  z.object({ type: z.literal("deletePlanItem"), itemId: id }).strict(),
  z
    .object({
      type: z.literal("movePlanItem"),
      itemId: id,
      direction: z.enum(["up", "down"]),
    })
    .strict(),
  z.object({ type: z.literal("startPlanItem"), itemId: id }).strict(),
] as const;
export const planActionSchema = z.discriminatedUnion("type", planActions);
export type PlanAction = z.infer<typeof planActionSchema>;
export function planItemStatus(
  item: StudyPlanItem,
  sessions: LearningSession[],
) {
  const session = sessions.find((s) => s.id === item.sessionId);
  return !session
    ? "PLANNED"
    : session.completedAt
      ? "COMPLETED"
      : "IN_PROGRESS";
}
export function nextPlanItem(
  planId: string,
  items: StudyPlanItem[],
  sessions: LearningSession[],
) {
  return items
    .filter(
      (i) => i.planId === planId && planItemStatus(i, sessions) !== "COMPLETED",
    )
    .sort((a, b) => a.position - b.position)[0];
}
export function canPrintArticle(article: Article) {
  return (
    article.provider === "simple_wikipedia" &&
    !!article.revisionId &&
    !!article.attribution
  );
}

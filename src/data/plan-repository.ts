import { eq, asc } from "drizzle-orm";
import type { AsyncDatabase } from "./connection";
import * as schema from "./schema";
import { planActionSchema, type PlanAction } from "@/domain/study-plan";
import { UserFacingError } from "@/domain/errors";
import { validateBneUrl } from "@/domain/learning";
import type { Action } from "@/domain/schemas";

export const isPlanAction = (action: Action): action is PlanAction =>
  planActionSchema.options.some((s) => s.shape.type.value === action.type);

export async function executePlan(
  db: AsyncDatabase,
  input: PlanAction,
  startSession: (action: Action) => Promise<{ id?: string }>,
) {
  const action = planActionSchema.parse(input);
  return db.transaction(async (tx) => {
    const now = new Date().toISOString();
    if (action.type === "createPlan") {
      const old = await tx
        .select()
        .from(schema.studyPlans)
        .where(eq(schema.studyPlans.id, action.requestId))
        .get();
      if (old) {
        if (old.type !== action.planType || old.name !== action.name)
          throw new UserFacingError(
            "이미 사용한 요청이에요. 새로고침해 주세요.",
          );
        return old.id;
      }
      await tx
        .insert(schema.studyPlans)
        .values({
          id: action.requestId,
          type: action.planType,
          name: action.name,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return action.requestId;
    }
    const item =
      "itemId" in action
        ? await tx
            .select()
            .from(schema.studyPlanItems)
            .where(eq(schema.studyPlanItems.id, action.itemId))
            .get()
        : undefined;
    if ("itemId" in action && !item)
      throw new UserFacingError("계획 항목을 찾을 수 없어요.");
    const planId = "planId" in action ? action.planId : item!.planId;
    const plan = await tx
      .select()
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.id, planId))
      .get();
    if (!plan) throw new UserFacingError("학습 계획을 찾을 수 없어요.");
    const items = await tx
      .select()
      .from(schema.studyPlanItems)
      .where(eq(schema.studyPlanItems.planId, planId))
      .orderBy(asc(schema.studyPlanItems.position))
      .all();
    async function reorder(ordered: typeof items) {
      // Move into a disjoint positive range first, preserving UNIQUE(plan, position).
      const offset = Math.max(0, ...items.map((i) => i.position)) + 1;
      for (let i = 0; i < ordered.length; i++)
        await tx
          .update(schema.studyPlanItems)
          .set({ position: offset + i })
          .where(eq(schema.studyPlanItems.id, ordered[i].id))
          .run();
      for (let i = 0; i < ordered.length; i++)
        await tx
          .update(schema.studyPlanItems)
          .set({ position: i, updatedAt: now })
          .where(eq(schema.studyPlanItems.id, ordered[i].id))
          .run();
    }
    if (action.type === "deletePlan") {
      await tx
        .delete(schema.studyPlanItems)
        .where(eq(schema.studyPlanItems.planId, planId))
        .run();
      await tx
        .delete(schema.studyPlans)
        .where(eq(schema.studyPlans.id, planId))
        .run();
      return;
    }
    if (action.type === "renamePlan")
      await tx
        .update(schema.studyPlans)
        .set({ name: action.name, updatedAt: now })
        .where(eq(schema.studyPlans.id, planId))
        .run();
    if (
      action.type === "addReadingPlanItem" ||
      action.type === "addListeningPlanItem"
    ) {
      const reading = action.type === "addReadingPlanItem";
      if (plan.type !== (reading ? "READING" : "LISTENING"))
        throw new UserFacingError("계획과 자료의 학습 유형이 달라요.");
      const article = reading
        ? (
            await tx
              .select()
              .from(schema.snapshots)
              .where(eq(schema.snapshots.id, action.articleId))
              .get()
          )?.payload
        : null;
      if (reading && (!article || article.provider !== "simple_wikipedia"))
        throw new UserFacingError(
          "Simple English Wikipedia 자료를 먼저 불러와 주세요.",
        );
      const sourceUrl = reading
        ? article!.sourceUrl
        : validateBneUrl(action.sourceUrl);
      const title = reading ? article!.title : action.title;
      const old = await tx
        .select()
        .from(schema.studyPlanItems)
        .where(eq(schema.studyPlanItems.id, action.requestId))
        .get();
      if (old) {
        if (
          old.planId !== planId ||
          old.articleId !== (article?.id ?? null) ||
          old.title !== title ||
          old.sourceUrl !== sourceUrl ||
          old.level !== (reading ? null : action.level)
        )
          throw new UserFacingError(
            "이미 사용한 요청이에요. 새로고침해 주세요.",
          );
        return old.id;
      }
      await tx
        .insert(schema.studyPlanItems)
        .values({
          id: action.requestId,
          planId,
          position: items.length ? items[items.length - 1].position + 1 : 0,
          title,
          sourceType: reading ? "WIKIPEDIA" : "BREAKING_NEWS_ENGLISH",
          sourceUrl,
          articleId: article?.id ?? null,
          level: reading ? null : action.level,
          sessionId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      await tx
        .update(schema.studyPlans)
        .set({ updatedAt: now })
        .where(eq(schema.studyPlans.id, planId))
        .run();
      return action.requestId;
    }
    if (action.type === "deletePlanItem") {
      await tx
        .delete(schema.studyPlanItems)
        .where(eq(schema.studyPlanItems.id, item!.id))
        .run();
      await reorder(items.filter((i) => i.id !== item!.id));
      // Snapshots are shared catalog records; deleting a plan never erases study data.
    }
    if (action.type === "movePlanItem") {
      const from = items.findIndex((i) => i.id === item!.id);
      const to = from + (action.direction === "up" ? -1 : 1);
      if (to >= 0 && to < items.length) {
        [items[from], items[to]] = [items[to], items[from]];
        await reorder(items);
      }
    }
    if (action.type === "startPlanItem") {
      if (item!.sessionId) return item!.sessionId;
      // Existing creation logic runs inside this same transaction/connection.
      const result = await startSession(
        plan.type === "READING"
          ? { type: "start", articleId: item!.articleId! }
          : {
              type: "startListening",
              sourceUrl: item!.sourceUrl,
              userProvidedTitle: item!.title,
              level: item!.level as
                "0" | "1" | "2" | "3" | "4" | "5" | "6" | "other",
            },
      );
      if (!result.id) throw new UserFacingError("학습을 시작하지 못했어요.");
      await tx
        .update(schema.studyPlanItems)
        .set({ sessionId: result.id, updatedAt: now })
        .where(eq(schema.studyPlanItems.id, item!.id))
        .run();
      return result.id;
    }
    await tx
      .update(schema.studyPlans)
      .set({ updatedAt: now })
      .where(eq(schema.studyPlans.id, planId))
      .run();
  });
}

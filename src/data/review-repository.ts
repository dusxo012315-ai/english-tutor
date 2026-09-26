import { UserFacingError } from "@/domain/errors";
import type { AsyncDatabase } from "./connection";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { Action } from "@/domain/schemas";
import type { AppState } from "@/domain/types";
import {
  reviewActionSchema,
  type ReviewAction,
  type ReviewEvent,
} from "@/domain/review/review-types";
import { reviewService } from "@/domain/review/review-service";
export const isReviewAction = (a: Action): a is ReviewAction =>
  a.type === "recordReview" || a.type === "markSessionReview";
export async function recordReview(
  db: AsyncDatabase,
  input: ReviewAction,
  state: AppState,
  now = new Date(),
) {
  const a = reviewActionSchema.parse(input);
  return await db.transaction(async (tx) => {
    if (a.type === "markSessionReview") {
      const session = (
        await tx
          .select()
          .from(schema.learningSessions)
          .where(eq(schema.learningSessions.id, a.sessionId))
          .get()
      )?.payload;
      if (!session) throw new UserFacingError("학습 세션을 찾을 수 없어요.");
      await tx
        .update(schema.learningSessions)
        .set({ payload: { ...session, needReview: a.needReview } })
        .where(eq(schema.learningSessions.id, a.sessionId))
        .run();
      return session.id;
    }
    const existing = (
      await tx
        .select()
        .from(schema.reviewEvents)
        .where(eq(schema.reviewEvents.id, a.requestId))
        .get()
    )?.payload;
    if (existing) {
      if (
        existing.sourceReference !== a.sourceReference ||
        existing.action !== a.action
      )
        throw new UserFacingError("이미 사용한 요청 ID입니다.");
      return existing.id;
    }
    const item = reviewService(state, now).all.find(
      (i) => i.key === a.sourceReference,
    );
    if (!item)
      throw new UserFacingError(
        "추천 근거를 찾을 수 없어요. 새로고침해 주세요.",
      );
    if (
      a.candidateId &&
      !state.ankiCandidates.some((c) => c.id === a.candidateId)
    )
      throw new UserFacingError("Anki Candidate를 찾을 수 없어요.");
    const event: ReviewEvent = {
      id: a.requestId,
      createdAt: now.toISOString(),
      sourceReference: item.key,
      itemType: item.itemType,
      action: a.action,
      userUnderstandingBefore: item.understandingBefore,
      userUnderstandingAfter: a.userUnderstandingAfter,
      note: a.note,
      dismissal: a.dismissal,
      candidateId: a.candidateId,
    };
    await tx
      .insert(schema.reviewEvents)
      .values({ id: event.id, payload: event })
      .run();
    return event.id;
  });
}

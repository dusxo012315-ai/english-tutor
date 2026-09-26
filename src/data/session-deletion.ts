import { eq, inArray } from "drizzle-orm";
import { actionSchema, type Action } from "@/domain/schemas";
import { UserFacingError } from "@/domain/errors";
import { expressionKey } from "@/domain/review/review-service";
import { AnkiRepository } from "./anki-repository";
import type { AsyncDatabase } from "./connection";
import * as schema from "./schema";

/** Delete one aggregate; shared sources and independent Anki material survive. */
export async function deleteLearningSession(
  db: AsyncDatabase,
  input: Extract<Action, { type: "deleteLearningSession" }>,
) {
  const action = actionSchema.parse(input);
  if (action.type !== "deleteLearningSession")
    throw new UserFacingError("지원하지 않는 삭제 요청입니다.");
  await db.transaction(async (tx) => {
    const session = await tx
      .select()
      .from(schema.learningSessions)
      .where(eq(schema.learningSessions.id, action.sessionId))
      .get();
    if (!session)
      throw new UserFacingError(
        "이미 삭제되었거나 찾을 수 없는 학습 기록이에요.",
      );
    if (session.type !== action.sessionType)
      throw new UserFacingError(
        "학습 종류가 일치하지 않아요. 최신 기록을 확인해 주세요.",
      );
    const id = session.id;
    const items = await tx
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, id))
      .all();
    const itemIds = items.map((i) => i.id);
    const cards = itemIds.length
      ? await tx
          .select()
          .from(schema.cards)
          .where(inArray(schema.cards.itemId, itemIds))
          .all()
      : [];
    const cardIds = cards.map((c) => c.id);

    // Legacy cards have a mandatory item FK. Preserve their exact front/back,
    // status and attribution in the existing common card model before deletion.
    await new AnkiRepository(tx).backfill(cardIds, true);
    const now = new Date().toISOString();
    for (const row of await tx.select().from(schema.ankiCandidates).all()) {
      const c = row.payload;
      const detach = row.sessionId === id || c.sourceSessionId === id;
      const legacy = !!c.legacyCardId && cardIds.includes(c.legacyCardId);
      if (!detach && !legacy) continue;
      await tx
        .update(schema.ankiCandidates)
        .set({
          sessionId: detach ? null : row.sessionId,
          payload: {
            ...c,
            sourceSessionId: detach ? null : c.sourceSessionId,
            ...(legacy
              ? {
                  legacyCardId: undefined,
                  legacyVersion: undefined,
                  legacyManaged: false,
                }
              : {}),
            updatedAt: now,
            version: c.version + 1,
          },
        })
        .where(eq(schema.ankiCandidates.id, row.id))
        .run();
    }

    const interactions = await tx
      .select()
      .from(schema.companionInteractions)
      .all();
    const listening = await tx.select().from(schema.listeningDetails).all();
    const affectedKeys = new Set<string>([
      `session:${id}`,
      ...interactions
        .filter((r) => r.sessionId === id && r.payload.selectedText?.trim())
        .map((r) => expressionKey(r.payload.selectedText!)),
      ...listening
        .filter((r) => r.sessionId === id)
        .flatMap((r) => r.payload.round2?.difficultyReasons ?? [])
        .map((reason) => `difficulty:${reason}`),
    ]);
    // Expression/difficulty events refer to shared topics, not session IDs.
    // Retain them if any remaining session/card supports the topic, even if old.
    const remainingKeys = new Set<string>([
      ...interactions
        .filter((r) => r.sessionId !== id && r.payload.selectedText?.trim())
        .map((r) => expressionKey(r.payload.selectedText!)),
      ...listening
        .filter((r) => r.sessionId !== id)
        .flatMap((r) => r.payload.round2?.difficultyReasons ?? [])
        .map((reason) => `difficulty:${reason}`),
      ...(await tx.select().from(schema.ankiCandidates).all()).map((r) =>
        expressionKey(r.payload.expression),
      ),
    ]);
    for (const row of await tx.select().from(schema.reviewEvents).all()) {
      const key = row.payload.sourceReference;
      if (affectedKeys.has(key) && !remainingKeys.has(key))
        await tx
          .delete(schema.reviewEvents)
          .where(eq(schema.reviewEvents.id, row.id))
          .run();
    }
    // Explicit child-before-parent order; every step is in the same transaction.
    await tx
      .delete(schema.companionInteractions)
      .where(eq(schema.companionInteractions.sessionId, id))
      .run();
    await tx
      .delete(schema.learnedExpressions)
      .where(eq(schema.learnedExpressions.sessionId, id))
      .run();
    await tx
      .delete(schema.listeningDetails)
      .where(eq(schema.listeningDetails.sessionId, id))
      .run();
    if (cardIds.length)
      await tx
        .delete(schema.cards)
        .where(inArray(schema.cards.id, cardIds))
        .run();
    await tx.delete(schema.items).where(eq(schema.items.sessionId, id)).run();
    await tx.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
    await tx
      .delete(schema.learningSessions)
      .where(eq(schema.learningSessions.id, id))
      .run();
    // snapshots and export payloads are shared/immutable historical snapshots,
    // not live session FKs. Do not erase them or change previously exported TSVs.
  });
}

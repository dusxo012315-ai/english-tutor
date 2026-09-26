import { UserFacingError } from "@/domain/errors";
import type { AsyncDatabase } from "./connection";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import {
  ankiActionSchema,
  defaultDecks,
  emptyCandidateFields,
  findDuplicates,
  transitionCandidate,
  candidateTsv,
  type AnkiAction,
  type AnkiCandidate,
  type CandidateExport,
} from "@/domain/anki";
import type { Action } from "@/domain/schemas";
export const isAnkiAction = (a: Action): a is AnkiAction =>
  [
    "createCandidate",
    "updateCandidate",
    "exportCandidates",
    "deckPresets",
  ].includes(a.type);
export type AnkiResult = {
  id?: string;
  tsv?: string;
  filename?: string;
  duplicateIds?: string[];
};
export class AnkiRepository {
  constructor(private db: AsyncDatabase) {}
  async backfill() {
    await this.db.transaction(async (tx) => {
      const candidates = new Map(
        (await tx.select().from(schema.ankiCandidates).all()).map((r) => [
          r.id,
          r.payload,
        ]),
      );
      const sessions = new Map(
        (await tx.select().from(schema.learningSessions).all()).map((r) => [
          r.id,
          r.payload,
        ]),
      );
      const items = new Map(
        (await tx.select().from(schema.items).all()).map((r) => [
          r.id,
          r.payload,
        ]),
      );
      await tx
        .insert(schema.ankiSettings)
        .values({ id: "local", payload: { decks: defaultDecks } })
        .onConflictDoNothing()
        .run();
      for (const row of await tx.select().from(schema.cards).all()) {
        const c = row.payload;
        const id = `legacy:${c.id}`;
        const existing = await candidates.get(id);
        if (
          existing &&
          (!existing.legacyManaged ||
            (existing.legacyVersion === c.version &&
              existing.exportedAt === c.exportedAt &&
              existing.blocked === c.blocked &&
              (existing.status === "READY") ===
                (c.status === "confirmed" && !c.exportedAt && !c.blocked)))
        )
          continue;
        const session = await sessions.get(c.sessionId);
        const item = await items.get(c.itemId);
        const now = new Date().toISOString();
        const candidate: AnkiCandidate = {
          ...emptyCandidateFields(),
          id,
          createdAt:
            existing?.createdAt ?? item?.createdAt ?? session?.startedAt ?? now,
          updatedAt: now,
          sourceSessionId: session?.id ?? null,
          sourceType: session?.type ?? "MANUAL",
          sourceTitle: session?.userProvidedTitle ?? "기존 카드",
          sourceUrl: session?.sourceUrl ?? "",
          expression: c.expression || c.front || "기존 카드",
          meaning: c.meaning ?? "",
          frontOverride: c.front ?? "",
          backOverride: c.back ?? "",
          cardType: "CUSTOM",
          status: c.blocked
            ? "CANDIDATE"
            : c.exportedAt
              ? "EXPORTED"
              : c.status === "confirmed"
                ? "READY"
                : "CANDIDATE",
          exportedAt: c.exportedAt ?? null,
          version: (existing?.version ?? 0) + 1,
          attribution: c.attribution ?? "",
          legacyCardId: c.id,
          legacyVersion: c.version,
          legacyManaged: true,
          blocked: c.blocked ?? false,
        };
        await tx
          .insert(schema.ankiCandidates)
          .values({
            id,
            sessionId: candidate.sourceSessionId,
            payload: candidate,
          })
          .onConflictDoUpdate({
            target: schema.ankiCandidates.id,
            set: { payload: candidate },
          })
          .run();
      }
    });
  }
  async read() {
    return {
      ankiCandidates: (await this.db.select().from(schema.ankiCandidates).all())
        .map((r) => r.payload)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      candidateExports: (
        await this.db.select().from(schema.candidateExports).all()
      )
        .map((r) => r.payload)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      deckPresets:
        (await this.db.select().from(schema.ankiSettings).get())?.payload
          .decks ?? defaultDecks,
    };
  }
  async execute(input: AnkiAction): Promise<AnkiResult> {
    const action = ankiActionSchema.parse(input);
    return await this.db.transaction(async (tx) => {
      const all = async () =>
        (await tx.select().from(schema.ankiCandidates).all()).map(
          (r) => r.payload,
        );
      const put = async (c: AnkiCandidate) =>
        await tx
          .insert(schema.ankiCandidates)
          .values({ id: c.id, sessionId: c.sourceSessionId, payload: c })
          .onConflictDoUpdate({
            target: schema.ankiCandidates.id,
            set: { payload: c },
          })
          .run();
      const now = new Date().toISOString();
      if (action.type === "deckPresets") {
        await tx
          .insert(schema.ankiSettings)
          .values({
            id: "local",
            payload: { decks: [...new Set(action.decks)] },
          })
          .onConflictDoUpdate({
            target: schema.ankiSettings.id,
            set: { payload: { decks: [...new Set(action.decks)] } },
          })
          .run();
        return {};
      }
      if (action.type === "createCandidate") {
        const already = (await all()).find((c) => c.id === action.requestId);
        if (already) return { id: already.id };
        const duplicates = findDuplicates(
          await all(),
          action.fields.expression,
        );
        if (duplicates.length && !action.allowDuplicate)
          return { duplicateIds: duplicates.map((c) => c.id) };
        const session = action.sessionId
          ? (
              await tx
                .select()
                .from(schema.learningSessions)
                .where(eq(schema.learningSessions.id, action.sessionId))
                .get()
            )?.payload
          : undefined;
        if (action.sessionId && !session)
          throw new UserFacingError("출처 세션을 찾을 수 없어요.");
        let attribution = "";
        if (session?.type === "READING") {
          const legacy = (
            await tx
              .select()
              .from(schema.sessions)
              .where(eq(schema.sessions.id, session.id))
              .get()
          )?.payload;
          const article = legacy
            ? (
                await tx
                  .select()
                  .from(schema.snapshots)
                  .where(eq(schema.snapshots.id, legacy.articleId))
                  .get()
              )?.payload
            : undefined;
          if (article?.attribution) {
            const a = article.attribution;
            attribution = [
              article.title,
              article.sourceUrl,
              a.creatorLabel,
              a.historyUrl,
              a.revisionUrl,
              `${a.licenseName} ${a.licenseUrl}`,
              ...a.extraNotices,
              ...a.changes,
            ].join("\n");
          }
        }
        const c: AnkiCandidate = {
          ...action.fields,
          id: action.requestId,
          createdAt: now,
          updatedAt: now,
          sourceSessionId: session?.id ?? null,
          sourceType: session?.type ?? "MANUAL",
          status: "CANDIDATE",
          exportedAt: null,
          version: 1,
          attribution,
        };
        await put(c);
        return { id: c.id };
      }
      if (action.type === "updateCandidate") {
        const old = (await all()).find((c) => c.id === action.candidateId);
        if (!old) throw new UserFacingError("카드를 찾을 수 없어요.");
        if (old.version !== action.expectedVersion)
          throw new UserFacingError(
            "다른 화면에서 변경됐어요. 편집기를 닫고 다시 열어 주세요.",
          );
        const duplicates = findDuplicates(
          await all(),
          action.fields.expression,
          old.id,
        );
        if (duplicates.length && !action.allowDuplicate)
          return { duplicateIds: duplicates.map((c) => c.id) };
        const c = transitionCandidate(
          { ...old, ...action.fields, legacyManaged: false, blocked: false },
          action.status,
          now,
        );
        await put(c);
        return { id: c.id };
      }
      const prior = (
        await tx
          .select()
          .from(schema.candidateExports)
          .where(eq(schema.candidateExports.id, action.requestId))
          .get()
      )?.payload;
      if (prior)
        return { id: prior.id, tsv: prior.tsv, filename: prior.filename };
      const ids = action.candidates.map((c) => c.id);
      if (new Set(ids).size !== ids.length)
        throw new UserFacingError("중복 선택을 제거해 주세요.");
      const selected = await Promise.all(
        action.candidates.map(async (s) => {
          const c = (await all()).find((c) => c.id === s.id);
          if (!c || c.version !== s.version)
            throw new UserFacingError(
              "선택한 카드가 변경됐어요. 다시 선택해 주세요.",
            );
          return c;
        }),
      );
      if (selected.some((c) => !!c.exportedAt) && !action.allowReexport)
        throw new UserFacingError(
          "This card has already been exported and may create a duplicate in Anki.",
        );
      const tsv = candidateTsv(selected);
      const filename = `anki-${now.replace(/[:.]/g, "-")}-${action.requestId.slice(0, 8)}.tsv`;
      const batch: CandidateExport = {
        id: action.requestId,
        createdAt: now,
        filename,
        count: selected.length,
        targetDeck: selected[0].targetDeck,
        candidateIds: ids,
        snapshots: selected,
        tsv,
      };
      await tx
        .insert(schema.candidateExports)
        .values({ id: batch.id, payload: batch })
        .run();
      await Promise.all(
        selected.map((c) =>
          put({
            ...transitionCandidate(c, "EXPORTED", now),
            legacyManaged: false,
          }),
        ),
      );
      return { id: batch.id, tsv, filename };
    });
  }
}

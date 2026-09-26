import { UserFacingError } from "@/domain/errors";
import { z } from "zod";
import { htmlText } from "./tsv";
export const cardTypes = [
  "VOCABULARY",
  "EXPRESSION",
  "SENTENCE",
  "GRAMMAR",
  "IRREGULAR_VERB",
  "CUSTOM",
] as const;
export type CardType = (typeof cardTypes)[number];
export type CandidateStatus = "CANDIDATE" | "READY" | "EXPORTED" | "ARCHIVED";
export const defaultDecks = [
  "English::General Vocabulary",
  "English::Example Sentences",
  "English::Irregular Verbs",
  "English::This Week",
];
export const candidateExpression = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (v) => !/[\r\n]/.test(v) && v.split(/\s+/).length <= 10,
    "80자·10단어 이내의 짧은 표현을 입력해 주세요.",
  );
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\r\n\t\x00-\x1f]/.test(v), "한 줄로 입력해 주세요.");
export const candidateFields = z
  .object({
    expression: candidateExpression,
    meaning: z.string().max(1000),
    explanation: z.string().max(2000),
    exampleSentence: z.string().max(500),
    userNote: z.string().max(1000),
    cardType: z.enum(cardTypes),
    targetDeck: line(120).min(1),
    tags: z
      .array(
        line(60)
          .min(1)
          .refine((v) => !/[\s]/.test(v), "태그의 공백은 밑줄로 바꿔 주세요."),
      )
      .max(20),
    sourceTitle: line(200),
    sourceUrl: z
      .string()
      .max(2048)
      .refine((v) => {
        try {
          return !v || ["https:", "http:"].includes(new URL(v).protocol);
        } catch {
          return false;
        }
      }, "올바른 HTTP(S) 출처 URL을 입력하세요."),
    frontOverride: z.string().max(4000).nullable(),
    backOverride: z.string().max(6000).nullable(),
  })
  .strict();
export type CandidateFields = z.infer<typeof candidateFields>;
export interface AnkiCandidate extends CandidateFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceSessionId: string | null;
  sourceType: "READING" | "LISTENING" | "MANUAL";
  status: CandidateStatus;
  exportedAt: string | null;
  version: number;
  attribution: string;
  legacyCardId?: string;
  legacyVersion?: number;
  legacyManaged?: boolean;
  blocked?: boolean;
}
export interface CandidateExport {
  id: string;
  createdAt: string;
  filename: string;
  count: number;
  targetDeck: string;
  candidateIds: string[];
  snapshots: AnkiCandidate[];
  tsv: string;
}
export function normalizeExpression(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function findDuplicates(
  cards: AnkiCandidate[],
  expression: string,
  excludeId?: string,
) {
  return cards.filter(
    (c) =>
      c.id !== excludeId &&
      normalizeExpression(c.expression) === normalizeExpression(expression),
  );
}
export const cardTemplates: Record<
  "VOCABULARY" | "SENTENCE",
  (c: CandidateFields) => { front: string; back: string }
> = {
  VOCABULARY: (c) => ({
    front: c.expression,
    back: [
      c.meaning,
      c.explanation,
      c.exampleSentence && `Example:\n${c.exampleSentence}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }),
  SENTENCE: (c) => ({
    front: c.exampleSentence,
    back: [
      c.meaning,
      `Key expression:\n${c.expression}`,
      c.explanation && `Explanation:\n${c.explanation}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }),
};
export function renderCandidate(c: CandidateFields & { attribution?: string }) {
  const template =
    cardTemplates[c.cardType === "SENTENCE" ? "SENTENCE" : "VOCABULARY"](c);
  return {
    front: c.frontOverride ?? template.front,
    back: [
      c.backOverride ?? template.back,
      c.userNote && `My note:\n${c.userNote}`,
      c.attribution || [c.sourceTitle, c.sourceUrl].filter(Boolean).join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
export function assertReady(c: AnkiCandidate) {
  const rendered = renderCandidate(c);
  if (
    c.blocked ||
    !rendered.front.trim() ||
    !(c.backOverride?.trim() || c.meaning.trim() || c.explanation.trim())
  )
    throw new UserFacingError(
      "앞면과 뜻 또는 설명을 입력하고 검토를 완료해 주세요.",
    );
  if (
    c.cardType === "SENTENCE" &&
    !c.frontOverride &&
    !c.exampleSentence.trim()
  )
    throw new UserFacingError("Sentence 카드에는 직접 작성한 예문이 필요해요.");
}
export function transitionCandidate(
  c: AnkiCandidate,
  status: CandidateStatus,
  now = new Date().toISOString(),
) {
  if (status === "EXPORTED" && !["READY", "EXPORTED"].includes(c.status))
    throw new UserFacingError("Ready 상태의 카드만 내보낼 수 있어요.");
  if (status === "READY" || status === "EXPORTED") assertReady(c);
  return {
    ...c,
    status,
    updatedAt: now,
    exportedAt: status === "EXPORTED" ? now : c.exportedAt,
    version: c.version + 1,
  };
}
export function candidateTsv(cards: AnkiCandidate[]) {
  if (
    !cards.length ||
    cards.some((c) => !["READY", "EXPORTED"].includes(c.status))
  )
    throw new UserFacingError("Ready 또는 Exported 카드를 선택하세요.");
  if (new Set(cards.map((c) => c.targetDeck)).size !== 1)
    throw new UserFacingError("한 번에 하나의 target deck만 내보내세요.");
  return (
    [
      "#separator:Tab",
      "#html:true",
      "#columns:Front\tBack\tTags",
      "#tags column:3",
      ...cards.map((c) => {
        assertReady(c);
        const r = renderCandidate(c);
        return [htmlText(r.front), htmlText(r.back), htmlText(c.tags.join(" "))]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join("\t");
      }),
    ].join("\n") + "\n"
  );
}
const id = z.string().min(1).max(100);
export const ankiActions = [
  z
    .object({
      type: z.literal("createCandidate"),
      requestId: z.string().uuid(),
      sessionId: id.nullable(),
      fields: candidateFields,
      allowDuplicate: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("updateCandidate"),
      candidateId: id,
      expectedVersion: z.number().int().positive(),
      fields: candidateFields,
      status: z.enum(["CANDIDATE", "READY", "ARCHIVED"]),
      allowDuplicate: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("exportCandidates"),
      requestId: z.string().uuid(),
      candidates: z
        .array(z.object({ id, version: z.number().int().positive() }).strict())
        .min(1)
        .max(200),
      allowReexport: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("deckPresets"),
      decks: z.array(line(120).min(1)).min(1).max(20),
    })
    .strict(),
] as const;
export const ankiActionSchema = z.discriminatedUnion("type", ankiActions);
export type AnkiAction = z.infer<typeof ankiActionSchema>;
export function emptyCandidateFields(): CandidateFields {
  return {
    expression: "",
    meaning: "",
    explanation: "",
    exampleSentence: "",
    userNote: "",
    cardType: "EXPRESSION",
    targetDeck: defaultDecks[0],
    tags: [],
    sourceTitle: "",
    sourceUrl: "",
    frontOverride: null,
    backOverride: null,
  };
}

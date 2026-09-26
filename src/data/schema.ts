import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ReviewEvent } from "@/domain/review/review-types";
export const reviewEvents = sqliteTable("review_events", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<ReviewEvent>().notNull(),
});
import type { AnkiCandidate, CandidateExport } from "@/domain/anki";
export const ankiCandidates = sqliteTable("anki_candidates", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => learningSessions.id),
  payload: text("payload", { mode: "json" }).$type<AnkiCandidate>().notNull(),
});
export const candidateExports = sqliteTable("candidate_exports", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<CandidateExport>().notNull(),
});
export const ankiSettings = sqliteTable("anki_settings", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" })
    .$type<{ decks: string[] }>()
    .notNull(),
});
import type { Article, Card, LearningItem, Session } from "@/domain/types";
import type {
  LearningSession,
  ListeningDetails,
  CompanionInteraction,
  LearnedExpression,
} from "@/domain/learning";
export const learningSessions = sqliteTable("learning_sessions", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["READING", "LISTENING"] }).notNull(),
  payload: text("payload", { mode: "json" }).$type<LearningSession>().notNull(),
});
export const listeningDetails = sqliteTable("listening_details", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => learningSessions.id),
  payload: text("payload", { mode: "json" })
    .$type<ListeningDetails>()
    .notNull(),
});
export const companionInteractions = sqliteTable("companion_interactions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => learningSessions.id),
  payload: text("payload", { mode: "json" })
    .$type<CompanionInteraction>()
    .notNull(),
});
export const learnedExpressions = sqliteTable("learned_expressions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => learningSessions.id),
  payload: text("payload", { mode: "json" })
    .$type<LearnedExpression>()
    .notNull(),
});
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<Article>().notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  articleId: text("article_id")
    .notNull()
    .references(() => snapshots.id),
  payload: text("payload", { mode: "json" }).$type<Session>().notNull(),
});
export const items = sqliteTable("learning_items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  payload: text("payload", { mode: "json" }).$type<LearningItem>().notNull(),
});
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id),
  payload: text("payload", { mode: "json" }).$type<Card>().notNull(),
});
export const preferences = sqliteTable("preferences", {
  id: text("id").primaryKey(),
  fontSize: integer("font_size").notNull(),
});
export const exportsTable = sqliteTable("export_batches", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  payload: text("payload", { mode: "json" }).$type<Card[]>().notNull(),
});

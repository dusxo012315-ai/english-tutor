import {
  sqliteTable,
  text,
  integer,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
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

export const studyPlans = sqliteTable(
  "study_plans",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["READING", "LISTENING"] }).notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    check("plan_type", sql`${t.type} IN ('READING', 'LISTENING')`),
    index("plan_type_created").on(t.type, t.createdAt),
  ],
);
export const studyPlanItems = sqliteTable(
  "study_plan_items",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlans.id),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type", {
      enum: ["WIKIPEDIA", "BREAKING_NEWS_ENGLISH"],
    }).notNull(),
    sourceUrl: text("source_url").notNull(),
    level: text("level"),
    articleId: text("article_id").references(() => snapshots.id),
    sessionId: text("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("plan_item_position").on(t.planId, t.position),
    uniqueIndex("plan_item_session").on(t.sessionId),
    index("plan_item_article").on(t.articleId),
    check("plan_item_position_positive", sql`${t.position} >= 0`),
    check(
      "plan_item_source",
      sql`(${t.sourceType} = 'WIKIPEDIA' AND ${t.articleId} IS NOT NULL AND ${t.level} IS NULL) OR (${t.sourceType} = 'BREAKING_NEWS_ENGLISH' AND ${t.articleId} IS NULL AND ${t.level} IS NOT NULL AND ${t.level} IN ('0','1','2','3','4','5','6','other'))`,
    ),
  ],
);

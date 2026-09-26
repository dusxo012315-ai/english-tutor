export type QuestionType = "meaning" | "grammar" | "usage" | "custom";
export type Step = "guess" | "explanation" | "quiz";
export interface Article {
  id: string;
  title: string;
  topic: string;
  description: string;
  sourceUrl: string;
  notice: string;
  blocks: {
    id: string;
    heading: string;
    text: string;
    kind?: "paragraph" | "list_item";
  }[];
  provider?: "simple_wikipedia" | "mock";
  pageId?: number;
  revisionId?: number;
  fetchedAt?: string;
  revisionTimestamp?: string;
  extractorVersion?: string;
  attribution?: SourceAttribution;
  omissions?: string[];
}
export interface SourceAttribution {
  creatorLabel: string;
  historyUrl: string;
  revisionUrl: string;
  licenseName: string;
  licenseUrl: string;
  extraNotices: string[];
  changes: string[];
}
export interface TutorContext {
  source: {
    snapshotId: string;
    title: string;
    url: string;
    provider: "simple_wikipedia" | "mock";
    pageId?: number;
    revisionId?: number;
  };
  selection: { blockId: string; start: number; end: number; quote: string };
  context: { blockId: string; text: string; start: number; end: number }[];
  contextTruncated: boolean;
}
export interface Answer {
  translationKo: string;
  explanationKo: string;
  expression: string;
  meaning: string;
  chunks: { text: string; role: string }[];
  examples: { en: string; ko: string }[];
  feedback: string;
  provider: "mock" | "openai";
  directAnswerKo?: string;
  vocabulary?: { expression: string; meaning: string }[];
}
export interface Quiz {
  prompt: string;
  options: { id: "a" | "b" | "c"; text: string }[];
  correctId: "a" | "b" | "c";
  explanation: string;
}
export interface Attempt {
  id: string;
  selectedId: string | null;
  correct: boolean;
  createdAt: string;
}
export interface LearningItem {
  companion?: import("./tutor-provider").CompanionDraft;
  tutorPending?: { token: string; until: number };
  tutorContext?: TutorContext;
  id: string;
  sessionId: string;
  blockId: string;
  start: number;
  end: number;
  quote: string;
  questionType: QuestionType;
  question: string;
  guess: string;
  submittedGuess: string | null;
  unknown: boolean;
  step: Step;
  answer: Answer | null;
  quiz: Quiz | null;
  attempts: Attempt[];
  production: string;
  productionSaved: boolean;
  needsReview: boolean;
  followups: {
    question: string;
    reply: string;
    supplementaryKo?: string;
    requestId?: string;
  }[];
  createdAt: string;
}
export interface Session {
  id: string;
  articleId: string;
  status: "in_progress" | "completed";
  createdAt: string;
  updatedAt: string;
  activeItemId: string | null;
  cursor: string;
  pane: "read" | "tutor";
}
export interface Card {
  id: string;
  itemId: string;
  sessionId: string;
  expression: string;
  meaning: string;
  front: string;
  back: string;
  direction: "recognition" | "production";
  status: "draft" | "confirmed";
  blocked: boolean;
  version: number;
  exportedAt: string | null;
  attribution: string;
}
export interface AppState {
  reviewEvents: import("./review/review-types").ReviewEvent[];
  ankiCandidates: import("./anki").AnkiCandidate[];
  candidateExports: import("./anki").CandidateExport[];
  deckPresets: string[];
  learningSessions: import("./learning").LearningSession[];
  listeningDetails: import("./learning").ListeningDetails[];
  companionInteractions: import("./learning").CompanionInteraction[];
  learnedExpressions: import("./learning").LearnedExpression[];
  tutor?: { mode: "mock" | "openai" | "companion"; configured: boolean };
  mode: "mock";
  schemaVersion: 4;
  articles: Article[];
  sessions: Session[];
  items: LearningItem[];
  cards: Card[];
  fontSize: number;
}
export interface MaterialProvider {
  resolve(input: string): Article | Article[] | Promise<Article | Article[]>;
}
export interface TutorAdapter {
  explain(item: LearningItem): Answer;
  quiz(item: LearningItem): Quiz;
  followup(item: LearningItem, question: string): string;
}

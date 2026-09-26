export const REVIEW_RULES = {
  windowDays: 30,
  limit: 6,
  recentDays: 7,
  repeatQuestions: 2,
  repeatDifficulty: 2,
  lowFirst: 40,
  lowFinal: 65,
  weights: {
    lowUnderstanding: 3,
    userMarked: 3,
    repeatedQuestion: 2,
    repeatedDifficulty: 2,
    lowFirst: 2,
    lowFinal: 2,
    incomplete: 1,
    unfinishedAnki: 1,
    recent: 1,
  },
} as const;
export type ReviewReasonCode = keyof typeof REVIEW_RULES.weights;
export const priorityScore = (codes: ReviewReasonCode[]) =>
  [...new Set(codes)].reduce((n, c) => n + REVIEW_RULES.weights[c], 0);
export function understandingValue(
  value: "NOT_YET" | "PARTLY" | "UNDERSTOOD" | null,
) {
  return value === null
    ? null
    : { NOT_YET: 1, PARTLY: 2, UNDERSTOOD: 5 }[value];
}
export const seoulDay = (date: Date | string) =>
  new Date(new Date(date).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export function weekStart(now: Date) {
  const d = new Date(now.getTime() + 9 * 3600000);
  return (
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - ((d.getUTCDay() + 6) % 7),
    ) -
    9 * 3600000
  );
}

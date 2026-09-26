"use client";
import Link from "next/link";
import { useStore } from "@/components/provider";
export const stageLabels = {
  ROUND1: "Round 1 — First Listening",
  ROUND2: "Round 2 — Script Check",
  ROUND3: "Round 3 — Listen Again",
  FINAL: "Final Recall",
  REFLECTION: "Completed",
};
export function ContinueLearning() {
  const { state } = useStore();
  if (!state) return null;
  const sessions = state.learningSessions
    .filter((s) => !s.completedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!sessions.length) return null;
  return (
    <section
      className="home-section continue-learning"
      aria-label="Continue Learning"
    >
      <h2>Continue Learning</h2>
      <div className="review-grid">
        {sessions.slice(0, 4).map((s) => (
          <article className="learning-card" key={s.id}>
            <span className="badge">
              Continue {s.type === "READING" ? "Reading" : "Listening"}
            </span>
            <h3>{s.userProvidedTitle}</h3>
            <p>
              {s.type === "READING"
                ? "Simple English Wikipedia"
                : `Breaking News English · ${stageLabels[state.listeningDetails.find((d) => d.sessionId === s.id)?.stage ?? "ROUND1"]}`}
            </p>
            <Link
              className="button primary"
              href={
                s.type === "READING" ? `/learn/${s.id}` : `/listening/${s.id}`
              }
              aria-label={`Continue ${s.userProvidedTitle}`}
            >
              Continue →
            </Link>
          </article>
        ))}
      </div>
      {sessions.length > 4 && (
        <Link href="/history">진행 중인 학습 모두 보기</Link>
      )}
    </section>
  );
}

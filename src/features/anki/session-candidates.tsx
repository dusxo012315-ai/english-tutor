"use client";
import Link from "next/link";
import { useStore } from "@/components/provider";
export function SessionCandidates({ sessionId }: { sessionId: string }) {
  const { state } = useStore();
  const cards =
    state?.ankiCandidates.filter((c) => c.sourceSessionId === sessionId) ?? [];
  const interactions =
    state?.companionInteractions.filter((i) => i.sessionId === sessionId) ?? [];
  return (
    <section className="session-candidates">
      <p>
        Questions {interactions.length} · What I learned{" "}
        {interactions.filter((i) => i.userTakeaway.trim()).length} · Anki cards{" "}
        {cards.length}
      </p>
      <div className="history-expression-grid">
        {cards.map((c) => (
          <Link
            className="expression-card"
            href={`/cards?candidate=${encodeURIComponent(c.id)}`}
            key={c.id}
          >
            <strong>{c.expression}</strong>
            <p>
              {c.status} · {c.cardType}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

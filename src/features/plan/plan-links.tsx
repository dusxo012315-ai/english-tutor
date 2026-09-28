"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/provider";
import { nextPlanItem } from "@/domain/study-plan";
export function NextToStudy() {
  const { state, run, busy } = useStore();
  const router = useRouter();
  if (!state?.studyPlans.length) return null;
  return (
    <section className="learning-card plan-section">
      <h2>Next to Study</h2>
      <Link href="/plan">Open Study Plan →</Link>
      {state.studyPlans.map((plan) => {
        const item = nextPlanItem(
          plan.id,
          state.studyPlanItems,
          state.learningSessions,
        );
        return (
          item && (
            <div className="plan-heading" key={plan.id}>
              <div>
                <p>
                  {plan.name} · {plan.type}
                </p>
                <strong>{item.title}</strong>
              </div>
              <div className="button-row">
                {plan.type === "LISTENING" && (
                  <a
                    className="button"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open BNE ↗
                  </a>
                )}
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const { id } = await run({
                        type: "startPlanItem",
                        itemId: item.id,
                      });
                      router.push(
                        plan.type === "READING"
                          ? `/learn/${id}`
                          : `/listening/${id}`,
                      );
                    } catch {}
                  }}
                >
                  {item.sessionId
                    ? "Continue"
                    : plan.type === "READING"
                      ? "Start Reading"
                      : "Start Listening"}
                </button>
              </div>
            </div>
          )
        );
      })}
    </section>
  );
}
export function SessionPlanLink({ sessionId }: { sessionId: string }) {
  const { state } = useStore();
  const item = state?.studyPlanItems.find((i) => i.sessionId === sessionId);
  const plan = state?.studyPlans.find((p) => p.id === item?.planId);
  return plan ? (
    <Link className="text-button" href={`/plan#plan-${plan.id}`}>
      Study Plan: {plan.name}
    </Link>
  ) : null;
}

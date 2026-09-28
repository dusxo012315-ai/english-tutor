"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import {
  canPrintArticle,
  nextPlanItem,
  planItemStatus,
  type StudyPlan,
} from "@/domain/study-plan";
import type { Action } from "@/domain/schemas";

export function PlanPage() {
  const { state, run, busy, error: storeError } = useStore();
  const router = useRouter();
  const [editor, setEditor] = useState<{
    kind: "create" | "rename" | "add";
    plan?: StudyPlan;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    action: Action;
  } | null>(null);
  const [name, setName] = useState("");
  const [planType, setPlanType] = useState<"READING" | "LISTENING">("READING");
  const [url, setUrl] = useState("");
  const [level, setLevel] = useState<
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "other"
  >("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<
    { title: string; sourceUrl: string }[]
  >([]);
  if (!state) return null;
  function open(kind: "create" | "rename" | "add", plan?: StudyPlan) {
    setName(kind === "rename" ? plan!.name : "");
    setUrl("");
    setError("");
    setChoices([]);
    setEditor({ kind, plan });
  }
  async function resolveReading(input: string) {
    const r = await fetch("/api/articles/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "자료를 불러오지 못했어요.");
    if (data.status === "choose") {
      setChoices(data.candidates);
      if (!data.candidates.length) setError("일치하는 문서가 없어요.");
      return false;
    }
    await run({
      type: "addReadingPlanItem",
      planId: editor!.plan!.id,
      requestId: crypto.randomUUID(),
      articleId: data.article.id,
    });
    return true;
  }
  async function submit(input = url) {
    if (!editor) return;
    setLoading(true);
    setError("");
    try {
      if (editor.kind === "create")
        await run({
          type: "createPlan",
          requestId: crypto.randomUUID(),
          name,
          planType,
        });
      else if (editor.kind === "rename")
        await run({ type: "renamePlan", planId: editor.plan!.id, name });
      else if (editor.plan!.type === "READING") {
        if (!(await resolveReading(input))) return;
      } else
        await run({
          type: "addListeningPlanItem",
          planId: editor.plan!.id,
          requestId: crypto.randomUUID(),
          title: name,
          sourceUrl: url,
          level,
        });
      setEditor(null);
    } catch (e) {
      setError(
        e instanceof Error &&
          e.name !== "TimeoutError" &&
          e.name !== "AbortError"
          ? e.message
          : "응답이 늦어지고 있어요. 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function start(itemId: string, type: StudyPlan["type"]) {
    try {
      const result = await run({ type: "startPlanItem", itemId });
      router.push(
        type === "READING" ? `/learn/${result.id}` : `/listening/${result.id}`,
      );
    } catch {}
  }
  return (
    <div className="page plan-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ONE STEP AT A TIME</div>
          <h1>Study Plan</h1>
          <p>
            읽고 들을 자료를 순서대로 모아 두세요. 학습 기록은 따로 보존됩니다.
          </p>
        </div>
        <button className="button primary" onClick={() => open("create")}>
          New Plan
        </button>
      </div>
      {!state.studyPlans.length && (
        <p className="learning-card">
          아직 계획이 없어요. New Plan으로 Reading 또는 Listening 계획을 만들어
          보세요.
        </p>
      )}
      {state.studyPlans.map((plan) => {
        const items = state.studyPlanItems
          .filter((i) => i.planId === plan.id)
          .sort((a, b) => a.position - b.position);
        const nextId = nextPlanItem(plan.id, items, state.learningSessions)?.id;
        return (
          <section
            className="learning-card plan-section"
            key={plan.id}
            id={`plan-${plan.id}`}
            aria-label={plan.name}
          >
            <div className="plan-heading">
              <div>
                <span className="eyebrow">{plan.type}</span>
                <h2>{plan.name}</h2>
                <p>
                  {
                    items.filter(
                      (i) =>
                        planItemStatus(i, state.learningSessions) ===
                        "COMPLETED",
                    ).length
                  }{" "}
                  / {items.length} completed
                </p>
              </div>
              <div className="button-row">
                <button className="button" onClick={() => open("rename", plan)}>
                  Rename
                </button>
                <button className="button" onClick={() => open("add", plan)}>
                  Add item
                </button>
                <button
                  className="text-button danger"
                  onClick={() =>
                    setConfirm({
                      title: plan.name,
                      action: { type: "deletePlan", planId: plan.id },
                    })
                  }
                >
                  Delete Plan
                </button>
              </div>
            </div>
            {!items.length && (
              <p>자료를 추가하면 여기에서 학습을 시작할 수 있어요.</p>
            )}
            <ol className="plan-items">
              {items.map((item, index) => {
                const status = planItemStatus(item, state.learningSessions);
                const session = state.learningSessions.find(
                  (s) => s.id === item.sessionId,
                );
                const article = state.articles.find(
                  (a) => a.id === item.articleId,
                );
                return (
                  <li key={item.id} data-testid="plan-item">
                    <div>
                      <h3>{item.title}</h3>
                      {nextId === item.id && (
                        <span className="badge">Next to Study</span>
                      )}
                      <p>
                        {status}
                        {item.level !== null ? ` · Level ${item.level}` : ""}
                      </p>
                      <p className="plan-dates">
                        Created:{" "}
                        {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                        {session?.completedAt
                          ? ` · Completed: ${new Date(session.completedAt).toLocaleDateString("ko-KR")}`
                          : ""}
                      </p>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {plan.type === "READING" ? "Original ↗" : "Open BNE ↗"}
                      </a>
                      <p className="plan-source">{item.sourceUrl}</p>
                    </div>
                    <div className="button-row">
                      <button
                        className="button"
                        aria-label={`Move ${item.title} up`}
                        disabled={busy || index === 0}
                        onClick={() =>
                          void run({
                            type: "movePlanItem",
                            itemId: item.id,
                            direction: "up",
                          }).catch(() => {})
                        }
                      >
                        ↑
                      </button>
                      <button
                        className="button"
                        aria-label={`Move ${item.title} down`}
                        disabled={busy || index === items.length - 1}
                        onClick={() =>
                          void run({
                            type: "movePlanItem",
                            itemId: item.id,
                            direction: "down",
                          }).catch(() => {})
                        }
                      >
                        ↓
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void start(item.id, plan.type)}
                      >
                        {status === "COMPLETED"
                          ? "View session"
                          : status === "IN_PROGRESS"
                            ? "Continue"
                            : plan.type === "READING"
                              ? "Start Reading"
                              : "Start Listening"}
                      </button>
                      {article && canPrintArticle(article) && (
                        <Link
                          className="button"
                          href={`/print/${article.id}`}
                          target="_blank"
                        >
                          Print / Save as PDF
                        </Link>
                      )}
                      <button
                        className="text-button danger"
                        onClick={() =>
                          setConfirm({
                            title: item.title,
                            action: { type: "deletePlanItem", itemId: item.id },
                          })
                        }
                      >
                        Delete item
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {editor && (
        <Dialog
          title={
            editor.kind === "create"
              ? "New Plan"
              : editor.kind === "rename"
                ? "Rename Plan"
                : "Add item"
          }
          onClose={() => {
            if (!loading && !busy) setEditor(null);
          }}
        >
          <form
            className="plan-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {editor.kind === "create" && (
              <label>
                Learning type
                <select
                  value={planType}
                  onChange={(e) =>
                    setPlanType(e.target.value as typeof planType)
                  }
                >
                  <option value="READING">Reading</option>
                  <option value="LISTENING">Listening</option>
                </select>
              </label>
            )}
            {(editor.kind !== "add" || editor.plan?.type === "LISTENING") && (
              <label>
                {editor.kind === "add" ? "Lesson title" : "Plan name"}
                <input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {editor.kind === "add" && (
              <label>
                {editor.plan!.type === "READING"
                  ? "Wikipedia title or URL"
                  : "BNE lesson HTML URL"}
                <input
                  required
                  maxLength={2048}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
            )}
            {editor.kind === "add" && editor.plan!.type === "LISTENING" && (
              <>
                <label>
                  Level
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as typeof level)}
                  >
                    {["0", "1", "2", "3", "4", "5", "6", "other"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <p>
                  원본 HTML 페이지 링크만 저장합니다. 본문·음원은 가져오지
                  않습니다.
                </p>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            {choices.map((c) => (
              <button
                key={c.sourceUrl}
                type="button"
                className="button"
                disabled={loading || busy}
                onClick={() => void submit(c.sourceUrl)}
              >
                {c.title}
              </button>
            ))}
            <button className="button primary" disabled={loading || busy}>
              {loading ? "Saving…" : "Save"}
            </button>
          </form>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title="Delete from Study Plan?"
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            <strong>{confirm.title}</strong>
          </p>
          <p>
            계획에서 삭제할까요? 기존 History, Anki, Review와 원문 자료는
            보존됩니다. 계획 삭제는 되돌릴 수 없습니다.
          </p>
          {storeError && <p role="alert">{storeError}</p>}
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await run(confirm.action);
                  setConfirm(null);
                } catch {}
              }}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

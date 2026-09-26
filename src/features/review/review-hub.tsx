"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import { QuickAdd } from "@/features/anki/quick-add";
import {
  copyPrompt,
  openChatGPT,
  CHATGPT_URL,
} from "@/features/tutor/companion-browser";
import { reviewService, reviewPrompt } from "@/domain/review/review-service";
import { REVIEW_RULES } from "@/domain/review/review-scoring";
import { difficultyReasons } from "@/domain/learning";
import { companionQuestions } from "@/domain/tutor-provider";
import type {
  ReviewSuggestion,
  ReviewEvent,
} from "@/domain/review/review-types";
function useRefresh() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
}
export function ReviewHome() {
  const { state } = useStore();
  useRefresh();
  if (!state) return null;
  const m = reviewService(state);
  return (
    <section className="learning-card review-home">
      <h2>Today&apos;s Review</h2>
      <p>{m.today.length} items recommended · 최근 학습 중 다시 볼 만한 내용</p>
      <ul>
        {m.today.slice(0, 3).map((i) => (
          <li key={i.key}>{i.title.slice(0, 90)}</li>
        ))}
      </ul>
      {!m.today.length && (
        <p>오늘은 추천할 항목이 없어요. 학습 기록은 그대로 남아 있어요.</p>
      )}
      <p>
        Need Review {m.eligible.length} · Anki Candidates{" "}
        {state.ankiCandidates.filter((c) => c.status === "CANDIDATE").length} ·
        Listening Sessions {m.insights.weekly.listening} this week
      </p>
      <Link className="button soft-button" href="/review">
        Start Review
      </Link>
    </section>
  );
}
export function NeedReviewToggle({ sessionId }: { sessionId: string }) {
  const { state, run, busy } = useStore();
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const session = state?.learningSessions.find((s) => s.id === sessionId);
  if (!session) return null;
  return (
    <label className="checkbox-label spaced">
      <input
        type="checkbox"
        checked={pendingValue ?? !!session.needReview}
        disabled={busy}
        onChange={async (e) => {
          const needReview = e.target.checked;
          setPendingValue(needReview);
          try {
            await run({
              type: "markSessionReview",
              sessionId,
              needReview,
            });
          } catch {
          } finally {
            setPendingValue(null);
          }
        }}
      />
      Need review · 이 학습 다시 보기
    </label>
  );
}
export function ReviewHub() {
  const { state, run, busy } = useStore();
  useRefresh();
  const router = useRouter();
  const [selected, setSelected] = useState<ReviewSuggestion | null>(null);
  const [chat, setChat] = useState<ReviewSuggestion | null>(null);
  const [dismiss, setDismiss] = useState<ReviewSuggestion | null>(null);
  const [notice, setNotice] = useState("");
  if (!state) return null;
  const m = reviewService(state);
  async function record(
    item: ReviewSuggestion,
    action: ReviewEvent["action"],
    extras: {
      dismissal?: "TODAY" | "FOREVER";
      after?: number | null;
      note?: string;
      candidateId?: string;
    } = {},
  ) {
    await run({
      type: "recordReview",
      requestId: crypto.randomUUID(),
      sourceReference: item.key,
      action,
      userUnderstandingAfter: extras.after ?? null,
      note: extras.note ?? "",
      dismissal: extras.dismissal ?? null,
      candidateId: extras.candidateId ?? null,
    });
  }
  function anki(item: ReviewSuggestion) {
    const c = state!.ankiCandidates.find((c) =>
      item.candidateIds.includes(c.id),
    );
    if (c)
      return (
        <div>
          <span className="badge">Existing candidate · {c.status}</span>
          <button
            className="soft-button"
            disabled={busy}
            onClick={async () => {
              try {
                await record(item, "ANKI", { candidateId: c.id });
                router.push(`/cards?candidate=${encodeURIComponent(c.id)}`);
              } catch {}
            }}
          >
            Open Candidate
          </button>
        </div>
      );
    return (
      <QuickAdd
        sessionId={item.sessionIds[0] ?? null}
        expression={item.itemType === "EXPRESSION" ? item.title : ""}
        explanation={item.interactionIds
          .map(
            (id) =>
              state!.companionInteractions.find((i) => i.id === id)
                ?.userTakeaway ?? "",
          )
          .filter(Boolean)
          .slice(0, 2)
          .join("\n")
          .slice(0, 2000)}
        label="Save to Anki"
        onCreated={(id) =>
          void record(item, "ANKI", { candidateId: id }).catch(() => {})
        }
      />
    );
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORTH REVISITING</div>
          <h1>Today&apos;s Review</h1>
          <p>
            최근 {REVIEW_RULES.windowDays}일, 한 번에 최대 {REVIEW_RULES.limit}
            개. 장기 암기와 복습 일정은 Anki에서 이어가세요.
          </p>
        </div>
        <Link className="button" href="/history">
          학습 기록 보기
        </Link>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="review-grid">
        {m.today.map((item) => (
          <article className="learning-card review-suggestion" key={item.key}>
            <span className="badge">{item.category}</span>
            <h2>{item.title}</h2>
            <p>
              Last studied:{" "}
              {new Date(item.lastStudied).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </p>
            <strong>Recommended because</strong>
            <ul>
              {item.reasons.map((r) => (
                <li key={r.code}>{r.text}</li>
              ))}
            </ul>
            <div className="button-row">
              <button className="primary" onClick={() => setSelected(item)}>
                {item.itemType === "LISTENING_DIFFICULTY"
                  ? "Review sessions"
                  : "Review"}
              </button>
              <button onClick={() => setChat(item)}>Ask ChatGPT</button>
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    await record(item, "DISMISSED", { dismissal: "TODAY" });
                    setNotice(
                      "오늘은 숨겼어요. 학습 데이터는 그대로 유지됩니다.",
                    );
                  } catch {}
                }}
              >
                Not now
              </button>
            </div>
            {anki(item)}
            <button
              className="text-button spaced"
              onClick={() => setDismiss(item)}
            >
              Don&apos;t recommend this again
            </button>
          </article>
        ))}
      </div>
      {!m.today.length && (
        <section className="learning-card">
          <h2>오늘은 잠시 쉬어가도 좋아요</h2>
          <p>
            최근 추천할 항목이 없거나 오늘 이미 확인·숨김 처리했어요.
            History에서 모든 학습을 볼 수 있어요.
          </p>
        </section>
      )}
      <Insights insights={m.insights} />
      <details className="learning-card spaced">
        <summary>Review 활동 기록 ({state.reviewEvents.length})</summary>
        {state.reviewEvents.slice(0, 30).map((e) => (
          <div key={e.id}>
            <p>
              {new Date(e.createdAt).toLocaleString("ko-KR")} · {e.action}
              {e.dismissal
                ? ` · ${e.dismissal === "TODAY" ? "오늘 숨김" : "영구 제외"}`
                : ""}
            </p>
            <p className="review-reference">
              {m.all.find((i) => i.key === e.sourceReference)?.title ??
                e.sourceReference}
            </p>
            {e.action === "REVIEWED" && (
              <p>
                Before {e.userUnderstandingBefore ?? "미기록"} / 5 → After
                Review {e.userUnderstandingAfter ?? "미선택"} / 5
              </p>
            )}
            {e.note && <p>{e.note}</p>}
          </div>
        ))}
      </details>
      {selected && (
        <ReviewDetails
          key={selected.key}
          item={selected}
          onClose={() => setSelected(null)}
          onComplete={(after, note) =>
            record(selected, "REVIEWED", { after, note })
          }
        />
      )}
      {chat && (
        <ReviewChat
          key={chat.key}
          item={chat}
          onClose={() => setChat(null)}
          onOpened={() => record(chat, "CHATGPT")}
        />
      )}
      {dismiss && (
        <Dialog title="추천에서 제외할까요?" onClose={() => setDismiss(null)}>
          <p>{dismiss.title}</p>
          <p>
            앞으로 추천하지 않습니다. 원래 학습·Anki 기록은 삭제하지 않아요.
          </p>
          <button onClick={() => setDismiss(null)}>취소</button>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await record(dismiss, "DISMISSED", { dismissal: "FOREVER" });
                setDismiss(null);
                setNotice("앞으로 추천에서 제외했어요.");
              } catch {}
            }}
          >
            확인 · 더 이상 추천하지 않기
          </button>
        </Dialog>
      )}
    </div>
  );
}
function ReviewDetails({
  item,
  onClose,
  onComplete,
}: {
  item: ReviewSuggestion;
  onClose: () => void;
  onComplete: (after: number | null, note: string) => Promise<void>;
}) {
  const { state, busy } = useStore();
  const [after, setAfter] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  if (!state) return null;
  return (
    <Dialog title="Review 학습 기록" onClose={onClose}>
      <h3>{item.title}</h3>
      <p>
        Before:{" "}
        {item.understandingBefore === null
          ? "미기록"
          : `${item.understandingBefore} / 5`}{" "}
        · {item.understandingOrigin}
      </p>
      {item.interactionIds.map((id) => {
        const i = state.companionInteractions.find((i) => i.id === id)!;
        return (
          <section className="learning-card" key={id}>
            <p>
              {new Date(i.createdAt).toLocaleString("ko-KR")} · {i.questionType}
            </p>
            {i.selectedText && <blockquote>{i.selectedText}</blockquote>}
            <p>What I learned: {i.userTakeaway || "아직 작성하지 않음"}</p>
            <p>Understanding: {i.userUnderstanding ?? "미기록"}</p>
            <details>
              <summary>원래 질문 프롬프트</summary>
              <pre className="companion-history-prompt">
                {i.generatedPrompt}
              </pre>
            </details>
          </section>
        );
      })}
      {item.sessionIds.map((id) => {
        const s = state.learningSessions.find((s) => s.id === id);
        const d = state.listeningDetails.find((d) => d.sessionId === id);
        return s ? (
          <section key={id} className="learning-card">
            <h4>{s.userProvidedTitle}</h4>
            <p>
              {s.type} · {new Date(s.startedAt).toLocaleDateString("ko-KR")} ·{" "}
              {!s.completedAt
                ? "학습 중"
                : s.duration === null
                  ? "시간 미기록"
                  : `${s.duration}초 (휴식 포함)`}
            </p>
            <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
              원 사이트
            </a>
            {d && (
              <>
                <p>
                  First comprehension: {d.round1?.comprehension ?? "—"}% ·
                  Listen again: {d.round3?.comprehension ?? "—"}% · Final:{" "}
                  {d.recall?.comprehension ?? "—"}%
                </p>
                <p>
                  {d.round2?.difficultyReasons
                    .map((k) => difficultyReasons[k])
                    .join(" · ")}
                </p>
                <p>Final recall: {d.recall?.summary || "미기록"}</p>
              </>
            )}
            <Link
              className="button soft-button"
              href={
                s.type === "READING" ? `/learn/${s.id}` : `/listening/${s.id}`
              }
            >
              관련 LearningSession 열기
            </Link>
          </section>
        ) : null;
      })}
      <label className="field-label spaced">
        How well do you understand this now?
        <select
          aria-label="How well do you understand this now?"
          value={after}
          disabled={done}
          onChange={(e) => setAfter(e.target.value)}
        >
          <option value="">선택하지 않음</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Review note
        <textarea
          aria-label="Review note"
          value={note}
          maxLength={1000}
          disabled={done}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={busy || done}
        onClick={async () => {
          try {
            await onComplete(after ? Number(after) : null, note);
            setDone(true);
          } catch {}
        }}
      >
        Review 완료
      </button>
      {done && (
        <p role="status">
          Review 기록됨 · Before {item.understandingBefore ?? "미기록"} / 5 →
          After Review {after || "미선택"} / 5. 오늘 추천에서는 숨겼어요.
        </p>
      )}
    </Dialog>
  );
}
function ReviewChat({
  item,
  onClose,
  onOpened,
}: {
  item: ReviewSuggestion;
  onClose: () => void;
  onOpened: () => Promise<void>;
}) {
  const { state } = useStore();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  if (!state) return null;
  const prompt = reviewPrompt(item, state);
  async function copy(open: boolean) {
    setPending(true);
    try {
      await copyPrompt(prompt);
      if (open) {
        const opened = openChatGPT();
        setBlocked(!opened);
        setMessage(
          opened
            ? "복사했어요. ChatGPT에서 직접 붙여넣고 전송하세요."
            : "복사했어요. 팝업이 차단되었다면 새 탭 링크를 눌러 주세요.",
        );
        if (opened) await onOpened();
      } else setMessage("프롬프트를 복사했어요.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog title="Review ChatGPT Companion" onClose={onClose}>
      <label className="field-label">
        Review prompt
        <textarea
          aria-label="Review prompt"
          rows={12}
          readOnly
          value={prompt}
        />
      </label>
      <div className="button-row">
        <button disabled={pending} onClick={() => void copy(false)}>
          프롬프트 복사
        </button>
        <button
          className="primary"
          disabled={pending}
          onClick={() => void copy(true)}
        >
          ChatGPT에서 질문하기
        </button>
      </div>
      {blocked && (
        <a
          href={CHATGPT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void onOpened().catch(() => {})}
        >
          ChatGPT를 새 탭으로 열기 ↗
        </a>
      )}
      <p role="status">{message}</p>
      <small>
        앱은 ChatGPT 입력·답변을 읽지 않으며 창 열기 실행만 기록합니다.
      </small>
    </Dialog>
  );
}
function Insights({
  insights: i,
}: {
  insights: ReturnType<typeof reviewService>["insights"];
}) {
  const label = (key: string) =>
    difficultyReasons[key as keyof typeof difficultyReasons] ?? key;
  return (
    <>
      <div className="review-grid spaced">
        <section className="learning-card">
          <h2>Last 10 Listening Sessions</h2>
          <p>{i.listening.count}개 세션 · Most common difficulties</p>
          <ul>
            {i.listening.difficulties.map((d) => (
              <li key={d.key}>
                {label(d.key)} — {d.count}
              </li>
            ))}
          </ul>
          <p>
            Average first comprehension:{" "}
            {i.listening.first === null ? "—" : `${i.listening.first}%`}
          </p>
          <p>
            Average final comprehension:{" "}
            {i.listening.final === null ? "—" : `${i.listening.final}%`}
          </p>
          <p>
            Improvement:{" "}
            {i.listening.improvement === null
              ? "—"
              : `${i.listening.improvement > 0 ? "+" : ""}${i.listening.improvement} percentage points`}
          </p>
          <small>
            첫·최종 값이 모두 있는 동일 세션 {i.listening.pairedCount}개 기준.
            0%와 미기록을 구분합니다.
          </small>
        </section>
        <section className="learning-card">
          <h2>Recent Reading</h2>
          <p>최근 30일 · Most asked categories</p>
          <ul>
            {i.reading.categories.map((c) => (
              <li key={c.key}>
                {companionQuestions[c.key as keyof typeof companionQuestions] ??
                  c.key}{" "}
                — {c.count}
              </li>
            ))}
          </ul>
          <h3>낮은 이해도를 기록했던 표현</h3>
          <ul>
            {i.reading.lowTopics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            What I learned 미작성: {i.reading.emptyTakeaways} /{" "}
            {i.reading.total}개 질문
          </p>
          <small>
            문법 주제를 AI로 추정하거나 다른 의미를 합치지 않습니다.
          </small>
        </section>
      </div>
      <section className="learning-card spaced">
        <h2>This Week</h2>
        <p>
          한국 시간 월요일부터 · Reading sessions {i.weekly.reading} · Listening
          sessions {i.weekly.listening}
        </p>
        <p>
          Most repeated grammar:{" "}
          {i.weekly.grammar && i.weekly.grammar.count >= 2
            ? `${i.weekly.grammar.key} (${i.weekly.grammar.count}회)`
            : "반복 기록 없음"}
        </p>
        <p>
          Most common listening difficulty:{" "}
          {i.weekly.difficulty ? label(i.weekly.difficulty.key) : "기록 없음"}
        </p>
        <p>
          Items reviewed: {i.weekly.reviewed} · Understanding improved:{" "}
          {i.weekly.improved} items
        </p>
        <small>
          항목당 한 번 집계. 향상은 첫 Review 전 값과 이번 주 마지막 재평가를
          비교합니다.
        </small>
      </section>
    </>
  );
}

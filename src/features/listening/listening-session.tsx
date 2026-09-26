"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/provider";
import {
  difficultyReasons,
  type ListeningDetails,
  type LearningSession,
} from "@/domain/learning";
import type { Action } from "@/domain/schemas";
import { ListeningCompanion } from "./listening-companion";
import { InteractionHistory } from "@/features/tutor/interaction-reflection";
import { QuickAdd } from "@/features/anki/quick-add";
import { NeedReviewToggle } from "@/features/review/review-hub";
import { useDraft, DraftStatus } from "@/components/use-draft";
import { stageLabels } from "@/features/learning/continue-learning";
export function ListeningSessionPage({ sessionId }: { sessionId: string }) {
  const { state } = useStore();
  const [viewStage, setViewStage] = useState<ListeningDetails["stage"] | null>(
    null,
  );
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  if (!state) return null;
  const session = state.learningSessions.find(
    (s) => s.id === sessionId && s.type === "LISTENING",
  );
  const details = state.listeningDetails.find((d) => d.sessionId === sessionId);
  if (!session || !details)
    return (
      <div className="page">
        <h1>Listening 기록을 찾을 수 없어요</h1>
        <Link href="/listening">Listening으로</Link>
      </div>
    );
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            BREAKING NEWS ENGLISH · LEVEL{" "}
            {session.level === "other" ? "기타" : session.level}
          </div>
          <h1>{session.userProvidedTitle}</h1>
          <p>원본 HTML 페이지에서 듣고, 자신의 이해와 요약만 기록해 주세요.</p>
        </div>
        <a
          className="button primary"
          href={session.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Breaking News English ↗
        </a>
      </div>
      <div className="listening-layout">
        <section className="listening-work">
          <div className="learning-steps">
            {["ROUND1", "ROUND2", "ROUND3", "FINAL", "REFLECTION"].map(
              (stage, index) => (
                <button
                  type="button"
                  key={stage}
                  className={
                    (viewStage ?? details.stage) === stage ? "active" : ""
                  }
                  aria-current={
                    (viewStage ?? details.stage) === stage ? "step" : undefined
                  }
                  disabled={
                    index >
                    [
                      "ROUND1",
                      "ROUND2",
                      "ROUND3",
                      "FINAL",
                      "REFLECTION",
                    ].indexOf(details.stage)
                  }
                  onClick={() =>
                    setViewStage(stage as ListeningDetails["stage"])
                  }
                >
                  {index <
                  ["ROUND1", "ROUND2", "ROUND3", "FINAL", "REFLECTION"].indexOf(
                    details.stage,
                  )
                    ? "✓ "
                    : ""}
                  {stageLabels[stage as keyof typeof stageLabels]}
                </button>
              ),
            )}
          </div>
          {(viewStage ?? details.stage) === "REFLECTION" ? (
            <ListeningReflection session={session} details={details} />
          ) : (
            <RoundForm
              key={`${sessionId}:${viewStage ?? details.stage}`}
              sessionId={sessionId}
              details={{ ...details, stage: viewStage ?? details.stage }}
              readOnly={!!session.completedAt}
              onSaved={() => setViewStage(null)}
              onSummary={setSummaryDraft}
            />
          )}
          <Expressions sessionId={sessionId} />
          <section className="learning-card">
            <h3>Anki Quick Add</h3>
            <QuickAdd sessionId={sessionId} />
          </section>
          <SessionNotes session={session} />
          <NeedReviewToggle sessionId={sessionId} />
          <details className="learning-card">
            <summary>저장한 라운드 기록</summary>
            {details.round1 && (
              <>
                <h3>First Listening · {details.round1.comprehension}%</h3>
                <p>{details.round1.keywords}</p>
                <p>{details.round1.summary}</p>
                <p>어려움: {details.round1.difficulty}</p>
              </>
            )}
            {details.round2 && (
              <>
                <h3>What did I miss?</h3>
                <p>
                  {details.round2.difficultyReasons
                    .map((r) => difficultyReasons[r])
                    .join(" · ")}
                </p>
                <p>{details.round2.reason}</p>
              </>
            )}
            {details.round3 && (
              <>
                <h3>Listen Again · {details.round3.comprehension}%</h3>
                <p>{details.round3.newlyHeard}</p>
                <p>{details.round3.stillDifficult}</p>
              </>
            )}
          </details>
          <h2>ChatGPT 질문과 배운 내용</h2>
          <InteractionHistory sessionId={sessionId} />
          <Link href="/history" className="button">
            History에서 보기
          </Link>
        </section>
        <ListeningCompanion
          key={details.stage}
          session={session}
          details={details}
          summaryDraft={summaryDraft}
        />
      </div>
    </div>
  );
}
function RoundForm({
  sessionId,
  details,
  readOnly = false,
  onSaved,
  onSummary,
}: {
  sessionId: string;
  details: ListeningDetails;
  readOnly?: boolean;
  onSaved: () => void;
  onSummary: (summary: string) => void;
}) {
  const { run, busy } = useStore();
  const [draft, setDraft, draftState] = useDraft(
    `${readOnly ? "saved:" : ""}listening:${sessionId}:${details.stage}`,
    {
      percent: String(
        (details.stage === "ROUND1"
          ? details.round1?.comprehension
          : details.stage === "ROUND3"
            ? details.round3?.comprehension
            : details.recall?.comprehension) ?? "",
      ),
      one:
        (details.stage === "ROUND1"
          ? details.round1?.keywords
          : details.stage === "ROUND2"
            ? details.round2?.reason
            : details.stage === "ROUND3"
              ? details.round3?.newlyHeard
              : details.recall?.summary) ?? "",
      two:
        (details.stage === "ROUND1"
          ? details.round1?.summary
          : details.round3?.stillDifficult) ?? "",
      difficulty: details.round1?.difficulty ?? "moderate",
      reasons: details.round2?.difficultyReasons ?? [],
      review: details.recall?.needReview ?? false,
    },
  );
  const { percent, one, two, difficulty, reasons, review } = draft;
  const setPercent = (percent: string) => setDraft((v) => ({ ...v, percent }));
  const setOne = (one: string) => setDraft((v) => ({ ...v, one }));
  const setTwo = (two: string) => setDraft((v) => ({ ...v, two }));
  const setDifficulty = (difficulty: typeof draft.difficulty) =>
    setDraft((v) => ({ ...v, difficulty }));
  const setReasons = (reasons: typeof draft.reasons) =>
    setDraft((v) => ({ ...v, reasons }));
  const setReview = (review: boolean) => setDraft((v) => ({ ...v, review }));
  const [error, setError] = useState("");
  const stage = details.stage;
  useEffect(() => {
    if (stage === "FINAL") onSummary(one);
  }, [stage, one, onSummary]);
  const labels = {
    ROUND1: [
      "ROUND 1 — First Listening",
      "스크립트를 보지 않고 먼저 들어 보세요.",
      "들린 핵심 단어/아이디어",
      "짧은 내용 요약 (영어 또는 한국어)",
      "Finish Round 1",
    ],
    ROUND2: [
      "ROUND 2 — Script Check",
      "Breaking News English 원본 페이지에서 직접 스크립트를 확인하세요.",
      "왜 못 들었다고 생각하는가?",
      "",
      "Finish Round 2",
    ],
    ROUND3: [
      "ROUND 3 — Listen Again",
      "스크립트를 확인한 뒤 다시 들어 보세요.",
      "새롭게 들린 내용",
      "아직 안 들리는 부분",
      "Finish Round 3",
    ],
    FINAL: [
      "FINAL RECALL",
      "본문과 스크립트를 보지 않고 영어로 2~5문장 요약해 보세요.",
      "What was the story about?",
      "",
      "Finish Listening Session",
    ],
    REFLECTION: ["", "", "", "", ""],
  }[stage];
  return (
    <form
      className="learning-card"
      onSubmit={async (e) => {
        e.preventDefault();
        let action: Action;
        if (stage === "ROUND1")
          action = {
            type: "saveRound1",
            sessionId,
            data: {
              comprehension: Number(percent),
              keywords: one,
              summary: two,
              difficulty,
            },
          };
        else if (stage === "ROUND2")
          action = {
            type: "saveRound2",
            sessionId,
            data: { difficultyReasons: reasons, reason: one },
          };
        else if (stage === "ROUND3")
          action = {
            type: "saveRound3",
            sessionId,
            data: {
              comprehension: Number(percent),
              newlyHeard: one,
              stillDifficult: two,
            },
          };
        else
          action = {
            type: "saveRecall",
            sessionId,
            data: {
              summary: one,
              comprehension: Number(percent),
              needReview: review,
            },
          };
        try {
          await run(action);
          draftState.clear();
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h2>{labels[0]}</h2>
      <p>{labels[1]}</p>
      <fieldset disabled={readOnly} className="round-fields">
        {stage !== "ROUND2" && (
          <>
            <label className="field-label spaced" htmlFor="comprehension">
              {stage === "ROUND1"
                ? "1차 이해도"
                : stage === "ROUND3"
                  ? "두 번째 이해도"
                  : "최종 이해도"}{" "}
              (0~100%)
            </label>
            <input
              id="comprehension"
              type="number"
              min={0}
              max={100}
              step={1}
              required
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </>
        )}
        {stage === "ROUND2" && (
          <fieldset>
            <legend>What did I miss? (복수 선택)</legend>
            {Object.entries(difficultyReasons).map(([key, label]) => (
              <label className="check-line" key={key}>
                <input
                  type="checkbox"
                  checked={reasons.includes(
                    key as keyof typeof difficultyReasons,
                  )}
                  onChange={(e) =>
                    setReasons(
                      e.target.checked
                        ? [...reasons, key as keyof typeof difficultyReasons]
                        : reasons.filter((r) => r !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <label className="field-label spaced" htmlFor="round-one">
          {labels[2]}
        </label>
        <textarea
          id="round-one"
          maxLength={stage === "ROUND1" ? 1000 : 2000}
          required={stage === "FINAL"}
          value={one}
          onChange={(e) => setOne(e.target.value)}
        />
        {labels[3] && (
          <>
            <label className="field-label spaced" htmlFor="round-two">
              {labels[3]}
            </label>
            <textarea
              id="round-two"
              maxLength={2000}
              value={two}
              onChange={(e) => setTwo(e.target.value)}
            />
          </>
        )}
        {stage === "ROUND1" && (
          <>
            <label className="field-label spaced" htmlFor="difficulty">
              듣기가 어려웠던 정도
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as typeof difficulty)
              }
            >
              <option value="easy">쉬움</option>
              <option value="moderate">보통</option>
              <option value="hard">어려움</option>
              <option value="very_hard">매우 어려움</option>
            </select>
          </>
        )}
        {stage === "FINAL" && (
          <label className="check-line">
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
            />
            다시 복습할 필요가 있어요
          </label>
        )}
        <p className="storage-note">
          내가 들은 내용과 생각을 직접 작성해 주세요. 아래 버튼으로 저장합니다.
        </p>
        <button className="primary" disabled={busy}>
          {labels[4]}
        </button>
      </fieldset>
      {readOnly && (
        <p className="storage-note">
          완료한 학습의 저장된 내용입니다. 추가 생각은 학습 메모에 남겨 주세요.
        </p>
      )}
      <DraftStatus text={draftState.status} />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function ListeningReflection({
  session,
  details,
}: {
  session: LearningSession;
  details: ListeningDetails;
}) {
  const { state } = useStore();
  return (
    <section className="learning-card">
      <div className="eyebrow">LISTENING REFLECTION</div>
      <h2>Listening Session 결과</h2>
      <dl className="reflection-grid">
        <dt>Round 1 comprehension</dt>
        <dd>{details.round1?.comprehension ?? "—"}%</dd>
        <dt>Listen Again comprehension</dt>
        <dd>{details.round3?.comprehension ?? "—"}%</dd>
        <dt>Final comprehension</dt>
        <dd>{details.recall?.comprehension ?? "—"}%</dd>
        <dt>학습 경과 시간</dt>
        <dd>
          {!session.completedAt
            ? "학습 중"
            : session.duration === null
              ? "기록 없음"
              : `${Math.floor(session.duration / 60)}분 ${session.duration % 60}초`}
        </dd>
      </dl>
      <small>시작~완료 사이 경과 시간이며 중단·휴식 시간이 포함됩니다.</small>
      <h3>Main difficulties</h3>
      <ul>
        {details.round2?.difficultyReasons.map((r) => (
          <li key={r}>{difficultyReasons[r]}</li>
        ))}
      </ul>
      <h3>New expressions</h3>
      <ul>
        {state?.learnedExpressions
          .filter((e) => e.sessionId === session.id)
          .map((e) => (
            <li key={e.id}>
              {e.expression} · {e.meaning}
            </li>
          ))}
      </ul>
      <h3>Final summary</h3>
      <p className="preserve-lines">{details.recall?.summary}</p>
      <p>
        Need review:{" "}
        <strong>
          {!details.recall
            ? "미기록"
            : details.recall.needReview
              ? "YES"
              : "NO"}
        </strong>
      </p>
    </section>
  );
}
export function SessionNotes({ session }: { session: LearningSession }) {
  const { run, busy } = useStore();
  const [notes, setNotes, draft] = useDraft(
    `notes:${session.id}`,
    session.notes,
  );
  const [saved, setSaved] = useState(false);
  return (
    <section className="learning-card">
      <label className="field-label" htmlFor="session-notes">
        학습 메모
      </label>
      <textarea
        id="session-notes"
        maxLength={2000}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
      />
      <button
        className="soft-button"
        disabled={busy}
        onClick={async () => {
          try {
            await run({ type: "sessionNotes", sessionId: session.id, notes });
            draft.clear();
            setSaved(true);
          } catch {}
        }}
      >
        {saved ? "메모 저장됨" : "메모 저장"}
      </button>
      <DraftStatus text={draft.status} />
    </section>
  );
}
function Expressions({ sessionId }: { sessionId: string }) {
  const { run, state, busy } = useStore();
  const [expression, setExpression] = useState("");
  const [meaning, setMeaning] = useState("");
  return (
    <section className="learning-card">
      <h3>오늘 배운 표현</h3>
      <p>명시적으로 저장한 단어·짧은 표현만 History에 남겨요.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await run({
              type: "saveExpression",
              sessionId,
              expression,
              meaning,
            });
            setExpression("");
            setMeaning("");
          } catch {}
        }}
      >
        <label className="field-label" htmlFor="saved-expression">
          학습 표현 (10단어·80자 이내)
        </label>
        <input
          id="saved-expression"
          required
          maxLength={80}
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
        />
        <label className="field-label" htmlFor="expression-meaning">
          표현 뜻 (내 설명)
        </label>
        <input
          id="expression-meaning"
          maxLength={500}
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
        />
        <button className="soft-button spaced" disabled={busy}>
          학습 표현으로 저장
        </button>
      </form>
      <ul>
        {state?.learnedExpressions
          .filter((e) => e.sessionId === sessionId)
          .map((e) => (
            <li key={e.id}>
              {e.expression} · {e.meaning}
            </li>
          ))}
      </ul>
    </section>
  );
}

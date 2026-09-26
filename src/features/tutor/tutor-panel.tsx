"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  BookmarkPlus,
  Send,
  Check,
  RotateCcw,
  MessageSquare,
  Flag,
} from "lucide-react";
import { useStore } from "@/components/provider";
import { defaultQuestions, questionLabels } from "@/domain/schemas";
import type { Action } from "@/domain/schemas";
import type { LearningItem, QuestionType } from "@/domain/types";
export function TutorPanel({
  item,
  onSource,
}: {
  item?: LearningItem;
  onSource: () => void;
}) {
  const { run, busy, error, state } = useStore();
  const isMock = state?.tutor?.mode === "mock";
  const followupRequest = useRef<{ question: string; id: string } | null>(null);
  const router = useRouter();
  const [guess, setGuess] = useState(item?.guess ?? "");
  const [question, setQuestion] = useState(
    item?.question ?? defaultQuestions.meaning,
  );
  const [questionType, setQuestionType] = useState<QuestionType>(
    item?.questionType ?? "meaning",
  );
  const [production, setProduction] = useState(item?.production ?? "");
  const [followup, setFollowup] = useState("");
  const [selected, setSelected] = useState<"a" | "b" | "c" | null>(null);
  const [retry, setRetry] = useState(false);
  const draft = useRef<Action | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(true);
  const acting = useRef(false);
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (draft.current) {
      const action = draft.current;
      await run(action);
      if (draft.current === action) {
        draft.current = null;
        setSaved(true);
      }
    }
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (draft.current) void run(draft.current).catch(() => {});
    },
    [run],
  );
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (draft.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function saveDraft(
    values: Partial<{
      guess: string;
      question: string;
      questionType: QuestionType;
      production: string;
    }>,
  ) {
    if (!item) return;
    draft.current = {
      type: "draft",
      itemId: item.id,
      guess,
      question,
      questionType,
      production,
      ...values,
    };
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 400);
  }
  async function act(action: Action) {
    if (acting.current) return undefined;
    acting.current = true;
    try {
      await flush();
      return await run(action);
    } catch {
      return undefined;
    } finally {
      acting.current = false;
    }
  }
  const result = item?.attempts.at(-1);
  const showResult = !!result && !retry;
  return (
    <aside className="tutor">
      <header className="tutor-header">
        <div>
          <h2>
            <Sparkles size={19} /> AI Tutor
          </h2>
          <span className="badge">
            {item?.answer?.provider === "mock"
              ? "저장된 MOCK"
              : isMock
                ? "MOCK"
                : state?.tutor?.configured
                  ? "OPENAI"
                  : "API 키 필요"}
          </span>
        </div>
        <p>정답을 보기 전에, 내 생각부터.</p>
        <span className="tutor-save">
          {error
            ? "저장 오류 · 다시 시도 가능"
            : busy || !saved
              ? "처리 중… AI 응답은 최대 45초 걸릴 수 있어요"
              : "SQLite에 저장됨"}
        </span>
      </header>
      {!item ? (
        <div className="tutor-empty">
          <div className="empty-icon">
            <MessageSquare size={28} />
          </div>
          <h3>어떤 문장이 궁금한가요?</h3>
          <p>
            본문에서 단어나 문장을 선택하거나
            <br />
            문단 아래 질문 버튼을 눌러 보세요.
          </p>
          <div className="tip-box">
            <span>작은 학습 팁</span>
            <p>
              완벽한 해석이 아니어도 괜찮아요.
              <br />
              먼저 떠오르는 생각을 적어 보세요.
            </p>
          </div>
        </div>
      ) : (
        <div className="tutor-body">
          <div className="steps">
            {(["guess", "explanation", "quiz"] as const).map((step, index) => (
              <button
                key={step}
                className={item.step === step ? "current" : ""}
                disabled={!item.answer || busy}
                onClick={() =>
                  void act({ type: "step", itemId: item.id, step })
                }
              >
                <span>{index + 1}</span>
                {["내 추측", "설명", "기억 확인"][index]}
              </button>
            ))}
          </div>
          <div className="quote-label">
            선택한 표현{" "}
            <button onClick={onSource}>
              <ArrowLeft size={12} />
              원문으로
            </button>
          </div>
          <blockquote lang="en">{item.quote}</blockquote>
          {item.tutorContext && (
            <details className="tutor-context">
              <summary>전달된 원문 문맥 확인</summary>
              <p>
                {item.tutorContext.source.title} ·{" "}
                {item.tutorContext.source.provider === "simple_wikipedia"
                  ? `Wikipedia 판 ${item.tutorContext.source.revisionId}`
                  : "Mock 자료"}
              </p>
              {item.tutorContext.context.map((block) => (
                <p
                  key={block.blockId}
                  lang="en"
                  data-context-block={block.blockId}
                >
                  {block.text}
                </p>
              ))}
              {item.tutorContext.contextTruncated && (
                <small>
                  선택 구간을 포함해 문맥을 6,000자 이내로 제한했어요.
                </small>
              )}
            </details>
          )}
          {!isMock && !state?.tutor?.configured && (
            <p className="mock-disclaimer">
              OPENAI_API_KEY가 설정되지 않았어요. .env.local에 키를 설정한 뒤
              개발 서버를 다시 시작해 주세요. 추측과 선택한 문맥은 저장할 수
              있어요.
            </p>
          )}
          {item.step === "guess" && !item.answer ? (
            <>
              <label className="field-label" htmlFor="question-type">
                무엇이 궁금한가요?
              </label>
              <select
                id="question-type"
                value={questionType}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  setQuestionType(type);
                  setQuestion(defaultQuestions[type]);
                  saveDraft({
                    questionType: type,
                    question: defaultQuestions[type],
                  });
                }}
              >
                {Object.entries(questionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="question">
                내 질문
              </label>
              <input
                id="question"
                value={question}
                maxLength={1000}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  saveDraft({ question: e.target.value });
                }}
              />
              <label className="field-label spaced" htmlFor="guess">
                내 생각에는…
              </label>
              <textarea
                id="guess"
                placeholder="이 표현은 어떤 뜻일까요? 한국어나 영어로 자유롭게 적어 보세요."
                value={guess}
                maxLength={1000}
                onChange={(e) => {
                  setGuess(e.target.value);
                  saveDraft({ guess: e.target.value });
                }}
              />
              <div className="input-meta">
                <span>틀려도 괜찮아요. 추측하는 과정이 학습이에요.</span>
                <span>{guess.length}/1000</span>
              </div>
              <button
                className="primary full-width"
                disabled={busy || !guess.trim() || !question.trim()}
                onClick={() =>
                  void act({ type: "explain", itemId: item.id, unknown: false })
                }
              >
                설명 확인
                <Sparkles size={16} />
              </button>
              <button
                className="text-button full-width"
                disabled={busy || !question.trim()}
                onClick={() =>
                  void act({ type: "explain", itemId: item.id, unknown: true })
                }
              >
                바로 해설 보기
              </button>
              <p className="mock-disclaimer">
                {isMock
                  ? "Mock 모드에서는 준비된 설명을 보여 드려요. 외부 AI로 전송하지 않아요."
                  : "해설을 요청할 때 선택 원문·주변 문맥·질문·추측이 OpenAI로 전달돼요. 먼저 추측하거나 바로 해설을 볼 수 있어요."}
              </p>
            </>
          ) : item.step !== "quiz" && item.answer ? (
            <>
              <div className="my-guess">
                <span>내가 생각한 뜻</span>
                <p>
                  {item.unknown ? "추측 없이 해설 보기" : item.submittedGuess}
                </p>
              </div>
              <section className="explanation-card">
                {item.answer.directAnswerKo && (
                  <>
                    <h3>질문에 대한 답변</h3>
                    <p>{item.answer.directAnswerKo}</p>
                  </>
                )}
                <h3>문맥 속 뜻</h3>
                <p>{item.answer.translationKo}</p>
                <h3>보충 설명 · 문장 구조와 문법</h3>
                <div className="chunk-row">
                  {item.answer.chunks.map((c) => (
                    <div key={c.text}>
                      <strong lang="en">{c.text}</strong>
                      <small>{c.role}</small>
                    </div>
                  ))}
                </div>
                <p>{item.answer.explanationKo}</p>
                <div className="feedback-note">{item.answer.feedback}</div>
              </section>
              <section className="explanation-card">
                <h3>이렇게도 써요</h3>
                {item.answer.examples.map((e) => (
                  <div key={e.en}>
                    <p className="english-example" lang="en">
                      {e.en}
                    </p>
                    <p className="muted">{e.ko}</p>
                  </div>
                ))}
              </section>
              <div className="vocabulary">
                <div>
                  <strong lang="en">{item.answer.expression}</strong>
                  <span>{item.answer.meaning}</span>
                </div>
                <button
                  className="soft-button"
                  disabled={busy || item.needsReview}
                  onClick={async () => {
                    const result = await act({
                      type: "makeCard",
                      itemId: item.id,
                    });
                    if (result?.id) router.push(`/cards?card=${result.id}`);
                  }}
                >
                  <BookmarkPlus size={16} />
                  카드 만들기
                </button>
              </div>
              {item.answer.vocabulary && (
                <section className="explanation-card">
                  <h3>주요 어휘와 표현</h3>
                  {item.answer.vocabulary.map((v) => (
                    <p key={v.expression}>
                      <strong lang="en">{v.expression}</strong> · {v.meaning}
                    </p>
                  ))}
                </section>
              )}
              <button
                className="primary full-width"
                disabled={busy || item.needsReview}
                onClick={() =>
                  void act({ type: "step", itemId: item.id, step: "quiz" })
                }
              >
                기억 확인
                <ArrowRight size={16} />
              </button>
              <button
                className="text-button flag-button"
                disabled={busy || item.needsReview}
                onClick={() => void act({ type: "flag", itemId: item.id })}
              >
                <Flag size={13} />
                {item.needsReview
                  ? "검토 필요 · 카드 생성 보류"
                  : "설명에 오류가 있어요"}
              </button>
              <section className="followup">
                <h3>조금 더 궁금한가요?</h3>
                {item.followups.map((turn, index) => (
                  <div key={index}>
                    <div className="user-bubble">{turn.question}</div>
                    <div className="assistant-bubble">
                      <strong>질문에 대한 답변</strong>
                      <p>{turn.reply}</p>
                      {turn.supplementaryKo && (
                        <>
                          <strong>보충 설명</strong>
                          <p>{turn.supplementaryKo}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (followupRequest.current?.question !== followup)
                      followupRequest.current = {
                        question: followup,
                        id: crypto.randomUUID(),
                      };
                    const response = await act({
                      type: "followup",
                      itemId: item.id,
                      question: followup,
                      requestId: followupRequest.current!.id,
                    });
                    if (response) {
                      setFollowup("");
                      followupRequest.current = null;
                    }
                  }}
                >
                  <input
                    aria-label="추가 질문"
                    placeholder="이 문맥에 대해 질문하기"
                    value={followup}
                    onChange={(e) => setFollowup(e.target.value)}
                    maxLength={500}
                  />
                  <button
                    className="primary icon-button"
                    aria-label="추가 질문 보내기"
                    disabled={
                      busy || !followup.trim() || item.followups.length >= 10
                    }
                  >
                    <Send size={17} />
                  </button>
                </form>
                <small>
                  {isMock ? "준비된 Mock 응답" : "원문과 최근 대화를 기억해요"}{" "}
                  · {item.followups.length}/10
                </small>
              </section>
            </>
          ) : item.quiz ? (
            <>
              <section className="explanation-card quiz-card">
                <span className="eyebrow">QUICK CHECK</span>
                <h3>{item.quiz.prompt}</h3>
                <div className="quiz-options">
                  {item.quiz.options.map((option, index) => (
                    <button
                      key={option.id}
                      disabled={showResult || busy}
                      className={
                        (showResult ? result?.selectedId : selected) ===
                        option.id
                          ? "selected"
                          : ""
                      }
                      onClick={() => setSelected(option.id)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>
                      {option.text}
                    </button>
                  ))}
                </div>
                {!showResult ? (
                  <>
                    <button
                      className="primary full-width"
                      disabled={busy || !selected}
                      onClick={async () => {
                        if (
                          await act({
                            type: "attempt",
                            itemId: item.id,
                            selectedId: selected,
                          })
                        )
                          setRetry(false);
                      }}
                    >
                      답 제출하기
                    </button>
                    <button
                      className="text-button full-width"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await act({
                            type: "attempt",
                            itemId: item.id,
                            selectedId: null,
                          })
                        )
                          setRetry(false);
                      }}
                    >
                      모르겠어요
                    </button>
                  </>
                ) : (
                  <div
                    className={`quiz-result ${result.correct ? "correct" : "incorrect"}`}
                  >
                    <strong>
                      {result.correct
                        ? "✓ 정답이에요"
                        : result.selectedId
                          ? "다시 확인해 볼까요?"
                          : "괜찮아요. 함께 확인해요."}
                    </strong>
                    <p>
                      정답:{" "}
                      {
                        item.quiz.options.find(
                          (o) => o.id === item.quiz?.correctId,
                        )?.text
                      }
                    </p>
                    <p>{item.quiz.explanation}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setRetry(true);
                        setSelected(null);
                      }}
                    >
                      <RotateCcw size={14} />
                      새로 도전하기
                    </button>
                    <small>
                      첫 시도를 포함해 {item.attempts.length}회 기록됨
                    </small>
                  </div>
                )}
              </section>
              {showResult && (
                <section className="production">
                  <h3>이제, 내 문장으로</h3>
                  <p>배운 표현으로 나에 대한 영어 문장을 써 보세요.</p>
                  <label className="sr-only" htmlFor="production">
                    내 영어 문장
                  </label>
                  <textarea
                    id="production"
                    lang="en"
                    placeholder="Make it your own…"
                    value={production}
                    maxLength={500}
                    onChange={(e) => {
                      setProduction(e.target.value);
                      saveDraft({ production: e.target.value });
                    }}
                  />
                  <button
                    className="soft-button full-width"
                    disabled={busy || !production.trim()}
                    onClick={() =>
                      void act({ type: "production", itemId: item.id })
                    }
                  >
                    <Check size={16} />
                    {item.productionSaved ? "영작 저장됨" : "내 문장 저장"}
                  </button>
                  <small>
                    영작은 자동 채점하지 않아요. 쓰기를 시도한 기록만 남겨요.
                  </small>
                  <button
                    className="text-button full-width"
                    onClick={() =>
                      void act({
                        type: "step",
                        itemId: item.id,
                        step: "explanation",
                      })
                    }
                  >
                    설명과 카드 다시 보기
                    <ArrowRight size={14} />
                  </button>
                </section>
              )}
            </>
          ) : null}
          {error && (
            <div role="alert" className="inline-error">
              {error}
              {!saved && (
                <button onClick={() => void flush().catch(() => {})}>
                  저장 다시 시도
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

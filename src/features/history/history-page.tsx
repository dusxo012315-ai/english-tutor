"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Search,
  ChevronDown,
  MessageSquare,
  Bookmark,
  CircleAlert,
} from "lucide-react";
import { useStore } from "@/components/provider";
import { companionQuestions } from "@/domain/tutor-provider";
import { filterLearningSessions, type LearningType } from "@/domain/learning";
import { ListeningReflection } from "@/features/listening/listening-session";
import { InteractionHistory } from "@/features/tutor/interaction-reflection";
import { SessionCandidates } from "@/features/anki/session-candidates";
import { DeleteSessionButton } from "./delete-session-button";
import { SessionPlanLink } from "@/features/plan/plan-links";
export function HistoryPage() {
  const { state, run } = useStore();
  const router = useRouter();
  const [filter, setFilter] = useState("articles");
  const [modeFilter, setModeFilter] = useState<"ALL" | LearningType>("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  if (!state) return null;
  const commonSessions = filterLearningSessions(
    state.learningSessions,
    modeFilter,
    search,
  );
  const allowedIds = new Set(commonSessions.map((s) => s.id));
  const hasVisibleRecord = commonSessions.some((s) => {
    const items = state.items.filter((i) => i.sessionId === s.id);
    if (filter === "questions")
      return s.type === "READING"
        ? items.some((i) => i.answer || i.companion)
        : state.companionInteractions.some((i) => i.sessionId === s.id);
    if (filter === "expressions")
      return (
        state.ankiCandidates.some((c) => c.sourceSessionId === s.id) ||
        state.cards.some((c) => c.sessionId === s.id) ||
        state.learnedExpressions.some((e) => e.sessionId === s.id)
      );
    if (filter === "mistakes")
      return (
        s.needReview ||
        items.some(
          (i) => i.needsReview || i.attempts.some((a) => !a.correct),
        ) ||
        state.listeningDetails.find((d) => d.sessionId === s.id)?.recall
          ?.needReview
      );
    return true;
  });
  const sessions = state.sessions.filter(
    (s) =>
      allowedIds.has(s.id) &&
      state.articles
        .find((a) => a.id === s.articleId)
        ?.title.toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function open(sessionId: string, itemId: string) {
    try {
      await run({ type: "activate", sessionId, itemId });
      router.push(`/learn/${sessionId}`);
    } catch {}
  }
  return (
    <div className="page">
      {notice && <p role="status">{notice}</p>}
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR LEARNING JOURNEY</div>
          <h1>학습 기록</h1>
          <p>읽었던 문장, 떠올렸던 생각. 나의 학습을 다시 만나 보세요.</p>
        </div>
        <Link href="/learn" className="button">
          <BookOpen size={17} />
          다시 읽기
        </Link>
      </div>
      <div className="filters learning-mode-filter" aria-label="학습 모드 필터">
        {(["ALL", "READING", "LISTENING"] as const).map((mode) => (
          <button
            key={mode}
            className={modeFilter === mode ? "active" : ""}
            aria-pressed={modeFilter === mode}
            onClick={() => {
              setModeFilter(mode);
              setFilter("articles");
            }}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="history-controls">
        <div className="filters" aria-label="기록 필터">
          {[
            { id: "articles", label: "읽은 글", Icon: BookOpen },
            { id: "questions", label: "질문", Icon: MessageSquare },
            { id: "expressions", label: "저장한 표현", Icon: Bookmark },
            { id: "mistakes", label: "확인 필요", Icon: CircleAlert },
          ].map(({ id, label, Icon }) => (
            <button
              aria-pressed={filter === id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
              key={id}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <label className="search-input compact">
          <Search size={17} />
          <input
            aria-label="기록의 글 제목 검색"
            placeholder="글 제목 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="storage-note">
        이 기록은 설정된 학습 저장소에 저장돼요. Wikipedia 원문 기록과 이전 시연
        자료를 구분해 표시합니다.
      </p>
      {commonSessions
        .filter((s) => s.type === "LISTENING")
        .map((s) => {
          const details = state.listeningDetails.find(
            (d) => d.sessionId === s.id,
          )!;
          const expressions = state.learnedExpressions.filter(
            (e) => e.sessionId === s.id,
          );
          const interactions = state.companionInteractions.filter(
            (i) => i.sessionId === s.id,
          );
          if (
            (filter === "mistakes" &&
              !details.recall?.needReview &&
              !s.needReview) ||
            (filter === "expressions" &&
              !expressions.length &&
              !state.ankiCandidates.some((c) => c.sourceSessionId === s.id)) ||
            (filter === "questions" && !interactions.length)
          )
            return null;
          return (
            <section className="history-group" key={s.id}>
              <div className="history-date">
                {new Date(s.startedAt).toLocaleString("ko-KR")} · LISTENING ·
                Level {s.level === "other" ? "기타" : s.level}
              </div>
              <div className="history-card listening-history">
                <h2>{s.userProvidedTitle}</h2>
                <SessionPlanLink sessionId={s.id} />
                <DeleteSessionButton
                  sessionId={s.id}
                  sessionType="LISTENING"
                  title={s.userProvidedTitle}
                  onDeleted={() =>
                    setNotice(
                      "학습 기록을 삭제했어요. Anki 카드와 내보내기 이력은 보존했습니다.",
                    )
                  }
                />
                <SessionCandidates sessionId={s.id} />
                <p>
                  {s.completedAt ? "학습 마침" : "학습 중"} · {s.sourceType}
                </p>
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {s.sourceUrl}
                </a>
                <ListeningReflection session={s} details={details} />
                {s.notes && (
                  <p className="preserve-lines">학습 메모: {s.notes}</p>
                )}
                <InteractionHistory sessionId={s.id} />
                <Link className="button" href={`/listening/${s.id}`}>
                  Listening 기록 열기
                </Link>
              </div>
            </section>
          );
        })}
      {sessions.map((s) => {
        const article = state.articles.find((a) => a.id === s.articleId)!;
        const items = state.items.filter(
          (i) => i.sessionId === s.id && (i.answer || i.companion),
        );
        const mistakes = items.filter(
          (i) => i.needsReview || i.attempts.some((a) => !a.correct),
        );
        const common = state.learningSessions.find((c) => c.id === s.id);
        const visible = filter === "mistakes" ? mistakes : items;
        const cards = state.cards.filter((c) => c.sessionId === s.id);
        if (
          (filter === "mistakes" && !mistakes.length && !common?.needReview) ||
          (filter === "questions" && !items.length) ||
          (filter === "expressions" &&
            !cards.length &&
            !state.ankiCandidates.some((c) => c.sourceSessionId === s.id))
        )
          return null;
        return (
          <section className="history-group" key={s.id}>
            <div className="history-date">
              {new Intl.DateTimeFormat("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "Asia/Seoul",
              }).format(new Date(s.createdAt))}
              {" · READING · "}
              {common?.duration == null
                ? "학습 중 / 시간 미기록"
                : `${Math.floor(common.duration / 60)}분`}
              <span>
                {article.provider === "simple_wikipedia"
                  ? "WIKIPEDIA"
                  : "MOCK SESSION"}
              </span>
            </div>
            <div className="history-card">
              <SessionPlanLink sessionId={s.id} />
              <SessionCandidates sessionId={s.id} />
              <DeleteSessionButton
                sessionId={s.id}
                sessionType="READING"
                title={article.title}
                onDeleted={() =>
                  setNotice(
                    "학습 기록을 삭제했어요. Anki 카드와 내보내기 이력은 보존했습니다.",
                  )
                }
              />
              <div className="history-card-header">
                <div className="article-icon">
                  <BookOpen size={22} />
                </div>
                <div>
                  <h2 lang="en">
                    {article.title}{" "}
                    <span
                      className={`badge ${s.status === "completed" ? "success" : ""}`}
                    >
                      {s.status === "completed" ? "학습 마침" : "학습 중"}
                    </span>
                  </h2>
                  <p>
                    질문 {items.length}개 · 표현 {cards.length}개 · 첫 시도 정답{" "}
                    {items.filter((i) => i.attempts[0]?.correct).length}/
                    {items.filter((i) => i.attempts.length).length}
                  </p>
                </div>
                <Link className="text-button" href={`/learn/${s.id}`}>
                  이어서 보기
                  <ArrowRight size={16} />
                </Link>
              </div>
              {filter === "expressions" ? (
                <div className="history-expression-grid">
                  {cards.map((c) => (
                    <Link
                      key={c.id}
                      href={`/cards?card=${c.id}`}
                      className="expression-card"
                    >
                      <h3>{c.expression}</h3>
                      <p>{c.meaning}</p>
                      <span className="badge">
                        {c.status === "confirmed" ? "확정" : "초안"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                visible.map((item) => (
                  <div className="history-item" key={item.id}>
                    <button
                      className="history-item-toggle"
                      onClick={() =>
                        setExpanded(expanded === item.id ? null : item.id)
                      }
                      aria-expanded={expanded === item.id}
                    >
                      <span className="history-item-text">
                        <span lang="en">{item.quote}</span>
                        <small>
                          {item.companion
                            ? companionQuestions[item.companion.questionType]
                            : item.question}
                        </small>
                      </span>
                      <span
                        className={`badge ${item.needsReview || item.attempts.some((a) => !a.correct) ? "warning" : "success"}`}
                      >
                        {item.needsReview
                          ? "검토 필요"
                          : item.attempts.at(-1)?.correct
                            ? "기억 확인 정답"
                            : item.attempts.length
                              ? "확인 필요"
                              : item.answer
                                ? "설명 확인"
                                : "프롬프트 준비"}
                      </span>
                      <ChevronDown size={16} />
                    </button>
                    {expanded === item.id && (
                      <div className="history-detail">
                        {item.companion && (
                          <>
                            <label>ChatGPT Companion</label>
                            <p>
                              {companionQuestions[item.companion.questionType]}
                              {item.companion.customQuestion &&
                                ` · ${item.companion.customQuestion}`}
                            </p>
                            <p>
                              프롬프트 준비 기록이에요. ChatGPT에서 실제로
                              전송했는지와 답변 내용은 앱이 확인하지 않아요.
                            </p>
                            {item.companion.editedPrompt && (
                              <pre className="companion-history-prompt">
                                {item.companion.editedPrompt}
                              </pre>
                            )}
                          </>
                        )}
                        {item.answer && (
                          <>
                            <label>내 추측</label>
                            <p>
                              {item.unknown
                                ? "아직 모르겠어요"
                                : item.submittedGuess}
                            </p>
                            <label>
                              {item.answer.provider === "mock"
                                ? "Mock 설명"
                                : "저장된 AI 설명"}
                            </label>
                            <p>{item.answer.explanationKo}</p>
                          </>
                        )}
                        {item.attempts.map((attempt, index) => (
                          <p key={attempt.id}>
                            {index + 1}차 시도:{" "}
                            {item.quiz?.options.find(
                              (o) => o.id === attempt.selectedId,
                            )?.text ?? "모르겠어요"}{" "}
                            · {attempt.correct ? "정답" : "확인 필요"}
                          </p>
                        ))}
                        {item.production && (
                          <>
                            <label>직접 쓴 문장</label>
                            <p lang="en">{item.production}</p>
                          </>
                        )}
                        <button
                          className="soft-button"
                          onClick={() => void open(s.id, item.id)}
                        >
                          원문과 튜터에서 보기
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
              {!visible.length && filter !== "expressions" && (
                <p className="empty-inline">
                  아직 질문이 없어요. 읽기를 이어가며 표현 하나를 선택해 보세요.
                </p>
              )}
              <details className="reading-session-detail">
                <summary>공통 학습 기록 · Companion 기록</summary>
                <p>
                  READING ·{" "}
                  {
                    state.learningSessions.find((c) => c.id === s.id)
                      ?.sourceType
                  }
                </p>
                <p>
                  학습 시간:{" "}
                  {state.learningSessions.find((c) => c.id === s.id)
                    ?.duration === null
                    ? "이전 기록에는 시간 정보가 없어요."
                    : `${Math.floor((state.learningSessions.find((c) => c.id === s.id)?.duration ?? 0) / 60)}분 (시작~완료 경과 시간)`}
                </p>
                <p>
                  {state.learningSessions.find((c) => c.id === s.id)?.notes}
                </p>
                <InteractionHistory sessionId={s.id} />
              </details>
            </div>
          </section>
        );
      })}
      {!hasVisibleRecord && (
        <div className="empty-state">
          <BookOpen />
          <h2>표시할 기록이 없어요</h2>
          <p>다른 필터를 선택하거나 새로운 글로 학습을 시작해 보세요.</p>
          <Link className="button primary" href="/">
            학습 시작
          </Link>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Search,
  Bookmark,
  MessageSquare,
  Mountain,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/components/provider";
import type { Article } from "@/domain/types";
import { DashboardStats } from "@/features/learning/dashboard-stats";
import { ReviewHome } from "@/features/review/review-hub";
import { ContinueLearning } from "@/features/learning/continue-learning";
export function HomePage() {
  const { state, run, busy } = useStore();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Article[] | null>(null);
  if (!state) return null;
  const featured = state.articles[0];
  const recent = state.sessions.slice(0, 3);
  const expressions = state.ankiCandidates.slice(0, 3);
  async function start(articleId: string) {
    try {
      const result = await run({ type: "start", articleId });
      router.push(`/learn/${result.id}`);
    } catch {}
  }
  async function loadArticle(value: string) {
    setLoading(true);
    setError("");
    setCandidates(null);
    try {
      const r = await fetch("/api/articles/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (data.status === "resolved") await start(data.article.id);
      else {
        setCandidates(data.candidates);
        if (!data.candidates.length)
          setError("일치하는 문서가 없어요. 영어 제목의 철자를 확인해 주세요.");
      }
    } catch (e) {
      setError(
        e instanceof Error &&
          (e.name === "TimeoutError" || e.name === "AbortError")
          ? "응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요."
          : e instanceof TypeError
            ? "서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요."
            : e instanceof Error
              ? e.message
              : "자료를 불러오지 못했어요.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="page home-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR DAILY READING</div>
          <h1>오늘의 학습</h1>
          <p>관심 있는 글을 읽고, 하나씩 내 영어로 만들어 가세요.</p>
        </div>
        <span className="today">
          {new Intl.DateTimeFormat("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "long",
            timeZone: "Asia/Seoul",
          }).format(new Date())}
        </span>
      </div>
      <ContinueLearning />
      <form
        className="article-search"
        onSubmit={(e) => {
          e.preventDefault();
          void loadArticle(input);
        }}
      >
        <label className="search-input">
          <Search size={19} />
          <input
            aria-label="Wikipedia 제목 또는 URL"
            placeholder="Simple English Wikipedia 제목 또는 URL을 입력하세요"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2048}
          />
        </label>
        <button className="primary" disabled={loading || busy || !input.trim()}>
          {loading ? "불러오는 중…" : "글 불러오기"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="button-row spaced">
        <Link className="button soft-button" href="/listening">
          Start Listening
        </Link>
        <Link className="button" href="/cards">
          Anki Candidates (
          {state.ankiCandidates.filter((c) => c.status === "CANDIDATE").length})
        </Link>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="storage-note" role="status">
          Wikipedia에서 본문과 출처를 가져오는 중이에요. 최대 15초 정도 걸릴 수
          있어요.
        </p>
      )}
      {candidates && candidates.length > 0 && (
        <div className="candidate-list">
          어떤 글을 읽을까요?
          {candidates.map((a) => (
            <button
              key={a.id}
              disabled={loading || busy}
              onClick={() => void loadArticle(a.title)}
            >
              {a.title}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      )}
      <div className="home-grid">
        <section className="featured-card">
          <div className="featured-content">
            <div className="eyebrow">
              <span className="mini-line" /> 추천 자료{" "}
              <span className="badge">WIKIPEDIA</span>
            </div>
            <div className="featured-title">
              <div>
                <h2 lang="en">{featured.title}</h2>
                <p>{featured.description}</p>
              </div>
              <Mountain className="mountain-icon" strokeWidth={0.9} />
            </div>
            <div className="meta-row">
              <span>
                <BookOpen size={14} /> Simple English Wikipedia 원문
              </span>
              <span>
                <Clock3 size={14} /> 약 5분 읽기
              </span>
            </div>
          </div>
          <div className="featured-footer">
            <span>읽기 → 내 추측 → 기억 확인</span>
            <button
              className="primary"
              onClick={() => void loadArticle(featured.title)}
              disabled={busy || loading}
            >
              읽기 시작하기
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <aside className="stats-card">
          <div>
            <span className="stat-label">
              <Bookmark size={17} /> 저장한 표현
            </span>
            <strong>
              {state.ankiCandidates.length}
              <small>개</small>
            </strong>
            <Link href="/cards">
              표현 다시 보기 <ArrowUpRight size={15} />
            </Link>
          </div>
          <div>
            <span className="stat-label">
              <MessageSquare size={17} /> 남긴 질문
            </span>
            <strong>
              {state.companionInteractions.length}
              <small>개</small>
            </strong>
            <span className="muted text-xs">직접 남긴 학습 질문</span>
          </div>
        </aside>
      </div>
      <ReviewHome />
      <DashboardStats />
      <details className="home-section">
        <summary>최근 Reading과 Anki 표현 더 보기</summary>
        <section className="home-section">
          <div className="section-heading">
            <h2>최근에 공부한 글</h2>
            <Link href="/history">
              학습 기록 보기 <ArrowRight size={15} />
            </Link>
          </div>
          <div className="recent-list">
            {recent.length ? (
              recent.map((s) => {
                const a = state.articles.find((a) => a.id === s.articleId)!;
                const n = state.items.filter(
                  (i) => i.sessionId === s.id && (i.answer || i.companion),
                ).length;
                return (
                  <Link
                    className="recent-row"
                    key={s.id}
                    href={`/learn/${s.id}`}
                  >
                    <div className="article-icon">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h3 lang="en">
                        {a.title}
                        <span
                          className={`badge ${s.status === "completed" ? "success" : ""}`}
                        >
                          {s.status === "completed" ? "학습 마침" : "학습 중"}
                        </span>
                      </h3>
                      <p>
                        {a.topic} <span>·</span> 질문 {n}개
                      </p>
                    </div>
                    <span className="row-action">
                      {s.status === "completed" ? "다시 보기" : "이어 읽기"}
                      <ChevronRight size={17} />
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="empty-state">
                첫 글을 읽으면 이곳에 기록이 쌓여요.
              </div>
            )}
          </div>
        </section>
        <section className="home-section">
          <div className="section-heading">
            <h2>다시 기억할 표현</h2>
            <Link href="/cards">
              전체 표현 <ArrowRight size={15} />
            </Link>
          </div>
          <div className="expression-grid">
            {expressions.map((c) => (
              <Link
                className="expression-card"
                key={c.id}
                href={`/cards?candidate=${encodeURIComponent(c.id)}`}
              >
                <Bookmark size={17} />
                <h3 lang="en">{c.expression}</h3>
                <p>{c.meaning}</p>
                <div>
                  <span>
                    {c.sourceTitle} · {c.sourceType}
                  </span>
                  <ArrowUpRight size={15} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </details>
      <div className="gentle-note">
        <Sparkles size={17} />
        <span>
          한 번에 표현 1~3개면 충분해요. 설명을 읽은 뒤, 잠깐 가리고 떠올려
          보세요.
        </span>
      </div>
    </div>
  );
}

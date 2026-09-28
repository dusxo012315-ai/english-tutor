"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { canPrintArticle } from "@/domain/study-plan";
import {
  ArrowLeft,
  ArrowUpRight,
  Minus,
  Plus,
  MessageSquare,
  Check,
  BookOpen,
} from "lucide-react";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import { TutorPanel } from "@/features/tutor/tutor-panel";
import { CompanionPanel } from "@/features/tutor/companion-panel";
import { SessionNotes } from "@/features/listening/listening-session";
import { NeedReviewToggle } from "@/features/review/review-hub";
export function ReadingPage({ sessionId }: { sessionId: string }) {
  const { state, run, busy } = useStore();
  const [pane, setPane] = useState<"read" | "tutor">("read");
  const [summary, setSummary] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selection, setSelection] = useState<{
    blockId: string;
    start: number;
    end: number;
    x: number;
    y: number;
  } | null>(null);
  const restored = useRef(false);
  const session = state?.sessions.find((s) => s.id === sessionId);
  const article = state?.articles.find((a) => a.id === session?.articleId);
  const item = state?.items.find((i) => i.id === session?.activeItemId);
  useEffect(() => {
    if (session && !restored.current) {
      restored.current = true;
      setPane(session.pane);
      if (session.cursor)
        requestAnimationFrame(() =>
          document
            .getElementById(session.cursor)
            ?.scrollIntoView({ block: "center" }),
        );
    }
  }, [session]);
  useEffect(() => {
    const close = () => setSelection(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", key);
    };
  }, []);
  if (!state) return null;
  if (!session || !article)
    return (
      <div className="empty-state">
        <h1>학습 기록을 찾을 수 없어요</h1>
        <Link href="/" className="button primary">
          학습 홈으로
        </Link>
      </div>
    );
  const currentSession = session;
  const currentArticle = article;
  async function select(blockId: string, start: number, end: number) {
    try {
      await run({ type: "select", sessionId, blockId, start, end });
      setPane("tutor");
      setSelection(null);
    } catch {}
  }
  function capture() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const startElement = (
      range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : (range.startContainer as Element)
    )?.closest("[data-block]");
    const endElement = (
      range.endContainer.nodeType === 3
        ? range.endContainer.parentElement
        : (range.endContainer as Element)
    )?.closest("[data-block]");
    if (!startElement || startElement !== endElement) {
      setSelectionError("한 문단 안에서 단어나 문장을 선택해 주세요.");
      return;
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(startElement);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    if (end - start > 1200) {
      setSelectionError(
        "선택한 내용이 1,200자를 넘어요. 더 짧게 선택해 주세요.",
      );
      setSelection(null);
      return;
    }
    setSelectionError("");
    const rect = range.getBoundingClientRect();
    setSelection({
      blockId: startElement.getAttribute("data-block")!,
      start,
      end,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 245)),
      y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 65)),
    });
  }
  function switchPane(next: "read" | "tutor") {
    setPane(next);
    void run({
      type: "cursor",
      sessionId,
      blockId: currentSession.cursor,
      pane: next,
    }).catch(() => {});
  }
  const sessionItems = state.items.filter((i) => i.sessionId === sessionId);
  return (
    <>
      <div className="mobile-tabs">
        <button
          className={pane === "read" ? "active" : ""}
          onClick={() => switchPane("read")}
        >
          <BookOpen size={17} />
          원문 읽기
        </button>
        <button
          className={pane === "tutor" ? "active" : ""}
          onClick={() => switchPane("tutor")}
        >
          <MessageSquare size={17} />
          AI Tutor{item && <span className="notification-dot" />}
        </button>
      </div>
      <div className="reader-shell" data-mobile={pane}>
        <article className="reader-main">
          <div className="reader-toolbar">
            <Link href="/">
              <ArrowLeft size={15} /> 학습 홈
            </Link>
            <div className="font-tools">
              <span>글자 크기</span>
              <button
                className="icon-button"
                aria-label="글자 크기 줄이기"
                disabled={state.fontSize <= 18 || busy}
                onClick={() =>
                  void run({ type: "font", value: state.fontSize - 1 }).catch(
                    () => {},
                  )
                }
              >
                <Minus size={15} />
              </button>
              <span>{state.fontSize}</span>
              <button
                className="icon-button"
                aria-label="글자 크기 늘리기"
                disabled={state.fontSize >= 26 || busy}
                onClick={() =>
                  void run({ type: "font", value: state.fontSize + 1 }).catch(
                    () => {},
                  )
                }
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <header className="reading-header">
            <div className="eyebrow">
              SIMPLE ENGLISH WIKIPEDIA{" "}
              <span className="badge">
                {article.provider === "simple_wikipedia" ? "원문" : "MOCK"}
              </span>
            </div>
            <h1 lang="en">{article.title}</h1>
            <div className="meta-row">
              {canPrintArticle(article) && (
                <Link href={`/print/${article.id}`} target="_blank">
                  Print / Save as PDF
                </Link>
              )}
              <span>{article.topic}</span>
              <a href={article.sourceUrl} target="_blank" rel="noreferrer">
                원문 보기 <ArrowUpRight size={13} />
              </a>
              <span>
                {article.attribution ? "CC BY-SA 4.0" : "창작 시연 자료"}
              </span>
            </div>
          </header>
          <div className="reading-hint">
            <MessageSquare size={17} />
            <span>
              궁금한 표현을 선택하고, 학습 프롬프트로 ChatGPT에서 질문해 보세요.
            </span>
          </div>
          {article.omissions && article.omissions.length > 0 && (
            <p className="storage-note">
              읽기에 집중할 수 있도록 {article.omissions.join(", ")}를
              생략했어요. 전체 내용은 원문에서 확인할 수 있어요.
            </p>
          )}
          {selectionError && (
            <p className="inline-error" role="alert">
              {selectionError}
            </p>
          )}
          <div
            className="article-text"
            lang="en"
            style={{ fontSize: state.fontSize }}
            onMouseUp={capture}
            onKeyUp={capture}
            onTouchEnd={() => setTimeout(capture, 0)}
          >
            {article.blocks.map((block, index) => {
              const phrase =
                article.provider === "simple_wikipedia"
                  ? undefined
                  : [
                      "home to",
                      "were formed",
                      "depend on",
                      "able to",
                      "play an important role",
                    ].find((p) => block.text.includes(p));
              const start = phrase ? block.text.indexOf(phrase) : -1;
              return (
                <section key={block.id} id={block.id}>
                  {block.heading && (
                    <h2>
                      <span>
                        {String(
                          article.blocks
                            .slice(0, index + 1)
                            .filter((b) => b.heading).length,
                        ).padStart(2, "0")}
                      </span>
                      {block.heading}
                    </h2>
                  )}
                  <p
                    data-block={block.id}
                    data-list={block.kind === "list_item" ? "true" : undefined}
                  >
                    {phrase ? (
                      <>
                        {block.text.slice(0, start)}
                        <mark>
                          <button
                            title="이 표현 질문하기"
                            onClick={() => {
                              if (window.getSelection()?.isCollapsed !== false)
                                void select(
                                  block.id,
                                  start,
                                  start + phrase.length,
                                );
                            }}
                          >
                            {phrase}
                          </button>
                        </mark>
                        {block.text.slice(start + phrase.length)}
                      </>
                    ) : (
                      block.text
                    )}
                  </p>
                  <button
                    className="paragraph-question"
                    lang="ko"
                    onClick={() => {
                      if (block.text.length > 1200)
                        setSelectionError(
                          "이 문단은 길어요. 원하는 문장을 드래그해 1,200자 이내로 선택해 주세요.",
                        );
                      else void select(block.id, 0, block.text.length);
                    }}
                  >
                    <Plus size={13} />이 문단에서 질문
                  </button>
                </section>
              );
            })}
          </div>
          <div className="source-note">
            <strong>
              {article.attribution
                ? "원문 출처와 이용 조건"
                : "이 본문은 Mock 자료입니다"}
            </strong>
            <p>{article.notice}</p>
            <a href={article.sourceUrl} target="_blank" rel="noreferrer">
              Wikipedia 원문 ↗
            </a>
            <span> · </span>
            <a
              href={
                article.attribution?.historyUrl ??
                `https://simple.wikipedia.org/w/index.php?title=${encodeURIComponent(article.title)}&action=history`
              }
              target="_blank"
              rel="noreferrer"
            >
              편집 이력 ↗
            </a>
            {article.attribution ? (
              <>
                <p>{article.attribution.creatorLabel}</p>
                <p>
                  <a
                    href={article.attribution.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {article.attribution.licenseName} ↗
                  </a>{" "}
                  ·{" "}
                  <a
                    href={article.attribution.revisionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    저장한 판 {article.revisionId} ↗
                  </a>
                </p>
                <p>
                  가져온 시각:{" "}
                  {article.fetchedAt &&
                    new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Seoul",
                    }).format(new Date(article.fetchedAt))}
                </p>
                <p>변경 사항: {article.attribution.changes.join(" · ")}</p>
                {article.attribution.extraNotices.map((notice) => (
                  <p key={notice}>{notice}</p>
                ))}
              </>
            ) : (
              <p>
                창작 Mock 본문: CC0 1.0 · Wikipedia 원문을 불러오면 해당 문서의
                저작자와 라이선스가 표시됩니다.
              </p>
            )}
          </div>
          <NeedReviewToggle sessionId={sessionId} />
          {state.learningSessions.find((s) => s.id === sessionId) && (
            <SessionNotes
              session={state.learningSessions.find((s) => s.id === sessionId)!}
            />
          )}
          <div className="reader-end">
            <span>오늘 읽은 만큼, 충분해요.</span>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  await run({ type: "finish", sessionId });
                  setSummary(true);
                } catch {}
              }}
            >
              <Check size={16} />
              이번 학습 마치기
            </button>
          </div>
        </article>
        {state.tutor?.mode !== "mock" ? (
          <CompanionPanel
            key={item?.id ?? "empty"}
            item={item}
            article={article}
            sessionId={sessionId}
            onClear={() => {
              setPane("read");
              setSelection(null);
            }}
            onSource={() => {
              switchPane("read");
              requestAnimationFrame(() =>
                document
                  .getElementById(item?.blockId ?? currentArticle.blocks[0].id)
                  ?.scrollIntoView({ block: "center" }),
              );
            }}
          />
        ) : (
          <TutorPanel
            key={item?.id ?? "empty"}
            item={item}
            onSource={() => {
              switchPane("read");
              requestAnimationFrame(() =>
                document
                  .getElementById(item?.blockId ?? currentArticle.blocks[0].id)
                  ?.scrollIntoView({ block: "center" }),
              );
            }}
          />
        )}
      </div>
      {selection && (
        <div
          className="selection-menu"
          style={{ left: selection.x, top: selection.y }}
        >
          <button
            disabled={busy}
            onClick={() =>
              void select(selection.blockId, selection.start, selection.end)
            }
          >
            <MessageSquare size={16} />
            선택한 부분 질문하기
          </button>
        </div>
      )}
      {summary && (
        <Dialog title="오늘도 한 걸음 더" onClose={() => setSummary(false)}>
          <div className="summary-icon">
            <Check />
          </div>
          <h2>{article.title} 학습을 마쳤어요</h2>
          <p className="muted">
            활동 기록을 저장했어요. 학습 완료는 완독이나 숙달을 의미하지 않아요.
          </p>
          <div className="summary-stats">
            <div>
              <strong>
                {sessionItems.filter((i) => i.answer || i.companion).length}
              </strong>
              질문
            </div>
            <div>
              <strong>
                {sessionItems.filter((i) => i.attempts.length).length}
              </strong>
              기억 확인
            </div>
            <div>
              <strong>
                {sessionItems.filter((i) => i.productionSaved).length}
              </strong>
              직접 쓰기
            </div>
            <div>
              <strong>
                {state.cards.filter((c) => c.sessionId === sessionId).length}
              </strong>
              카드
            </div>
          </div>
          <div className="button-row">
            <Link className="button primary" href="/cards">
              카드 검토하기
            </Link>
            <Link className="button" href="/">
              다음 학습
            </Link>
          </div>
        </Dialog>
      )}
    </>
  );
}

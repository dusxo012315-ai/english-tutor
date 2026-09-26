"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Sparkles,
  RotateCcw,
  ArrowLeft,
  BookmarkPlus,
} from "lucide-react";
import { useStore } from "@/components/provider";
import type { Article, LearningItem } from "@/domain/types";
import type { Action } from "@/domain/schemas";
import { buildTutorContext } from "@/domain/selection";
import {
  companionProvider,
  companionQuestions,
  type CompanionDraft,
  type CompanionQuestionType,
} from "@/domain/tutor-provider";
import { copyPrompt, openChatGPT, CHATGPT_URL } from "./companion-browser";
import { InteractionReflection } from "./interaction-reflection";
import { useDraft, DraftStatus } from "@/components/use-draft";

export function CompanionPanel({
  item,
  article,
  sessionId,
  onSource,
  onClear,
}: {
  item?: LearningItem;
  article: Article;
  sessionId: string;
  onSource: () => void;
  onClear: () => void;
}) {
  const { run, busy, error, state } = useStore();
  const interactionRef = useRef<{ prompt: string; id: string } | null>(null);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const router = useRouter();
  const [draft, setDraft, promptDraft] = useDraft<CompanionDraft>(
    `prompt:${sessionId}:${item?.id ?? "empty"}`,
    item?.companion ?? {
      questionType: "translation",
      customQuestion: "",
      editedPrompt: null,
    },
  );
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [meaning, setMeaning] = useState("");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Action | null>(
    item && promptDraft.restored
      ? { type: "companionDraft", itemId: item.id, ...draft }
      : null,
  );
  const acting = useRef(false);
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) {
      const action = pending.current;
      await run(action);
      if (pending.current === action) {
        pending.current = null;
        setSaved(true);
        promptDraft.clear();
      }
    }
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void run(pending.current).catch(() => {});
    };
  }, [run]);
  function update(values: Partial<CompanionDraft>) {
    if (!item) return;
    const next = { ...draft, ...values };
    setDraft(next);
    setMessage("");
    setCopyError("");
    setSaved(false);
    pending.current = { type: "companionDraft", itemId: item.id, ...next };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 400);
  }
  if (!item)
    return (
      <aside className="tutor">
        <header className="tutor-header">
          <div>
            <h2>
              <Sparkles size={19} /> AI Tutor
            </h2>
            <span className="badge">COMPANION</span>
          </div>
          <p>내 ChatGPT와 함께 읽기</p>
        </header>
        <div className="tutor-empty">
          <h3>어떤 문장이 궁금한가요?</h3>
          <p>
            본문에서 단어나 문장을 선택하면
            <br />
            ChatGPT에 붙여넣을 학습 프롬프트를 만들어요.
          </p>
          <p className="mock-disclaimer">
            API 키 없이 사용할 수 있어요. ChatGPT 로그인은 별도 창에서
            진행하세요.
          </p>
        </div>
      </aside>
    );
  const context =
    item.tutorContext ??
    buildTutorContext(article, item.blockId, item.start, item.end);
  const generated = companionProvider.prepare({
    context,
    questionType: draft.questionType,
    customQuestion: draft.customQuestion,
  }).prompt;
  const prompt = draft.editedPrompt ?? generated;
  const valid =
    !!prompt.trim() &&
    (draft.questionType !== "custom" ||
      !!draft.customQuestion.trim() ||
      draft.editedPrompt !== null);
  function open() {
    const opened = openChatGPT();
    setBlocked(!opened);
    void record(opened).catch(() => {});
    return opened;
  }
  async function record(opened = false) {
    if (!item) throw new Error("표현을 먼저 선택해 주세요.");
    await flush();
    const matching = state?.companionInteractions.find(
      (i) =>
        i.itemId === item.id &&
        i.generatedPrompt === prompt &&
        i.questionType === draft.questionType,
    );
    if (interactionRef.current?.prompt !== prompt)
      interactionRef.current = {
        prompt,
        id: matching && !matching.migrated ? matching.id : crypto.randomUUID(),
      };
    const id = interactionRef.current.id;
    await run({
      type: "recordReadingInteraction",
      interactionId: id,
      itemId: item.id,
      questionType: draft.questionType,
      generatedPrompt: prompt,
      chatOpened: opened,
    });
    setInteractionId(id);
    return id;
  }
  async function copy(andOpen: boolean) {
    if (acting.current || !valid) return;
    acting.current = true;
    setCopying(true);
    setCopyError("");
    setMessage("");
    try {
      await copyPrompt(prompt);
      if (andOpen) {
        const opened = open();
        setMessage(
          opened
            ? "프롬프트를 복사했어요. ChatGPT 창에서 붙여넣고 직접 전송해 주세요."
            : "프롬프트를 복사했어요. 팝업이 차단되었을 수 있어요. 아래 새 탭 링크를 눌러 주세요.",
        );
      } else {
        setMessage("프롬프트를 클립보드에 복사했어요.");
        await record(false);
      }
    } catch (e) {
      setCopyError(
        e instanceof Error
          ? e.message
          : "복사하지 못했어요. 프롬프트를 직접 복사해 주세요.",
      );
    } finally {
      acting.current = false;
      setCopying(false);
    }
  }
  return (
    <aside className="tutor companion">
      <header className="tutor-header">
        <div>
          <h2>
            <Sparkles size={19} /> AI Tutor
          </h2>
          <span className="badge">COMPANION</span>
        </div>
        <p>내 ChatGPT와 함께 읽기</p>
        <span className="tutor-save">
          {error
            ? "저장 오류 · 다시 시도 가능"
            : busy || !saved
              ? "저장 중…"
              : "학습 기록에 저장됨"}
        </span>
      </header>
      <div className="tutor-body">
        <div className="quote-label">
          선택한 텍스트
          <button onClick={onSource}>
            <ArrowLeft size={13} /> 원문으로
          </button>
        </div>
        <blockquote lang="en">{item.quote}</blockquote>
        <p className="companion-title">
          현재 글: <strong lang="en">{article.title}</strong>
        </p>
        <details className="tutor-context companion-context" open>
          <summary>전달된 원문 문맥 확인</summary>
          {context.context.map((b) => (
            <p key={b.blockId} lang="en" data-context-block={b.blockId}>
              {b.text}
            </p>
          ))}
          {context.contextTruncated && (
            <small>
              선택 구간을 포함해 주변 문맥을 6,000자 이내로 제한했어요.
            </small>
          )}
        </details>
        <label className="field-label" htmlFor="companion-type">
          질문 유형
        </label>
        <select
          id="companion-type"
          value={draft.questionType}
          disabled={draft.editedPrompt !== null}
          onChange={(e) =>
            update({ questionType: e.target.value as CompanionQuestionType })
          }
        >
          {Object.entries(companionQuestions).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        {draft.questionType === "custom" && (
          <>
            <label className="field-label spaced" htmlFor="companion-question">
              자유 질문
            </label>
            <textarea
              id="companion-question"
              maxLength={1000}
              value={draft.customQuestion}
              disabled={draft.editedPrompt !== null}
              onChange={(e) => update({ customQuestion: e.target.value })}
            />
          </>
        )}
        <div className="quote-label spaced">
          생성된 학습 프롬프트
          <button onClick={() => setEditing(!editing)}>
            {editing ? "수정 완료" : "프롬프트 수정"}
          </button>
        </div>
        <label className="sr-only" htmlFor="companion-prompt">
          학습용 프롬프트
        </label>
        <textarea
          className="companion-prompt"
          id="companion-prompt"
          rows={12}
          readOnly={!editing}
          maxLength={16000}
          value={prompt}
          onChange={(e) => update({ editedPrompt: e.target.value })}
        />
        <small>
          {prompt.length.toLocaleString()} / 16,000자 ·{" "}
          {draft.editedPrompt === null
            ? "질문 유형에 맞춰 자동 생성"
            : "직접 수정한 프롬프트"}
        </small>
        {draft.editedPrompt !== null && (
          <button
            className="text-button full-width"
            onClick={() => {
              update({ editedPrompt: null });
              setEditing(false);
            }}
          >
            자동 프롬프트로 되돌리기
          </button>
        )}
        <button
          className="primary full-width spaced"
          disabled={!valid || copying}
          onClick={() => void copy(true)}
        >
          <ExternalLink size={16} />
          {copying ? "복사 중…" : "ChatGPT에서 질문하기"}
        </button>
        <div className="button-row companion-actions">
          <button
            className="soft-button"
            disabled={!valid || copying}
            onClick={() => void copy(false)}
          >
            <Copy size={15} /> 프롬프트 복사
          </button>
          <button
            className="soft-button"
            disabled={copying}
            onClick={() => {
              setCopyError("");
              setMessage(
                open()
                  ? "ChatGPT 창을 열었어요. 복사한 프롬프트를 직접 붙여넣어 주세요."
                  : "팝업이 차단되었을 수 있어요. 아래 새 탭 링크를 눌러 주세요.",
              );
            }}
          >
            <ExternalLink size={15} /> ChatGPT 열기
          </button>
        </div>
        {message && (
          <p className="feedback-note" role="status">
            {message}
          </p>
        )}
        {copyError && (
          <p className="inline-error" role="alert">
            {copyError}
          </p>
        )}
        {blocked && (
          <a
            className="button soft-button full-width"
            href={CHATGPT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void record(true).catch(() => {});
            }}
          >
            ChatGPT를 새 탭으로 열기 ↗
          </a>
        )}
        <p className="mock-disclaimer">
          1. 프롬프트 복사 → 2. ChatGPT에 붙여넣기(Ctrl+V) → 3. 직접 전송
          <br />
          앱은 ChatGPT 입력창을 조작하거나 답변을 가져오지 않아요. 창 크기와 새
          탭 여부는 브라우저 설정에 따라 달라질 수 있어요.
        </p>
        <InteractionReflection
          draftKey={`${item.id}:${draft.questionType}`}
          sessionId={sessionId}
          selectedText={item.quote}
          key={`${item.id}-${draft.questionType}`}
          interaction={
            state?.companionInteractions.find(
              (i) =>
                i.id === interactionId &&
                i.generatedPrompt === prompt &&
                i.questionType === draft.questionType,
            ) ??
            state?.companionInteractions.find(
              (i) =>
                i.itemId === item.id &&
                i.generatedPrompt === prompt &&
                i.questionType === draft.questionType,
            )
          }
          ensureInteraction={() => record(false)}
        />
        <DraftStatus text={promptDraft.status} />
        {item.answer && (
          <details className="tutor-context">
            <summary>
              이전에 저장한 {item.answer.provider === "mock" ? "Mock" : "AI"}{" "}
              해설
            </summary>
            <p>{item.answer.translationKo}</p>
            <p>{item.answer.explanationKo}</p>
            {item.answer.examples.map((e) => (
              <p key={e.en}>
                {e.en}
                <br />
                {e.ko}
              </p>
            ))}
            <button
              className="soft-button"
              disabled={busy || item.needsReview}
              onClick={async () => {
                try {
                  await flush();
                  const result = await run({
                    type: "makeCard",
                    itemId: item.id,
                  });
                  if (result.id) router.push(`/cards?card=${result.id}`);
                } catch {}
              }}
            >
              기존 해설로 카드 만들기
            </button>
          </details>
        )}
        <details className="tutor-context">
          <summary>직접 정리해서 Anki 카드 만들기</summary>
          <p>
            ChatGPT에서 배운 뜻이나 예문을 직접 정리해 주세요. 선택한 원문이
            카드 앞면과 출처에 남아요.
          </p>
          <label className="field-label" htmlFor="companion-meaning">
            카드 뜻·설명
          </label>
          <textarea
            id="companion-meaning"
            value={meaning}
            maxLength={2000}
            onChange={(e) => setMeaning(e.target.value)}
          />
          <button
            className="soft-button"
            disabled={busy || !meaning.trim() || item.needsReview}
            onClick={async () => {
              try {
                await flush();
                const result = await run({
                  type: "manualCard",
                  itemId: item.id,
                  meaning,
                });
                if (result.id) router.push(`/cards?card=${result.id}`);
              } catch {}
            }}
          >
            <BookmarkPlus size={15} /> 카드 검토하기
          </button>
          <small>이미 카드가 있으면 기존 카드를 열어요.</small>
        </details>
        <button
          className="text-button full-width"
          disabled={busy || copying}
          onClick={async () => {
            try {
              await flush();
              await run({ type: "clearSelection", sessionId });
              window.getSelection()?.removeAllRanges();
              onClear();
            } catch {}
          }}
        >
          <RotateCcw size={14} /> 선택 내용 초기화
        </button>
        <small>학습 기록은 유지하고 현재 선택만 해제해요.</small>
        {error && (
          <div className="inline-error" role="alert">
            {error}
            {!saved && (
              <button onClick={() => void flush().catch(() => {})}>
                저장 다시 시도
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

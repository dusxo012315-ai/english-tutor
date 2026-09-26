"use client";
import { useRef, useState } from "react";
import { useStore } from "@/components/provider";
import {
  listeningPrompt,
  listeningQuestions,
  type LearningSession,
  type ListeningDetails,
  type ListeningQuestion,
} from "@/domain/learning";
import {
  copyPrompt,
  openChatGPT,
  CHATGPT_URL,
} from "@/features/tutor/companion-browser";
import { InteractionReflection } from "@/features/tutor/interaction-reflection";
import { useDraft } from "@/components/use-draft";
export function ListeningCompanion({
  session,
  details,
  summaryDraft,
}: {
  session: LearningSession;
  details: ListeningDetails;
  summaryDraft?: string | null;
}) {
  const { state, run, busy } = useStore();
  const [questionType, setQuestionType] = useDraft<ListeningQuestion>(
    `listening-question:${session.id}`,
    "missed",
  );
  // Deliberately component memory only: never sent to our server or browser storage.
  const [temporaryText, setTemporaryText] = useState("");
  const [status, setStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const current = useRef<{ key: string; id: string } | null>(null);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const prompt = listeningPrompt(
    session,
    details,
    questionType,
    temporaryText || "(임시 질문 텍스트 없음)",
    questionType === "summary" ? (summaryDraft ?? undefined) : undefined,
  );
  async function record(opened = false) {
    const key = JSON.stringify([
      questionType,
      temporaryText,
      details.stage,
      details.recall?.summary,
      details.round1?.summary,
      questionType === "summary" ? summaryDraft : null,
    ]);
    if (current.current?.key !== key)
      current.current = { key, id: crypto.randomUUID() };
    const id = current.current.id;
    await run({
      type: "recordListeningInteraction",
      sessionId: session.id,
      interactionId: id,
      questionType,
      chatOpened: opened,
      ...(questionType === "summary" && summaryDraft != null
        ? { userSummary: summaryDraft }
        : {}),
    });
    setInteractionId(id);
    return id;
  }
  async function copy(andOpen: boolean) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    try {
      await copyPrompt(prompt);
      const opened = andOpen ? openChatGPT() : false;
      if (andOpen) setBlocked(!opened);
      setStatus(
        andOpen
          ? opened
            ? "복사했어요. ChatGPT에서 직접 붙여넣고 전송하세요."
            : "복사했어요. 팝업이 차단되었다면 아래 새 탭 링크를 눌러 주세요."
          : "프롬프트를 복사했어요.",
      );
      await record(opened);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  return (
    <aside className="tutor companion listening-tutor">
      <header className="tutor-header">
        <h2>ChatGPT Companion</h2>
        <p>Listening · {details.stage}</p>
      </header>
      <div className="tutor-body">
        <label className="field-label" htmlFor="listening-question">
          Listening 질문 유형
        </label>
        <select
          id="listening-question"
          value={questionType}
          onChange={(e) => {
            setQuestionType(e.target.value as ListeningQuestion);
            setInteractionId(null);
            setStatus("");
          }}
        >
          {Object.entries(listeningQuestions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="field-label spaced" htmlFor="temporary-question">
          임시 질문 텍스트
        </label>
        <textarea
          id="temporary-question"
          maxLength={1200}
          value={temporaryText}
          onChange={(e) => {
            setTemporaryText(e.target.value);
            setInteractionId(null);
            setStatus("");
          }}
          placeholder="궁금한 짧은 문장·표현 또는 자유 질문"
        />
        <p className="storage-note">
          프롬프트 복사에만 사용하며 서버·DB·브라우저 저장소에 보내지 않아요.
          라운드 이동·새로고침 시 사라집니다. 원문 전체를 붙여 넣지 마세요.
        </p>
        <label className="field-label" htmlFor="listening-prompt">
          Listening 학습 프롬프트
        </label>
        <textarea
          id="listening-prompt"
          className="companion-prompt"
          value={prompt}
          readOnly
          rows={10}
        />
        <button
          className="primary full-width"
          disabled={pending || busy}
          onClick={() => void copy(true)}
        >
          ChatGPT에서 질문하기
        </button>
        <div className="button-row companion-actions">
          <button
            className="soft-button"
            disabled={pending || busy}
            onClick={() => void copy(false)}
          >
            프롬프트 복사
          </button>
          <button
            className="soft-button"
            disabled={pending || busy}
            onClick={() => {
              const opened = openChatGPT();
              setBlocked(!opened);
              setStatus(
                opened
                  ? "ChatGPT 창을 열었어요. 직접 붙여넣어 주세요."
                  : "아래 새 탭 링크를 눌러 주세요.",
              );
              void record(opened).catch(() => {});
            }}
          >
            ChatGPT 열기
          </button>
        </div>
        {blocked && (
          <a
            className="button"
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
        {status && <p role="status">{status}</p>}
        <InteractionReflection
          draftKey={`${session.id}:${questionType}`}
          sessionId={session.id}
          key={questionType}
          interaction={
            state?.companionInteractions.find((i) => i.id === interactionId) ??
            (!temporaryText
              ? state?.companionInteractions.find(
                  (i) =>
                    i.sessionId === session.id &&
                    i.questionType === questionType &&
                    i.stage === details.stage,
                )
              : undefined)
          }
          ensureInteraction={() => record(false)}
        />
      </div>
    </aside>
  );
}

"use client";
import { useState } from "react";
import { useStore } from "@/components/provider";
import type { CompanionInteraction } from "@/domain/learning";
import { QuickAdd } from "@/features/anki/quick-add";
import { useDraft, DraftStatus } from "@/components/use-draft";
export function InteractionReflection({
  interaction,
  ensureInteraction,
  sessionId,
  selectedText = "",
  draftKey,
}: {
  interaction?: CompanionInteraction;
  ensureInteraction: () => Promise<string>;
  sessionId?: string;
  selectedText?: string;
  draftKey: string;
}) {
  const { run } = useStore();
  const [saving, setSaving] = useState(false);
  const [takeaway, setTakeaway, takeawayDraft] = useDraft(
    `takeaway:${draftKey}`,
    interaction?.userTakeaway ?? "",
  );
  const [understanding, setUnderstanding, understandingDraft] = useDraft<
    CompanionInteraction["userUnderstanding"]
  >(`understanding:${draftKey}`, interaction?.userUnderstanding ?? null);
  const [explanation, setExplanation, explanationDraft] = useDraft(
    `explanation:${draftKey}`,
    interaction?.pastedExplanation ?? "",
  );
  const [saved, setSaved] = useState(false);
  return (
    <section className="learning-reflection">
      <h3>What I learned</h3>
      <label className="field-label" htmlFor="takeaway">
        내가 배운 핵심 내용
      </label>
      <textarea
        id="takeaway"
        disabled={saving}
        maxLength={1000}
        value={takeaway}
        placeholder="예: were formed는 과거 수동태"
        onChange={(e) => {
          setTakeaway(e.target.value);
          setSaved(false);
        }}
      />
      <label className="field-label" htmlFor="understanding">
        내 이해 정도
      </label>
      <select
        id="understanding"
        disabled={saving}
        value={understanding ?? ""}
        onChange={(e) => {
          setUnderstanding(
            (e.target.value ||
              null) as CompanionInteraction["userUnderstanding"],
          );
          setSaved(false);
        }}
      >
        <option value="">선택하지 않음</option>
        <option value="NOT_YET">아직 어려워요</option>
        <option value="PARTLY">조금 이해했어요</option>
        <option value="UNDERSTOOD">설명할 수 있어요</option>
      </select>
      <details>
        <summary>ChatGPT 답변에서 핵심 설명 붙여넣기</summary>
        <label className="sr-only" htmlFor="pasted-explanation">
          핵심 설명 직접 붙여넣기
        </label>
        <textarea
          id="pasted-explanation"
          disabled={saving}
          maxLength={2000}
          value={explanation}
          onChange={(e) => {
            setExplanation(e.target.value);
            setSaved(false);
          }}
        />
        <small>
          원하면 핵심 설명만 직접 붙여 넣으세요. 외부 기사 원문 전체는 저장하지
          마세요.
        </small>
      </details>
      <button
        className="soft-button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const id = interaction?.id ?? (await ensureInteraction());
            await run({
              type: "interactionReflection",
              interactionId: id,
              userTakeaway: takeaway,
              userUnderstanding: understanding,
              pastedExplanation: explanation,
            });
            setSaved(true);
            takeawayDraft.clear();
            understandingDraft.clear();
            explanationDraft.clear();
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
        {saved ? "배운 내용 저장됨" : "배운 내용 저장"}
      </button>
      <DraftStatus
        text={
          [
            takeawayDraft.status,
            explanationDraft.status,
            understandingDraft.status,
          ].find((s) => s && !s.startsWith("Saved")) ?? takeawayDraft.status
        }
      />
      {(sessionId || interaction?.sessionId) && (
        <QuickAdd
          sessionId={sessionId ?? interaction?.sessionId}
          expression={selectedText}
          explanation={takeaway}
          label="Save to Anki"
        />
      )}
    </section>
  );
}
export function InteractionHistory({ sessionId }: { sessionId: string }) {
  const { state } = useStore();
  const entries =
    state?.companionInteractions.filter((i) => i.sessionId === sessionId) ?? [];
  return (
    <div className="interaction-history">
      {entries.map((i) => (
        <details key={i.id}>
          <summary>
            {i.questionType} · {new Date(i.createdAt).toLocaleString("ko-KR")} ·{" "}
            {i.chatOpened ? "ChatGPT 창 열기 실행" : "창 열림 미확인"}
          </summary>
          {i.temporaryTextOmitted && (
            <p>
              임시 질문 텍스트는 저장하지 않았어요. 아래는 해당 부분을 제외한
              기록용 프롬프트입니다.
            </p>
          )}
          <pre className="companion-history-prompt">{i.generatedPrompt}</pre>
          <p>
            <strong>What I learned:</strong>{" "}
            {i.userTakeaway || "아직 작성하지 않음"}
          </p>
          <p>
            내 이해:{" "}
            {i.userUnderstanding === "UNDERSTOOD"
              ? "설명할 수 있어요"
              : i.userUnderstanding === "PARTLY"
                ? "조금 이해했어요"
                : i.userUnderstanding === "NOT_YET"
                  ? "아직 어려워요"
                  : "미선택"}
          </p>
          {i.pastedExplanation && (
            <p className="preserve-lines">{i.pastedExplanation}</p>
          )}
          <QuickAdd
            sessionId={i.sessionId}
            expression={i.selectedText ?? ""}
            explanation={i.userTakeaway}
            label="Save to Anki"
          />
        </details>
      ))}
    </div>
  );
}

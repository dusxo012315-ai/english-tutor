"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import {
  candidateFields,
  candidateExpression,
  emptyCandidateFields,
  type CandidateFields,
} from "@/domain/anki";
import { CandidateFieldsForm } from "./candidate-form";
import { useDraft, DraftStatus } from "@/components/use-draft";
export function QuickAdd({
  sessionId = null,
  expression = "",
  explanation = "",
  meaning = "",
  label = "Save to Anki",
  onCreated,
}: {
  sessionId?: string | null;
  expression?: string;
  explanation?: string;
  meaning?: string;
  label?: string;
  onCreated?: (id: string) => void;
}) {
  const { busy } = useStore();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="anki-quick-add">
      <button
        type="button"
        disabled={busy}
        className="soft-button"
        onClick={() => {
          setSaved(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {saved && (
        <p role="status">
          Candidate 저장됨 ·{" "}
          <Link href={`/cards?candidate=${saved}`}>카드 편집하기</Link>
        </p>
      )}
      {open && (
        <QuickAddDialog
          sessionId={sessionId}
          expression={expression}
          explanation={explanation}
          meaning={meaning}
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setSaved(id);
            setOpen(false);
            onCreated?.(id);
          }}
        />
      )}
    </div>
  );
}
function QuickAddDialog({
  sessionId,
  expression,
  meaning,
  explanation,
  onClose,
  onSaved,
}: {
  sessionId: string | null;
  expression: string;
  meaning: string;
  explanation: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { state, run, busy } = useStore();
  const session = state?.learningSessions.find((s) => s.id === sessionId);
  const valid = candidateExpression.safeParse(expression).success;
  const [fields, setFields, draft] = useDraft<CandidateFields>(
    `quick:${sessionId ?? "manual"}:${expression}`,
    {
      ...emptyCandidateFields(),
      expression: valid ? expression : "",
      meaning,
      explanation,
      sourceTitle: session?.userProvidedTitle ?? "",
      sourceUrl: session?.sourceUrl ?? "",
      targetDeck: state?.deckPresets[0] ?? emptyCandidateFields().targetDeck,
    },
  );
  const requestId = useRef(crypto.randomUUID());
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function save(allowDuplicate = false) {
    try {
      const parsed = candidateFields.safeParse({
        ...fields,
        tags: fields.tags.filter(Boolean),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const result = await run({
        type: "createCandidate",
        requestId: requestId.current,
        sessionId,
        fields: parsed.data,
        allowDuplicate,
      });
      if (result.duplicateIds) {
        setDuplicates(result.duplicateIds);
        return;
      }
      if (result.id) {
        draft.clear();
        onSaved(result.id);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog title="Quick Add Anki Candidate" onClose={onClose}>
      <DraftStatus text={draft.status} />
      {expression && !valid && (
        <p role="alert">
          선택 내용이 너무 길어요. 짧은 표현 또는 문장 일부를 직접 입력해
          주세요.
        </p>
      )}
      <CandidateFieldsForm
        value={fields}
        onChange={(v) => {
          setFields(v);
          setDuplicates([]);
          setError("");
        }}
        decks={state?.deckPresets ?? []}
        compact
      />
      {error && <p role="alert">{error}</p>}
      {duplicates.length > 0 && (
        <div role="alert">
          <p>Similar card already exists</p>
          {duplicates.map((id) => (
            <p key={id}>
              <a href={`/cards?candidate=${encodeURIComponent(id)}`}>
                Open existing ·{" "}
                {state?.ankiCandidates.find((c) => c.id === id)?.expression}
              </a>
            </p>
          ))}
          <button disabled={busy} onClick={() => void save(true)}>
            Save anyway
          </button>
        </div>
      )}
      <button
        className="primary spaced"
        disabled={busy || !fields.expression.trim()}
        onClick={() => void save(false)}
      >
        Save candidate
      </button>
      <p>표현만 먼저 저장하고 나머지는 Anki 페이지에서 완성할 수 있어요.</p>
    </Dialog>
  );
}

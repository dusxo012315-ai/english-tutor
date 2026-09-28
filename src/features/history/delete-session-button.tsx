"use client";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { useStore } from "@/components/provider";
import type { LearningType } from "@/domain/learning";

export function DeleteSessionButton({
  sessionId,
  sessionType,
  title,
  onDeleted,
}: {
  sessionId: string;
  sessionType: LearningType;
  title: string;
  onDeleted: () => void;
}) {
  const { state, run, busy, error, clearError } = useStore();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(false);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    try {
      await run({ type: "deleteLearningSession", sessionId, sessionType });
      onDeleted();
    } catch {
      // StoreProvider supplies the safe server/conflict message. Keep the dialog.
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }
  return (
    <>
      <button
        className="text-button danger-text"
        disabled={busy}
        aria-label={`${title} 학습 기록 삭제`}
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        <Trash2 size={16} /> Delete
      </button>
      {open && (
        <Dialog
          title="학습 기록을 삭제할까요?"
          onClose={() => {
            if (!pending.current) setOpen(false);
          }}
        >
          <p>
            <strong>{title}</strong> · {sessionType}
          </p>
          <p>
            이 기록의 질문, 배운 내용, 메모와 학습 결과도 함께 삭제됩니다. 이
            작업은 되돌릴 수 없습니다.
          </p>
          <p>
            Anki 카드·후보와 내보내기 이력은 보존됩니다. 이전 방식의 카드는 공통
            Anki 화면에서 계속 사용할 수 있습니다.
          </p>
          {error && <p role="alert">{error}</p>}
          {state?.studyPlanItems.some(
            (item) => item.sessionId === sessionId,
          ) && (
            <p>
              Study Plan 항목은 남겨 두고 PLANNED로 돌아갑니다. 다시 시작하면 새
              학습 기록이 만들어집니다.
            </p>
          )}
          <div className="button-row">
            <button
              className="button"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              취소
            </button>
            <button
              className="button danger"
              disabled={busy || deleting}
              onClick={() => void remove()}
            >
              {deleting ? "삭제 중…" : "삭제 확인"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

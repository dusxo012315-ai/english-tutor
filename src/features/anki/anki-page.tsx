"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import {
  candidateFields,
  emptyCandidateFields,
  type AnkiCandidate,
  type CandidateFields,
} from "@/domain/anki";
import { CandidateFieldsForm } from "./candidate-form";
import { QuickAdd } from "./quick-add";
import { CardsPage as LegacyCardsPage } from "@/features/cards/cards-page";
import { useDraft, DraftStatus } from "@/components/use-draft";
function download(tsv: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AnkiPage({
  initialCandidate,
  initialCard,
}: {
  initialCandidate: string | null;
  initialCard: string | null;
}) {
  const { state, run, busy } = useStore();
  const router = useRouter();
  const [legacy, setLegacy] = useState(!!initialCard);
  const [tab, setTab] = useState("CANDIDATE");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmExport, setConfirmExport] = useState(false);
  const [notice, setNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const request = useRef<string | null>(null);
  if (!state) return null;
  if ((legacy || state.tutor?.mode === "mock") && !initialCandidate)
    return (
      <>
        <div className="legacy-switch">
          <button
            onClick={() => setLegacy(false)}
            disabled={state.tutor?.mode === "mock"}
          >
            공통 Anki Candidates
          </button>
          <p>
            이전 카드 검토 화면 · 원본 데이터는 유지되며 공통 Candidate와
            연결됩니다.
          </p>
        </div>
        <LegacyCardsPage initialCard={initialCard} />
      </>
    );
  const editing = state.ankiCandidates.find((c) => c.id === initialCandidate);
  const cards = state.ankiCandidates.filter(
    (c) =>
      c.status === tab &&
      (filter === "ALL" || c.sourceType === filter || c.cardType === filter) &&
      [c.expression, c.meaning, c.sourceTitle, ...c.tags]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const chosen = state.ankiCandidates.filter((c) => selected.includes(c.id));
  const decks = [...new Set(chosen.map((c) => c.targetDeck))];
  function close() {
    router.replace("/cards", { scroll: false });
  }
  async function doExport() {
    try {
      setExportError("");
      request.current ??= crypto.randomUUID();
      const result = await run({
        type: "exportCandidates",
        requestId: request.current,
        candidates: chosen.map((c) => ({ id: c.id, version: c.version })),
        allowReexport: true,
      });
      if (result.tsv && result.filename) {
        download(result.tsv, result.filename);
        setNotice(
          `${result.filename} · ${chosen.length}개 · 다운로드 시작. 실제 Anki 가져오기는 직접 확인하세요.`,
        );
        setSelected([]);
        setConfirmExport(false);
        request.current = null;
        setTab("EXPORTED");
      }
    } catch (e) {
      setExportError((e as Error).message);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ANKI CANDIDATES</div>
          <h1>Anki</h1>
          <p>Reading과 Listening에서 배운 표현을 함께 정리하세요.</p>
        </div>
        <QuickAdd label="Quick Add" />
      </div>
      <div className="filters" aria-label="Anki 상태">
        {[
          ["CANDIDATE", "Candidates"],
          ["READY", "Ready to Export"],
          ["EXPORTED", "Exported"],
          ["ARCHIVED", "Archived"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setSelected([]);
            }}
          >
            {label}{" "}
            <span>
              {state.ankiCandidates.filter((c) => c.status === id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="anki-controls">
        <label className="field-label">
          Candidate filter
          <select
            aria-label="Candidate filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected([]);
            }}
          >
            {[
              "ALL",
              "READING",
              "LISTENING",
              "VOCABULARY",
              "EXPRESSION",
              "SENTENCE",
              "GRAMMAR",
              "IRREGULAR_VERB",
              "CUSTOM",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Search candidates
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected([]);
            }}
            placeholder="Expression, meaning, source, tags"
          />
        </label>
      </div>
      {["READY", "EXPORTED"].includes(tab) && (
        <div className="learning-card">
          <p>
            Ready cards:{" "}
            {state.ankiCandidates.filter((c) => c.status === "READY").length} ·
            선택 {selected.length}
          </p>
          <button onClick={() => setSelected(cards.map((c) => c.id))}>
            Select all
          </button>
          <button onClick={() => setSelected([])}>선택 해제</button>
          <p>Target deck: {decks.join(", ") || "카드를 선택하세요"}</p>
          <p>
            Target template: 카드별 Vocabulary / Sentence (Custom 앞·뒤 편집
            포함)
          </p>
          {decks.length > 1 && (
            <p role="alert">
              덱이 다릅니다. 하나의 덱에 해당하는 카드만 선택하세요.
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !chosen.length || decks.length !== 1}
            onClick={() => {
              request.current = null;
              setExportError("");
              setConfirmExport(true);
            }}
          >
            Export TSV
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="cards-grid">
        {cards.map((c) => (
          <article className="saved-card" key={c.id}>
            {["READY", "EXPORTED"].includes(tab) && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  aria-label={`${c.expression} export selection`}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((id) => id !== c.id),
                    )
                  }
                />
                내보내기
              </label>
            )}
            <button
              className="text-button"
              onClick={() =>
                router.push(`/cards?candidate=${encodeURIComponent(c.id)}`, {
                  scroll: false,
                })
              }
            >
              <h2>{c.expression}</h2>
            </button>
            <p>{c.meaning || "뜻을 채워 주세요"}</p>
            <small>
              {c.sourceType} · {c.cardType} ·{" "}
              {new Date(c.createdAt).toLocaleDateString("ko-KR")}
            </small>
            <p>{c.sourceTitle}</p>
            <p>{c.targetDeck}</p>
            <button
              onClick={() =>
                router.push(`/cards?candidate=${encodeURIComponent(c.id)}`, {
                  scroll: false,
                })
              }
            >
              Edit candidate
            </button>
          </article>
        ))}
      </div>
      {!cards.length && (
        <p className="empty-state">이 조건에 맞는 카드가 없어요.</p>
      )}
      <DeckSettings />
      <details className="learning-card spaced">
        <summary>Export history ({state.candidateExports.length})</summary>
        {state.candidateExports.map((b) => (
          <div key={b.id}>
            <p>
              {b.filename} · {b.count}개 ·{" "}
              {new Date(b.createdAt).toLocaleString("ko-KR")} · {b.targetDeck}
            </p>
          </div>
        ))}
      </details>
      <section className="anki-guide">
        <h2>Anki 가져오기</h2>
        <p>
          UTF-8 TSV · Front / Back / Tags · HTML 허용. Anki에서 기본 앞·뒤 노트
          유형과 표시된 target deck을 직접 선택하세요. 앱은 실제 Anki 덱이나
          복습 일정을 수정하지 않습니다.
        </p>
        <p>
          같은 Front는 Anki의 가져오기 설정에 따라 기존 노트를 갱신하거나 중복
          생성할 수 있습니다.
        </p>
        <a
          href="https://docs.ankiweb.net/importing/text-files.html"
          target="_blank"
          rel="noreferrer"
        >
          Anki 공식 가져오기 안내
        </a>
      </section>
      <button className="text-button" onClick={() => setLegacy(true)}>
        이전 Anki 카드 화면 열기
      </button>
      {editing && (
        <CandidateEditor key={editing.id} card={editing} onClose={close} />
      )}
      {confirmExport && (
        <Dialog title="Export TSV 확인" onClose={() => setConfirmExport(false)}>
          <p>
            Target deck: <strong>{decks[0]}</strong>
          </p>
          <p>
            {chosen.length}개 · Anki 가져오기 화면에서 이 덱과 Basic 앞·뒤 노트
            유형을 선택하세요.
          </p>
          {chosen.some((c) => !!c.exportedAt) && (
            <p role="alert">
              This card has already been exported and may create a duplicate in
              Anki.
            </p>
          )}
          <p>
            내보내기 기록은 파일 생성 기준이며 Anki에 등록되었다는 뜻은
            아닙니다.
          </p>
          {exportError && <p role="alert">{exportError}</p>}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void doExport()}
          >
            계속 · Download TSV
          </button>
        </Dialog>
      )}
    </div>
  );
}
function CandidateEditor({
  card,
  onClose,
}: {
  card: AnkiCandidate;
  onClose: () => void;
}) {
  const { state, run, busy } = useStore();
  const [fields, setFields, draft] = useDraft<CandidateFields>(
    `candidate:${card.id}:${card.version}`,
    () =>
      Object.fromEntries(
        Object.keys(emptyCandidateFields()).map((k) => [
          k,
          card[k as keyof CandidateFields],
        ]),
      ) as CandidateFields,
  );
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<
    "CANDIDATE" | "READY" | "ARCHIVED"
  >("CANDIDATE");
  const [dirty, setDirty] = useState(draft.restored);
  const [discard, setDiscard] = useState(false);
  async function save(
    status: "CANDIDATE" | "READY" | "ARCHIVED",
    allowDuplicate = false,
  ) {
    try {
      setPendingStatus(status);
      const parsed = candidateFields.safeParse({
        ...fields,
        tags: fields.tags.filter(Boolean),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const result = await run({
        type: "updateCandidate",
        candidateId: card.id,
        expectedVersion: card.version,
        fields: parsed.data,
        status,
        allowDuplicate,
      });
      if (result.duplicateIds) {
        setDuplicates(result.duplicateIds);
        return;
      }
      draft.clear();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog
      title="Anki Card Editor"
      onClose={() => (dirty ? setDiscard(true) : onClose())}
    >
      {discard ? (
        <>
          <p>저장하지 않은 변경을 버릴까요?</p>
          <button onClick={() => setDiscard(false)}>계속 편집</button>
          <button
            onClick={() => {
              draft.clear();
              onClose();
            }}
          >
            변경 버리기
          </button>
        </>
      ) : (
        <>
          <p>
            {card.sourceType} · {card.status}
          </p>
          {card.blocked && (
            <p>
              이전 카드가 검토 보류 상태입니다. 내용을 직접 확인·수정한 뒤
              Ready로 확정하세요.
            </p>
          )}
          <CandidateFieldsForm
            value={fields}
            onChange={(v) => {
              setFields(v);
              setDirty(true);
              setDuplicates([]);
            }}
            decks={state?.deckPresets ?? []}
            attribution={card.attribution}
          />
          <DraftStatus text={draft.status} />
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
              <button
                disabled={busy}
                onClick={() => void save(pendingStatus, true)}
              >
                Save anyway
              </button>
            </div>
          )}
          <div className="button-row spaced">
            <button disabled={busy} onClick={() => void save("CANDIDATE")}>
              Save candidate
            </button>
            <button
              disabled={busy}
              className="primary"
              onClick={() => void save("READY")}
            >
              Mark Ready
            </button>
            <button disabled={busy} onClick={() => void save("ARCHIVED")}>
              Archive
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
function DeckSettings() {
  const { state, run, busy } = useStore();
  const [value, setValue] = useState(state?.deckPresets.join("\n") ?? "");
  const [message, setMessage] = useState("");
  return (
    <details className="learning-card spaced">
      <summary>설정 · Deck presets</summary>
      <label className="field-label">
        Deck presets (한 줄에 하나)
        <textarea
          aria-label="Deck presets (한 줄에 하나)"
          value={value}
          maxLength={2500}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        disabled={busy}
        onClick={async () => {
          try {
            await run({
              type: "deckPresets",
              decks: value
                .split(/\r?\n/)
                .map((v) => v.trim())
                .filter(Boolean),
            });
            setMessage("덱 preset 저장됨");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Save deck presets
      </button>
      <p role="status">{message}</p>
    </details>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Download,
  ArrowUpRight,
  Check,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { useStore } from "@/components/provider";
import { Dialog } from "@/components/dialog";
import type { Card } from "@/domain/types";
export function CardsPage({ initialCard }: { initialCard: string | null }) {
  const { state, run, busy } = useStore();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(initialCard);
  const [notice, setNotice] = useState("");
  const router = useRouter();

  if (!state) return null;
  const cards = state.cards.filter(
    (c) => filter === "all" || c.status === filter,
  );
  const editing = state.cards.find((c) => c.id === editId);
  function close() {
    setEditId(null);
    router.replace("/cards", { scroll: false });
  }
  async function download() {
    try {
      const result = await run({ type: "export", cardIds: selected });
      if (!result.tsv) return;
      const url = URL.createObjectURL(
        new Blob([result.tsv], {
          type: "text/tab-separated-values;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `english-cards-${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}.tsv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        `${selected.length}개 카드 다운로드 시작. Anki에서 가져오기를 확인해 주세요.`,
      );
    } catch {}
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORDS TO KEEP</div>
          <h1>저장한 표현</h1>
          <p>기억하고 싶은 표현을 골라, 나만의 Anki 카드로 만들어 보세요.</p>
        </div>
        <button
          className="primary"
          disabled={busy || !selected.length}
          onClick={() => void download()}
        >
          <Download size={17} />
          TSV 내보내기 {selected.length > 0 && `(${selected.length})`}
        </button>
      </div>
      <div className="cards-banner">
        <div className="article-icon">
          <Bookmark size={21} />
        </div>
        <div>
          <strong>짧게 기억하고, 오래 사용하기</strong>
          <p>
            앞면과 뒷면을 검토한 뒤 확정하세요. 확정한 카드만 내보낼 수 있어요.
          </p>
        </div>
      </div>
      <div className="section-heading">
        <div className="filters">
          {[
            ["all", "전체 표현"],
            ["draft", "초안"],
            ["confirmed", "확정"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>
                {id === "all"
                  ? state.cards.length
                  : state.cards.filter((c) => c.status === id).length}
              </span>
            </button>
          ))}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={
              cards.some((c) => c.status === "confirmed" && !c.blocked) &&
              cards
                .filter((c) => c.status === "confirmed" && !c.blocked)
                .every((c) => selected.includes(c.id))
            }
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? cards
                      .filter((c) => c.status === "confirmed" && !c.blocked)
                      .map((c) => c.id)
                  : [],
              )
            }
          />
          확정 카드 선택
        </label>
      </div>
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      <div className="cards-grid">
        {cards.map((card) => (
          <div className="saved-card" key={card.id}>
            <div className="saved-card-top">
              <label className="checkbox-label">
                <input
                  aria-label={`${card.expression} 내보내기 선택`}
                  type="checkbox"
                  disabled={card.status !== "confirmed" || card.blocked}
                  checked={selected.includes(card.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, card.id]
                        : selected.filter((id) => id !== card.id),
                    )
                  }
                />
                <span
                  className={`badge ${card.blocked ? "warning" : card.status === "confirmed" ? "success" : ""}`}
                >
                  {card.blocked
                    ? "검토 보류"
                    : card.status === "confirmed"
                      ? "확정"
                      : "초안"}
                </span>
              </label>
              <button
                className="icon-button"
                aria-label={`${card.expression} 카드 편집`}
                onClick={() => setEditId(card.id)}
              >
                <Pencil size={16} />
              </button>
            </div>
            <h2 lang="en">{card.expression}</h2>
            <p>{card.meaning}</p>
            <div className="card-context" lang="en">
              {state.items.find((i) => i.id === card.itemId)?.quote}
            </div>
            <div className="saved-card-footer">
              <Link
                href={`/learn/${card.sessionId}`}
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    await run({
                      type: "activate",
                      sessionId: card.sessionId,
                      itemId: card.itemId,
                    });
                    router.push(`/learn/${card.sessionId}`);
                  } catch {}
                }}
              >
                출처 문장으로
                <ArrowUpRight size={14} />
              </Link>
              <button
                className="text-button"
                onClick={() => setEditId(card.id)}
              >
                검토하기
                <ArrowUpRight size={14} />
              </button>
            </div>
            {card.exportedAt && (
              <small>이 카드의 내보내기 요청 기록 있음</small>
            )}
          </div>
        ))}
      </div>
      {!cards.length && (
        <div className="empty-state">
          <Bookmark />
          <h2>아직 저장한 표현이 없어요</h2>
          <p>튜터 설명에서 기억하고 싶은 표현을 카드로 만들어 보세요.</p>
          <Link className="button primary" href="/learn">
            글 읽으러 가기
          </Link>
        </div>
      )}
      <section className="anki-guide">
        <h2>Anki로 가져오는 방법</h2>
        <ol>
          <li>확정한 카드를 선택하고 TSV 파일을 다운로드하세요.</li>
          <li>Anki에서 파일 가져오기 → 기본 앞·뒤 노트 유형을 선택하세요.</li>
          <li>
            1열 Front · 2열 Back · 3열 Tags, 탭 구분 및 HTML을 확인하세요.
          </li>
          <li>덱을 고르고 미리보기의 내용과 카드 수를 확인한 뒤 가져오세요.</li>
        </ol>
        <p>
          내보내기는 Anki 등록 완료를 의미하지 않아요. 같은 파일을 다시 가져올
          때는 중복 처리 설정을 확인해 주세요.
        </p>
      </section>
      {editing && (
        <CardEditor key={editing.id} card={editing} onClose={close} />
      )}
    </div>
  );
}
function CardEditor({ card, onClose }: { card: Card; onClose: () => void }) {
  const { run, busy, error } = useStore();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [direction, setDirection] = useState(card.direction);
  const [preview, setPreview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty =
    front !== card.front || back !== card.back || direction !== card.direction;
  function close() {
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function save(confirm: boolean) {
    try {
      await run({
        type: "card",
        cardId: card.id,
        front,
        back,
        direction,
        confirm,
        expectedVersion: card.version,
      });
      onClose();
    } catch {}
  }
  return (
    <Dialog title="Anki 카드 검토" onClose={close}>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {discard ? (
        <>
          <h3>수정한 내용을 버릴까요?</h3>
          <p>저장하지 않은 카드 수정 내용은 사라집니다.</p>
          <div className="button-row">
            <button onClick={() => setDiscard(false)}>계속 편집</button>
            <button className="danger" onClick={onClose}>
              수정 내용 버리기
            </button>
          </div>
        </>
      ) : deleting ? (
        <>
          <h3>이 카드를 삭제할까요?</h3>
          <p>원래 학습 기록과 이미 다운로드한 파일은 유지됩니다.</p>
          <div className="button-row">
            <button onClick={() => setDeleting(false)}>취소</button>
            <button
              className="danger"
              onClick={async () => {
                try {
                  await run({ type: "deleteCard", cardId: card.id });
                  onClose();
                } catch {}
              }}
            >
              카드 삭제
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="section-heading">
            <span className={`badge ${card.blocked ? "warning" : ""}`}>
              {card.blocked
                ? "설명 검토 필요 · 확정 불가"
                : card.status === "confirmed"
                  ? "확정한 카드"
                  : "검토 전 초안"}
            </span>
            <button
              className="text-button"
              onClick={() => setPreview(!preview)}
            >
              {preview ? <Pencil size={16} /> : <Eye size={16} />}{" "}
              {preview ? "편집" : "미리보기"}
            </button>
          </div>
          <label className="field-label" htmlFor="card-direction">
            학습 방향
          </label>
          <select
            id="card-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as Card["direction"])}
          >
            <option value="recognition">영어 → 한국어 뜻</option>
            <option value="production">한국어 단서 → 영어 표현</option>
          </select>
          {direction === "production" && (
            <p className="muted text-xs">
              앞면에 한국어 단서, 뒷면에 영어 표현을 직접 작성하세요.
            </p>
          )}
          {preview ? (
            <div className="card-preview">
              <span>FRONT</span>
              <p lang={direction === "recognition" ? "en" : "ko"}>{front}</p>
              <hr />
              <span>BACK</span>
              <p>{back}</p>
            </div>
          ) : (
            <>
              <label className="field-label spaced" htmlFor="card-front">
                앞면
              </label>
              <textarea
                id="card-front"
                value={front}
                maxLength={2000}
                onChange={(e) => setFront(e.target.value)}
              />
              <label className="field-label spaced" htmlFor="card-back">
                뒷면
              </label>
              <textarea
                id="card-back"
                value={back}
                maxLength={2000}
                onChange={(e) => setBack(e.target.value)}
              />
            </>
          )}
          <div className="card-attribution">
            <strong>출처 · 내보내기에 자동 포함</strong>
            <p>{card.attribution}</p>
          </div>
          <div className="button-row">
            <button
              className="icon-button danger-text"
              aria-label="카드 삭제"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={17} />
            </button>
            <button onClick={() => void save(false)} disabled={busy}>
              초안 저장
            </button>
            <button
              className="primary"
              disabled={busy || card.blocked || !front.trim() || !back.trim()}
              onClick={() => void save(true)}
            >
              <Check size={16} />
              검토 완료·확정
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

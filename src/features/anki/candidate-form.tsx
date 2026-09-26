"use client";
import {
  cardTypes,
  renderCandidate,
  type CandidateFields,
} from "@/domain/anki";
export function CandidateFieldsForm({
  value,
  onChange,
  decks,
  attribution = "",
  compact = false,
}: {
  value: CandidateFields;
  onChange: (v: CandidateFields) => void;
  decks: string[];
  attribution?: string;
  compact?: boolean;
}) {
  const set = (key: keyof CandidateFields, text: string) =>
    onChange({ ...value, [key]: text });
  const fields = [
    ["expression", "Expression", 80],
    ["meaning", "Meaning", 1000],
    ["explanation", "Explanation", 2000],
    ["exampleSentence", "Example", 500],
    ["userNote", "User note", 1000],
  ] as const;
  const preview = renderCandidate({ ...value, attribution });
  const rest = (
    <>
      {fields.slice(1).map(([key, label, max]) => (
        <label className="field-label spaced" key={key}>
          {label}
          <textarea
            aria-label={label}
            value={value[key]}
            maxLength={max}
            onChange={(e) => set(key, e.target.value)}
          />
        </label>
      ))}
      <label className="field-label spaced">
        Card type
        <select
          aria-label="Card type"
          value={value.cardType}
          onChange={(e) =>
            onChange({
              ...value,
              cardType: e.target.value as CandidateFields["cardType"],
            })
          }
        >
          {cardTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="field-label spaced">
        Deck
        <input
          value={value.targetDeck}
          maxLength={120}
          onChange={(e) => set("targetDeck", e.target.value)}
        />
      </label>
      <label className="field-label">
        Deck preset
        <select
          aria-label="Deck preset"
          value=""
          onChange={(e) => set("targetDeck", e.target.value)}
        >
          <option value="">빠르게 선택</option>
          {decks.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label className="field-label spaced">
        Tags (공백으로 구분)
        <input
          value={value.tags.join(" ")}
          onChange={(e) =>
            onChange({ ...value, tags: e.target.value.split(" ") })
          }
        />
      </label>
      <label className="field-label spaced">
        Source title
        <input
          value={value.sourceTitle}
          maxLength={200}
          onChange={(e) => set("sourceTitle", e.target.value)}
        />
      </label>
      <label className="field-label spaced">
        Source URL
        <input
          value={value.sourceUrl}
          maxLength={2048}
          onChange={(e) => set("sourceUrl", e.target.value)}
        />
      </label>
      <details className="spaced">
        <summary>Front / Back 직접 편집</summary>
        <p>
          입력하면 세부 필드 템플릿 대신 사용합니다. 출처는 내보내기에
          유지됩니다.
        </p>
        <label className="field-label">
          Front override
          <textarea
            aria-label="Front override"
            value={value.frontOverride ?? ""}
            maxLength={4000}
            onChange={(e) =>
              onChange({ ...value, frontOverride: e.target.value || null })
            }
          />
        </label>
        <label className="field-label">
          Back override
          <textarea
            aria-label="Back override"
            value={value.backOverride ?? ""}
            maxLength={6000}
            onChange={(e) =>
              onChange({ ...value, backOverride: e.target.value || null })
            }
          />
        </label>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, frontOverride: null, backOverride: null })
          }
        >
          템플릿으로 되돌리기
        </button>
      </details>
      <div className="card-preview spaced">
        <strong>Front preview</strong>
        <p className="preserve-lines">{preview.front || "앞면을 입력하세요"}</p>
        <hr />
        <strong>Back preview</strong>
        <p className="preserve-lines">
          {preview.back || "뜻과 설명을 입력하세요"}
        </p>
      </div>
    </>
  );
  return (
    <>
      <label className="field-label">
        Expression
        <input
          autoFocus
          value={value.expression}
          maxLength={80}
          onChange={(e) => set("expression", e.target.value)}
        />
      </label>
      <small>
        짧은 표현만 저장합니다. 80자·10단어 이내, 원문 전체 입력 금지.
      </small>
      {compact ? (
        <details className="spaced">
          <summary>Meaning · Explanation · Example 추가</summary>
          {rest}
        </details>
      ) : (
        rest
      )}
    </>
  );
}

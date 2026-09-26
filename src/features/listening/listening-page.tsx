"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/provider";
import { validateBneUrl } from "@/domain/learning";
export function ListeningPage() {
  const { state, run, busy } = useStore();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("3");
  const [error, setError] = useState("");
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LISTEN · NOTICE · RECALL</div>
          <h1>Breaking News English 학습</h1>
          <p>원본 페이지에서 듣고, 내가 이해한 내용을 이곳에 남겨 보세요.</p>
        </div>
      </div>
      <form
        className="learning-card listening-start"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const sourceUrl = validateBneUrl(url);
            const result = await run({
              type: "startListening",
              sourceUrl,
              userProvidedTitle: title,
              level: level as "0" | "1" | "2" | "3" | "4" | "5" | "6" | "other",
            });
            router.push(`/listening/${result.id}`);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label className="field-label" htmlFor="lesson-url">
          Lesson URL
        </label>
        <input
          id="lesson-url"
          type="url"
          required
          maxLength={2048}
          placeholder="https://breakingnewsenglish.com/2609/260925-example.html"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <label className="field-label spaced" htmlFor="lesson-title">
          학습 제목 (직접 입력)
        </label>
        <input
          id="lesson-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="field-label spaced" htmlFor="lesson-level">
          Level
        </label>
        <select
          id="lesson-level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {["0", "1", "2", "3", "4", "5", "6", "other"].map((v) => (
            <option key={v} value={v}>
              {v === "other" ? "기타" : v}
            </option>
          ))}
        </select>
        <p className="storage-note">
          HTML lesson URL과 직접 작성한 제목·레벨·학습 기록만 저장합니다.
          기사·스크립트·문제·MP3를 가져오거나 앱 안에 표시하지 않습니다.
        </p>
        <button className="primary" disabled={busy}>
          Start Listening Session
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <h2 className="spaced">이어서 듣기</h2>
      <div className="learning-session-list">
        {state?.learningSessions
          .filter((s) => s.type === "LISTENING")
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .map((s) => (
            <Link
              className="learning-card"
              key={s.id}
              href={`/listening/${s.id}`}
            >
              <strong>{s.userProvidedTitle}</strong>
              <span>
                Level {s.level === "other" ? "기타" : s.level} ·{" "}
                {s.completedAt ? "학습 마침" : "학습 중"}
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}

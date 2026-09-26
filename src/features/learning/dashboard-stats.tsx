"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/provider";
import { learningStats, difficultyReasons } from "@/domain/learning";
export function DashboardStats() {
  const [now] = useState(() => new Date());
  const { state } = useStore();
  if (!state) return null;
  const stats = learningStats(state.learningSessions, state.listeningDetails);
  const local = new Date(now.getTime() + 9 * 3600000);
  const week =
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - ((local.getUTCDay() + 6) % 7),
    ) -
    9 * 3600000;
  const candidates = state.ankiCandidates.filter(
    (c) => Date.parse(c.createdAt) >= week,
  );
  return (
    <section className="learning-card dashboard-learning">
      <div>
        <h2>This Week</h2>
        <small>월요일 시작 · 한국 시간 · 이번 주 시작한 세션</small>
        <div className="learning-metrics">
          <p>
            Reading sessions<strong>{stats.reading}</strong>
          </p>
          <p>
            Listening sessions<strong>{stats.listening}</strong>
          </p>
          <p>
            Average first comprehension
            <strong>{stats.first === null ? "—" : `${stats.first}%`}</strong>
          </p>
          <p>
            Average final comprehension
            <strong>{stats.final === null ? "—" : `${stats.final}%`}</strong>
          </p>
        </div>
        <h3>Most common difficulties</h3>
        {stats.difficulties.length ? (
          <ul>
            {stats.difficulties.map((d) => (
              <li key={d.key}>
                {difficultyReasons[d.key]} <strong>{d.count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 기록이 없어요. 0%는 실제로 입력한 경우만 집계해요.</p>
        )}
        <Link className="button soft-button" href="/listening">
          Listening 시작하기
        </Link>
        <h3 className="spaced">Anki · This Week</h3>
        <small>이번 주 생성한 후보의 현재 상태</small>
        <div className="learning-metrics">
          <p>
            New candidates<strong>{candidates.length}</strong>
          </p>
          <p>
            Ready
            <strong>
              {candidates.filter((c) => c.status === "READY").length}
            </strong>
          </p>
          <p>
            Exported
            <strong>
              {candidates.filter((c) => c.status === "EXPORTED").length}
            </strong>
          </p>
        </div>
        <Link className="button soft-button" href="/cards">
          Review Anki candidates
        </Link>
      </div>
    </section>
  );
}

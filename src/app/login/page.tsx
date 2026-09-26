"use client";
import { navigateAuthBoundary } from "@/components/auth-navigation";
import { useState } from "react";
export default function Login() {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="page">
      <h1>Reading Room</h1>
      <p>개인 학습 공간 · 비밀번호로 열기</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/auth/login", {
              method: "POST",
              signal: AbortSignal.timeout(20000),
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            navigateAuthBoundary("/");
          } catch {
            setError(
              "로그인하지 못했어요. 비밀번호와 연결을 확인하고 잠시 후 다시 시도해 주세요.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}

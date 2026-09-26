"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { navigateAuthBoundary } from "./auth-navigation";
export function LogoutButton() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={busy ? "로그아웃 중…" : "로그아웃"}
        title="로그아웃"
        disabled={busy}
        onClick={async () => {
          try {
            if (
              Object.keys(sessionStorage).some((k) =>
                k.startsWith("reading-room:draft:"),
              ) &&
              !confirm(
                "저장하지 않은 초안이 있어요. 로그아웃하면 이 탭의 초안이 지워집니다. 먼저 저장하지 않고 로그아웃할까요?",
              )
            )
              return;
          } catch {
            /* storage may be unavailable */
          }
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/auth/logout", {
              method: "POST",
              signal: AbortSignal.timeout(15000),
            });
            if (!r.ok && r.status !== 401) throw new Error();
            try {
              for (const key of Object.keys(sessionStorage))
                if (key.startsWith("reading-room:"))
                  sessionStorage.removeItem(key);
            } catch {
              /* full navigation must still discard private React state */
            }
            navigateAuthBoundary("/login");
          } catch {
            setError(
              "로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
            );
            setBusy(false);
          }
        }}
      >
        <LogOut size={18} aria-hidden="true" />
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

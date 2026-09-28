"use client";
import { navigateAuthBoundary } from "@/components/auth-navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AppState } from "@/domain/types";
import type { Action } from "@/domain/schemas";
type Result = {
  state: AppState;
  id?: string;
  tsv?: string;
  filename?: string;
  duplicateIds?: string[];
};
type Context = {
  state: AppState | null;
  run: (action: Action) => Promise<Result>;
  busy: boolean;
  error: string;
  clearError: () => void;
  reload: () => void;
};
const StoreContext = createContext<Context | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const [error, setError] = useState("");
  const revision = useRef("");
  const generation = useRef(0);
  const blocked = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const reload = useCallback(() => {
    if (location.pathname === "/login") return;
    const stamp = generation.current;
    fetch("/api/state", {
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.status === 401) {
          navigateAuthBoundary("/login");
          return;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (
          blocked.current ||
          stamp !== generation.current ||
          pendingRef.current ||
          (revision.current &&
            // Preserve the revision a dialog was opened against, even after
            // focus leaves an input for its Save button or the window blurs.
            document.querySelector(
              "dialog[open], textarea, input:focus, select:focus",
            ))
        )
          return;
        revision.current = data.revision || "";
        setState(data.state);
        setError("");
      })
      .catch(() =>
        setError("저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."),
      );
  }, []);
  useEffect(() => {
    reload();
    const resume = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(resume, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload]);
  const run = useCallback((action: Action): Promise<Result> => {
    generation.current++;
    pendingRef.current++;
    setPending((n) => n + 1);
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        try {
          if (blocked.current)
            throw new Error(
              "저장 충돌이 발생했어요. 새로고침 후 초안과 최신 기록을 비교해 주세요.",
            );
          const response = await fetch("/api/state", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(revision.current ? { "If-Match": revision.current } : {}),
            },
            body: JSON.stringify(action),
            signal: AbortSignal.timeout(55000),
          });
          if (response.status === 401) {
            navigateAuthBoundary("/login");
            throw new Error("로그인이 필요합니다.");
          }
          if (response.status === 409) blocked.current = true;
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          revision.current = result.revision || "";
          setState(result.state);
          setError("");
          return result;
        } catch (e) {
          setError(
            e instanceof Error &&
              (e.name === "TimeoutError" || e.name === "AbortError")
              ? "응답이 지연되고 있어요. 새로고침으로 저장 상태를 확인한 뒤 다시 시도해 주세요."
              : e instanceof TypeError
                ? "서버에 연결하지 못했어요. 입력을 유지한 채 다시 시도해 주세요."
                : e instanceof SyntaxError
                  ? "서버 응답을 읽지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요."
                  : e instanceof Error
                    ? e.message
                    : "저장하지 못했어요.",
          );
          throw e;
        } finally {
          pendingRef.current--;
          setPending((n) => n - 1);
        }
      });
    queue.current = task;
    return task;
  }, []);
  return (
    <StoreContext.Provider
      value={{
        state,
        run,
        busy: pending > 0,
        error,
        clearError: () => setError(""),
        reload,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider missing");
  return store;
}

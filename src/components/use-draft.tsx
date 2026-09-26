"use client";
import { useEffect, useRef, useState, type SetStateAction } from "react";
const pendingDrafts = new Map<string, unknown>();

// Only explicitly opted-in user notes. Never use for Listening temporary source text.
export function useDraft<T>(key: string, initial: T | (() => T)) {
  const [boot] = useState(() => {
    const fallback =
      typeof initial === "function" ? (initial as () => T)() : initial;
    const pending = pendingDrafts.get(key);
    if (pendingDrafts.has(key) && sameShape(pending, fallback))
      return { value: pending as T, restored: true };
    try {
      const raw = sessionStorage.getItem(`reading-room:draft:${key}`);
      if (raw && raw.length < 60000) {
        const value = JSON.parse(raw) as T;
        if (sameShape(value, fallback)) return { value, restored: true };
      }
    } catch {
      /* Storage may be unavailable; keep the editable form usable. */
    }
    return { value: fallback, restored: false };
  });
  const [value, setValue] = useState<T>(boot.value);
  const [status, setStatus] = useState(
    boot.restored ? "초안 복원됨 · 아래 저장 버튼으로 확정하세요." : "",
  );
  const latest = useRef(boot.value);
  const dirty = useRef(boot.restored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function write() {
    if (!dirty.current) return;
    try {
      sessionStorage.setItem(
        `reading-room:draft:${key}`,
        JSON.stringify(latest.current),
      );
      return true;
    } catch {
      return false;
    }
  }
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      try {
        sessionStorage.setItem(
          `reading-room:draft:${key}`,
          JSON.stringify(latest.current),
        );
      } catch {}
    };
    const warn = (e: BeforeUnloadEvent) => {
      flush();
      if (dirty.current) {
        try {
          if (
            sessionStorage.getItem(`reading-room:draft:${key}`) ===
            JSON.stringify(latest.current)
          )
            return;
        } catch {}
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, [key]);
  function update(next: SetStateAction<T>) {
    const v =
      typeof next === "function" ? (next as (v: T) => T)(latest.current) : next;
    latest.current = v;
    pendingDrafts.set(key, v);
    dirty.current = true;
    setValue(v);
    setStatus("입력 중 · 초안 보관 중…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        setStatus(
          write()
            ? "초안 이 탭에 보관됨 · 아래 저장 버튼으로 확정하세요."
            : "초안 보관 불가 · 이동 전에 저장 버튼을 눌러 주세요.",
        ),
      500,
    );
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    pendingDrafts.delete(key);
    try {
      sessionStorage.removeItem(`reading-room:draft:${key}`);
    } catch {}
    setStatus("Saved · 저장됨");
  }
  return [value, update, { clear, status, restored: boot.restored }] as const;
}
function sameShape(value: unknown, sample: unknown): boolean {
  if (sample === null) return value === null || typeof value === "string";
  if (Array.isArray(sample))
    return Array.isArray(value) && value.every((v) => typeof v === "string");
  if (typeof sample === "object")
    return (
      !!value &&
      typeof value === "object" &&
      Object.entries(sample!).every(([k, v]) =>
        sameShape((value as Record<string, unknown>)[k], v),
      )
    );
  return typeof value === typeof sample;
}
export function DraftStatus({ text }: { text: string }) {
  return text ? (
    <p className="storage-note" role="status">
      {text}
    </p>
  ) : null;
}

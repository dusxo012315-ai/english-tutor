"use client";
import { LogoutButton } from "./logout-button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  House,
  History,
  Layers,
  ArrowUpRight,
  PanelLeft,
  CircleHelp,
  Headphones,
  ListOrdered,
} from "lucide-react";
import { useStore } from "./provider";
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, busy, error, clearError, reload } = useStore();
  const active = path.startsWith("/plan")
    ? "plan"
    : path.startsWith("/review")
      ? "review"
      : path.startsWith("/listening")
        ? "listen"
        : path.startsWith("/learn")
          ? "read"
          : path.startsWith("/history")
            ? "history"
            : path.startsWith("/cards")
              ? "cards"
              : "home";
  const latest = state?.sessions.find((s) => s.status === "in_progress");
  const navigation = [
    { id: "home", href: "/", label: "학습 홈", Icon: House },
    { id: "plan", href: "/plan", label: "Study Plan", Icon: ListOrdered },
    {
      id: "read",
      href: latest ? `/learn/${latest.id}` : "/learn",
      label: "읽기 학습",
      Icon: BookOpen,
    },
    { id: "listen", href: "/listening", label: "Listening", Icon: Headphones },
    { id: "review", href: "/review", label: "Review", Icon: CircleHelp },
    { id: "cards", href: "/cards", label: "Anki", Icon: Layers },
    { id: "history", href: "/history", label: "학습 기록", Icon: History },
  ];
  if (path === "/login") return <>{children}</>;
  if (path.startsWith("/print/"))
    return (
      <>
        {error && <p role="alert">{error}</p>}
        {children}
      </>
    );
  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Reading Room 학습 홈">
          <BookOpen size={27} />
          <span>
            Reading
            <br />
            Room<span className="brand-caption">나만의 영어 읽기 공간</span>
          </span>
        </Link>
        <div className="nav-caption">MY WORKSPACE</div>
        <nav aria-label="주 메뉴">
          {navigation.map(({ id, href, label, Icon }) => (
            <Link
              key={id}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active === id ? "page" : undefined}
              className={`nav-item ${active === id ? "active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
              {active === id && <i />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-blue">A LITTLE, EVERY DAY</span>
            <p>
              오늘 읽은 한 문장을
              <br />
              내일의 영어로.
            </p>
          </div>
          <div className="profile">
            <div className="avatar">R</div>
            <div>
              <strong>나의 Reading Room</strong>
              <small>개인 학습 공간</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <PanelLeft size={17} />
            <span>내 학습 공간</span>
            <span className="crumb-divider">/</span>
            <strong>{navigation.find((n) => n.id === active)?.label}</strong>
          </div>
          <div className="topbar-status">
            <span className="save-status" role="status">
              <i className={error ? "error-dot" : ""} />
              {error
                ? "저장 상태 확인 필요"
                : busy
                  ? "저장 중…"
                  : "학습 기록 저장"}
            </span>
            <span className="badge mock-badge">
              Wikipedia ·{" "}
              {state?.tutor?.mode === "mock"
                ? "Tutor Mock"
                : "ChatGPT Companion"}
            </span>
            <LogoutButton />
          </div>
        </header>
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <button onClick={clearError} aria-label="오류 안내 닫기">
              닫기
            </button>
          </div>
        )}
        <main id="main">
          {state ? (
            children
          ) : (
            <div className="loading-state">
              <BookOpen />
              <h1>
                {error
                  ? "저장소를 확인해 주세요"
                  : "읽기 공간을 준비하고 있어요"}
              </h1>
              {error ? (
                <button onClick={reload}>다시 시도</button>
              ) : (
                <p>저장한 자료와 학습 기록을 불러오는 중입니다.</p>
              )}
            </div>
          )}
        </main>
        <footer className="app-footer">
          <CircleHelp size={14} /> Wikipedia 원문 연결 · 문맥으로 배우는 영어{" "}
          <a
            href="https://simple.wikipedia.org"
            target="_blank"
            rel="noreferrer"
          >
            Simple English Wikipedia <ArrowUpRight size={12} />
          </a>
        </footer>
      </div>
    </>
  );
}

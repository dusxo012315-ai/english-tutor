"use client";
import { useStore } from "@/components/provider";
import Link from "next/link";
export default function Page() {
  const { state } = useStore();
  return (
    <div className="page">
      <h1>읽기 학습</h1>
      <p>최근 글을 이어 읽거나 새로운 자료로 시작하세요.</p>
      {state?.sessions.slice(0, 5).map((s) => (
        <Link className="recent-row" key={s.id} href={`/learn/${s.id}`}>
          {state.articles.find((a) => a.id === s.articleId)?.title}
          <span>이어서 보기 →</span>
        </Link>
      ))}
      <Link href="/" className="button primary">
        새 글 선택하기
      </Link>
    </div>
  );
}

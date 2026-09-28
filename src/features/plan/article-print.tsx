"use client";
import Link from "next/link";
import { useStore } from "@/components/provider";
import { canPrintArticle } from "@/domain/study-plan";
export function ArticlePrint({ articleId }: { articleId: string }) {
  const { state } = useStore();
  if (!state) return <p>Loading article…</p>;
  const article = state.articles.find((a) => a.id === articleId);
  if (!article || !canPrintArticle(article))
    return (
      <main className="article-print">
        <p>인쇄 가능한 Simple English Wikipedia 자료를 찾을 수 없어요.</p>
        <Link href="/plan">Study Plan</Link>
      </main>
    );
  const attribution = article.attribution!;
  return (
    <main className="article-print">
      <div className="print-controls">
        <Link href="/plan">Study Plan</Link>
        <button className="button primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <p>
          브라우저 인쇄 창에서 Save as PDF를 선택하세요. 표·이미지 등 생략된
          내용은 원문에서 확인하세요.
        </p>
      </div>
      <h1>{article.title}</h1>
      {article.blocks.map((b) => (
        <section key={b.id}>
          {b.heading && <h2>{b.heading}</h2>}
          <p>{b.text}</p>
        </section>
      ))}
      <footer>
        <h2>Source & attribution</h2>
        <p>
          Source: <a href={article.sourceUrl}>{article.sourceUrl}</a>
        </p>
        <p>
          Revision: {article.revisionId}
          {article.revisionTimestamp ? ` · ${article.revisionTimestamp}` : ""}
        </p>
        <p>
          <a href={attribution.revisionUrl}>{attribution.revisionUrl}</a>
        </p>
        <p>{attribution.creatorLabel}</p>
        <p>
          Contributors:{" "}
          <a href={attribution.historyUrl}>{attribution.historyUrl}</a>
        </p>
        <p>
          License: {attribution.licenseName} ·{" "}
          <a href={attribution.licenseUrl}>{attribution.licenseUrl}</a>
        </p>
        <p>{article.notice}</p>
        {[
          ...attribution.extraNotices,
          ...attribution.changes,
          ...(article.omissions ?? []),
        ].map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </footer>
    </main>
  );
}

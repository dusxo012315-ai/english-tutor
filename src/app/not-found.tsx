import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>페이지를 찾을 수 없어요</h1>
      <Link className="button primary" href="/">
        학습 홈으로
      </Link>
    </div>
  );
}

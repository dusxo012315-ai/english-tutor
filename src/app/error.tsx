"use client";
export default function ErrorPage({retry}:{retry:()=>void}) {
  return <div className="page" role="alert"><h1>화면을 불러오지 못했어요</h1><p>저장된 학습 기록은 유지됩니다. 잠시 후 다시 시도해 주세요.</p><button onClick={retry}>다시 시도</button></div>;
}

# 구현·검증 보고서

검증일: 2026-09-24 (Asia/Seoul)

## 구현 결과

이번 사용자 요청의 **프로젝트 기반 + Mock 화면·이동 구조**를 구현했습니다. 전체 PRD의 실서비스 MVP 완료 선언은 아닙니다.

- Next.js App Router / TypeScript / Tailwind, SQLite / Drizzle ORM, migration과 seed 구성.
- 홈, 읽기·Tutor, 학습 기록 4개 필터, 저장 표현·카드 목록, 편집·미리보기 dialog 연결.
- 제목·URL Mock 조회, 준비된 후보, 잘못된 URL·미지원 표현의 오류 안내.
- 문단/표현 선택, 추측, 고정 설명, 추가 질문 예시, 3지선다, 재시도 기록, 영작 저장.
- 카드 초안·확정·수정·삭제, 검토 보류, 확정 카드 UTF-8 TSV 다운로드.
- SQLite 재접속 후 복원, 카드 버전 충돌 거부, 오류 중 초안 보존, Mock 모드 분리.
- UI_SPEC 토큰과 반응형 크기를 적용. `PROTOTYPE_SOURCE.zip` 부재로 원본과의 픽셀 일치 검증은 수행하지 못함.
- README, .env.example, .gitignore 작성. Git `main` 초기화. 커밋·원격 저장소 생성·배포는 수행하지 않음.

## 테스트 결과

환경: Windows, Node 24.14.0, npm 11.9.0, Chrome 151.0.7922.174, Playwright 1.63.0. 웹폰트 다운로드 없음, UI_SPEC의 시스템 폰트 stack 사용(영어 본문 Georgia, 한글 Windows fallback).

| 검증 | 결과 | 확인한 내용 |
| --- | --- | --- |
| `npm run typecheck` | 통과 | strict TypeScript 검사 |
| `npm run lint` | 통과 | Next/React hooks/TypeScript ESLint, 경고 0 |
| `npm run build` | 통과 | Next production compilation 및 페이지 생성 |
| `npm test` | 6/6 통과 | Mock 계약·입력·TSV·SQLite workflow·실패 rollback |
| `npm run test:e2e` | 3/3 통과 | Chrome 학습 흐름, 반응형, 모바일·키보드 |
| `npm run db:migrate` | 통과 | 실제 파일 DB migration 및 시연 seed |
| `npm run db:generate` | 통과 | schema와 SQL migration 일치, 추가 변경 없음 |
| `npm audit` | 통과 | 전체 의존성 취약점 0건 |
| Git 제외 검사 | 통과 | .env.local, DB, node_modules, .next 제외 |

### 도메인·DB 테스트

1. 제목과 모바일 Wikipedia URL이 동일 Mock 자료로 조회됨. 미존재 제목은 빈 후보.
2. 외부 호스트, HTTP, 비표준 포트, 사용자 정보, query, 잘못된 인코딩, namespace 입력 거부.
3. 추측 1,000자 상한과 문제 선택지 schema 검증.
4. 한글·이모지·따옴표·HTML 문자·탭·CRLF를 포함한 TSV가 정확히 3열이며 BOM 없음. 초안·보류·빈 선택 내보내기 거부.
5. 추측 없이 설명 거부 → 설명 → 첫 오답 → 재시도 정답 → 영작 → 카드 확정 → export → DB close/reopen 복원. 첫 추측과 첫 시도 보존, 중복 카드 방지, 카드 stale version 거부.
6. 준비되지 않은 Mock 설명 실패 시 저장된 입력을 보존하고 완료 답변이나 제출 추측으로 잘못 기록하지 않음.

### 브라우저 테스트

- Bird 불러오기 → 선택 → 추측 → 설명 → 새로고침 복원 → 오답 → 영작 → 재시도 정답 → 카드 미리보기·확정 → 실제 다운로드 이벤트 → History 확인 필요 필터.
- 위 흐름에서 브라우저 JavaScript 오류 0건, 앱 외부 origin 요청 0건.
- 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 900/901px, 650/651px 경계: Home·Reading 가로 넘침 없음. 900px 이하에서 원문/Tutor 전환.
- 390px에서 잘못된 URL 안내 → Ocean 문단 질문 → 추측 → 설명 → 원문 왕복 후 상태 유지 → 카드 dialog 키보드 Tab 순환 → Escape 시 미저장 변경 버리기 확인 → 편집 계속 → 초안 저장.
- 홈, Reading, History, 카드 목록, Tutor 추측·설명·퀴즈, 카드 미리보기, 모바일 Tutor 캡처 생성. 대표 데스크톱/모바일 캡처를 직접 열어 시각 확인.

캡처 위치: `test-results/screenshots/`. 테스트 출력은 Git에서 제외되며 E2E 재실행 시 교체됩니다.

## 발견하고 수정한 오류

| 발견 단계 | 문제 | 수정·재검증 |
| --- | --- | --- |
| 최초 typecheck | History JSX 괄호 불일치, quiz ID 타입 불일치 | JSX 수정, 선택지 literal union 적용, typecheck 통과 |
| 최초 lint | effect 내부 동기 setState로 카드 URL을 읽음 | Next 서버 페이지에서 initialCard 전달, lint 통과 |
| 최초 Chrome E2E | 127.0.0.1 Origin과 Next 내부 localhost URL 차이로 정상 저장 차단 | 실제 Host 기준 same-origin 검사, 전체 흐름 통과 |
| 키보드 E2E | dialog 마지막 요소에서 Tab 시 브라우저 chrome으로 포커스 이동 | Tab/Shift+Tab 명시적 순환, 12회 순환 검사 통과 |
| 의존성 audit | drizzle-kit의 간접 esbuild 개발 서버 취약점 | 범위 제한 override로 esbuild 0.25.12 사용, 재설치 후 audit 0, migration 재검증 |

## 실제 외부 연동·미검증·남은 범위

- **실제 Wikipedia/OpenAI: 연결하지 않음.** 모든 본문·설명은 Mock이며 API 키 불필요.
- **실제 Anki Desktop 가져오기: 미검증.** TSV 직렬화·다운로드만 검증. Anki 등록 완료로 표시하지 않음.
- **클라우드 배포·소유자 인증·실제 AI 비용/요청 제어: 미구현.** 로컬 서버 사용 단계.
- **시제품 픽셀 비교: 미검증.** ZIP 미첨부, 원격 시제품 열기 실패. UI_SPEC 수치를 기준으로 재현.
- **실물 태블릿 터치 선택, 200% 브라우저 확대, 스크린리더, 모든 색 대비 수치: 미검증.** 뷰포트와 키보드 자동 검증을 전체 접근성 인증으로 취급하지 않음.
- 다중 문단 anchor, IME 강제 종료, quota/디스크 고장, 모든 입력의 동시 탭 충돌, 완전한 미저장 이동 차단, 서버 중단 직전 debounce 복구는 이번 UI 단계의 보장 범위 밖. 관련 명세 P0 전체를 완료 표시하지 않음.
- 학습 과정 검증은 mock 단위의 T-WIKI/T-AI/T-QUIZ/T-STORE/T-HISTORY/T-CARD/T-EXPORT/T-UI 부분 증거입니다. 실연동을 요구하는 AC 및 M9 완료 조건은 미완료입니다.

## 실행

```powershell
npm run dev
```

기본 로컬 주소: http://127.0.0.1:3000

실제 파일 DB: `data/reading-room-demo.db`. E2E 전용: `data/e2e.db`. 단위 테스트 DB는 별도의 임시 폴더에서 생성·제거합니다.

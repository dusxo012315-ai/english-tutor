# 통합 학습 기록 · Listening 구현 보고

검증일: 2026-09-25. Windows, Node.js, Chrome/Playwright. OpenAI API 호출 없음.

## 1. 추가 파일

- `src/domain/learning.ts`: 공통 세션·라운드·질문·표현 모델, 검증, Listening 프롬프트, History 필터, 주간 통계.
- `src/data/learning-repository.ts`: 공통 저장 동작과 이전 Companion 기록 backfill.
- `src/app/listening/page.tsx`, `src/app/listening/[sessionId]/page.tsx`: Listening 진입·세션 경로.
- `src/features/listening/listening-page.tsx`, `listening-session.tsx`, `listening-companion.tsx`: 시작 폼, 네 단계, 결과, 표현·메모, Companion.
- `src/features/learning/dashboard-stats.tsx`: 주간 통계.
- `src/features/tutor/interaction-reflection.tsx`: 직접 작성한 배운 내용·이해 정도·핵심 설명, 질문 이력.
- `drizzle/0001_steady_captain_cross.sql`, `drizzle/meta/0001_snapshot.json`: 새 스키마와 SQL 마이그레이션.
- `tests/learning.test.ts`, `tests/e2e/learning.spec.ts`, `playwright.learning.config.ts`: 단위·저장소·브라우저 검증.
- `LEARNING_TEST_REPORT.md`: 이 보고서.

## 2. 변경 파일

- `src/domain/types.ts`, `schemas.ts`: AppState v2, 새 액션과 입력 제한.
- `src/data/schema.ts`, `repository.ts`: 새 테이블, 기존 Reading 시작·완료와 공통 세션 연결.
- `src/components/shell.tsx`: Listening 메뉴.
- `src/features/home/home-page.tsx`, `history/history-page.tsx`, `reading/reading-page.tsx`: 통계, 모드별 History, 세션 메모.
- `src/features/tutor/companion-panel.tsx`: Reading 질문·수동 학습 결과 기록. 기존 6개 질문, 수정·복사·팝업·카드 유지.
- `src/app/globals.css`: 기존 스타일과 맞춘 Listening·결과·통계·모바일 화면.
- `drizzle/meta/_journal.json`, `scripts/migrate.ts`: 마이그레이션 등록·안내.
- `package.json`: 단위 테스트 및 통합 E2E 스크립트.
- `.gitignore`: `/data/`로 범위를 고쳐 사용자 DB는 제외하면서 `src/data/` 소스가 추적 대상이 되도록 수정.
- `README.md`: 사용법, 저장 원칙, 마이그레이션, 시간·통계 기준, 테스트 명령.

작업 시작 시 저장소의 기존 파일들도 모두 untracked 상태였습니다. 위 목록은 이번 단계의 논리적인 추가·변경 구분입니다. Git 커밋은 생성하지 않았습니다.

## 3. DB 변경

`learning_sessions`에 공통 ID·학습 유형·출처·직접 입력한 제목·레벨·시작/완료 시각·경과 초·메모를 저장합니다. `listening_details`는 라운드별 상세, `companion_interactions`는 질문과 수동 학습 결과, `learned_expressions`는 명시적으로 저장한 짧은 표현을 보관합니다. 상세 테이블들은 공통 세션을 외래 키로 참조합니다. 기존 Reading 상세·스냅샷·Anki 테이블은 유지합니다.

Listening 임시 텍스트는 React 메모리에서 프롬프트 복사에만 사용합니다. 서버 액션은 임시 원문·클라이언트 생성 프롬프트 필드를 허용하지 않습니다. 서버가 기록용 프롬프트를 별도로 생성하며 selectedText/context는 null로 저장합니다. 따라서 History의 Listening 프롬프트는 실제 복사한 프롬프트에서 임시 입력을 제외한 형태입니다.

## 4. 마이그레이션

SQL로 기존 Reading ID·시각·출처를 공통 모델에 이관합니다. 과거 소요 시간은 추정하지 않고 null로 유지합니다. 기존 Companion 초안은 서버 backfill에서 한 번만 질문 기록으로 이관합니다. 이전 창 열기 여부는 false이며 의미는 미확인입니다. 앱 재시작 시 중복되지 않는 것을 검증했습니다.

실제 DB에도 `npm run db:migrate`를 실행했습니다. SQLite backup API로 만든 `data/backups/before-learning-1790268365033.db`와 비교했으며 snapshots 5개, sessions 4개, learning_items 6개, cards 3개가 내용까지 동일했습니다. 기존 사용자 세션 `53d9ace2-0c44-4b10-93a4-4b07597fd296`와 공통 메타데이터가 모두 존재합니다. SQLite integrity_check=ok, foreign_key_check 오류 0개입니다.

## 5. 화면

- `/listening`: URL·제목·레벨 입력, 기존 세션 이어서 열기.
- `/listening/[sessionId]`: First Listening → Script Check → Listen Again → Final Recall → 결과. 모든 단계에서 Companion 사용 가능.
- `/history`: ALL / READING / LISTENING, 출처·레벨·이해도·어려운 이유·요약·메모·표현·질문과 What I learned.
- `/`: 한국 시간 월요일 기준 세션 수, 저장된 이해도의 평균, 어려운 이유 빈도.
- 기존 Reading과 Anki 화면 유지. Listening에서 저장한 짧은 표현은 History에 보관하며 새 Anki 자동 생성 기능은 추가하지 않았습니다.

## 6. 테스트 범위

단위·저장소: 세션 유형, 라운드 순서·재시작 저장, 0~100 정수, BNE HTML URL 검증, 7개 프롬프트, 임시 입력 배제, Reading 인용·문맥, 수동 학습 결과, History 필터, 주간 통계, 실제 구버전 SQL 마이그레이션을 확인합니다.

브라우저: 전체 Listening 과정과 History·Dashboard, 클립보드 실제 읽기, 팝업과 차단 후 새 탭, 클립보드 권한 오류, 임시 텍스트가 API 요청·전체 DB 상태에 없는지, Reading 6개 질문·수정·선택 초기화·재시작·카드 검토·TSV 내보내기, 모바일 레이아웃을 확인합니다.

BNE와 ChatGPT는 Playwright 네트워크 Mock으로 대체합니다. 현재 통합 테스트의 Wikipedia도 Mock입니다. 실제 외부 사이트의 로그인·오디오 재생·답변 동작이나 OpenAI 유료 호출은 테스트하지 않았습니다. 이전 OpenAI 어댑터의 단위 테스트는 Mock 응답으로 실행합니다.

## 7. 실행 결과

| 명령/검사 | 최종 결과 |
| --- | --- |
| `npm test` | 31/31 통과, 실패 0 |
| `npm run test:e2e:learning` | 8/8 통과, 실패 0 |
| `npm run test:e2e:legacy` | 3/3 통과, 실패 0 |
| `npm run lint` | 통과, 오류·경고 없음 |
| `npm run typecheck` | 최종 순차 실행 통과 |
| `npm run build` | production build 통과, 새 Listening 경로 생성 확인 |
| `npm run db:migrate` | 통과, 기존 데이터 보존·DB 무결성 확인 |
| 개발 서버 최종 확인 | 127.0.0.1:3000 실행, Home·Listening·History·Anki·기존 Reading 세션 모두 HTTP 200, API schemaVersion 2 |

중간 오류도 수정했습니다. 구현 중 JSX와 액션 타입 좁히기 오류를 수정했고, 재검증 중 `.next/dev/types/routes.d.ts` 생성 파일에 중복 꼬리가 남아 타입 검사와 Reading 조회 E2E 1개가 실패했습니다. 테스트 서버 종료 후 해당 생성 파일 하나를 제거하고 재생성하여 통합 E2E 8개가 모두 통과했습니다. 테스트/개발 서버와 Next 빌드는 동시에 실행하지 않는 순서로 검증했습니다.

캡처: `artifacts/learning/dashboard.png`, `artifacts/learning/listening-mobile.png`. 데스크톱 대시보드와 390px 모바일 Listening 화면을 확인했습니다. 테스트 중 Node의 NO_COLOR/FORCE_COLOR 환경 경고는 있었으나 테스트 실패 원인은 아닙니다.

## 8. 직접 확인할 사항

1. 자신의 BNE lesson HTML URL을 입력하고 원 사이트에서 듣기·스크립트 확인을 진행하세요. 앱은 URL의 실제 존재 여부를 조회하지 않습니다.
2. 자신의 브라우저에서 클립보드 권한, ChatGPT 로그인, 붙여넣기·직접 전송, 팝업 크기를 확인하세요. 창 크기와 팝업/탭 선택은 브라우저 정책에 따라 다릅니다.
3. 각 단계의 완료 버튼과 메모·배운 내용 저장 버튼을 누른 뒤 History에서 확인하세요. 아직 저장하지 않은 입력과 임시 질문 텍스트는 이동·새로고침 시 사라집니다.
4. 기존 Reading Anki TSV를 실제 Anki에 가져오는 동작은 사용자가 확인해야 합니다. 자동화는 파일 생성·필드·출처와 앱 안의 검토까지 확인합니다.

학습 시간은 휴식을 포함한 시작~완료 경과 시간입니다. ChatGPT 창 열기 기록은 실제 질문 전송·답변 여부를 보장하지 않습니다. 기사 전체를 자기 메모나 수동 설명 입력란에 붙여 넣지 마세요.

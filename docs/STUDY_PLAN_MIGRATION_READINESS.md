# Study Plan — TEST Turso 적용 전 준비 보고서

이 문서는 승인된 로컬 구현과 격리 DB 검증을 기록합니다. 실제 TEST Turso migration, Git commit/push, Preview 배포, Production 작업, 환경 파일 변경은 수행하지 않습니다. 실제 사용자 DB는 검증 자료로 사용하지 않습니다.

## 1. 실제 구현 내용

- `/plan`: Reading 또는 Listening 계획 여러 개 생성, 이름 변경, 확인 후 삭제.
- Reading: Simple English Wikipedia 제목/URL로 기존 공식 API importer를 통해 자료를 저장하고 계획에 추가.
- Listening: 사용자가 적은 제목, BNE lesson HTML URL, level만 추가. 본문/문제/음원 요청 없음.
- 항목 삭제, ↑/↓ 순서 변경, 같은 자료를 같은 계획/여러 계획에 추가 가능.
- Start Reading / Start Listening, Continue, View session. 완료 상태는 실제 LearningSession에서 계산.
- Home의 Next to Study, History의 Study Plan 역링크.
- Simple Wikipedia 전용 Print / Save as PDF 화면.

## 2. 최종 DB schema

기존 14개 앱 테이블은 유지하고 2개 테이블만 추가합니다. AppState 버전은 4 → 5입니다.

`study_plans`: id(PK), type(READING/LISTENING), name, created_at, updated_at.

`study_plan_items`: id(PK), plan_id(FK), position, title, source_type, source_url, level(nullable), article_id(nullable FK), session_id(nullable FK), created_at, updated_at.

- `(plan_id, position)` UNIQUE; `position >= 0`.
- `session_id` UNIQUE: NULL 여러 개는 허용하며 연결된 세션은 항목 하나에만 속함.
- plan FK와 article FK는 NO ACTION. LearningSession FK는 ON DELETE SET NULL.
- Reading item: WIKIPEDIA, article_id 필수, level NULL.
- Listening item: BREAKING_NEWS_ENGLISH, article_id NULL, level 0–6/other 필수.
- Plan 유형과 항목 유형 일치는 repository에서 검증. 클라이언트가 학습 상태를 지정할 수 없음.
- 상태·완료일은 새 테이블에 복제하지 않음. `completedAt`이 있는 연결 세션은 COMPLETED, 나머지 연결 세션은 IN_PROGRESS, 연결이 없으면 PLANNED.

## 3. 생성된 migration

`drizzle/0004_tranquil_roulette.sql`, `drizzle/meta/0004_snapshot.json`, journal의 새 항목.

정확한 적용 SQL은 위 SQL 파일입니다. CREATE TABLE 2개, CREATE INDEX 4개(그중 UNIQUE 2개), FK와 CHECK 제약만 포함합니다. 기존 테이블 ALTER/DROP, 기존 행 UPDATE/DELETE, 데이터 backfill은 없습니다. 0000–0003 migration은 변경하지 않았습니다.

## 4. 기존 DB 영향

학습 내용과 기존 ID는 유지됩니다. 새 테이블은 비어 있는 상태로 시작합니다. 새 코드의 `/api/state`는 두 테이블이 필요하므로 **schema 적용 전 새 Preview 코드를 배포하면 안 됩니다.** 기존 배포는 이번 작업에서 변경하지 않습니다.

`scripts/migrate.ts`는 repository 초기화 대신 connection migration만 수행합니다. 이전 스크립트의 seed/backfill 부수 효과를 제거했습니다. 원격 실행은 `--test`뿐 아니라 `--approved-test-cloud`가 있어야 연결합니다. 이 옵션은 실제 승인 이후 작업에서만 사용합니다.

## 5. Snapshot 정리 정책

현재 `snapshots`는 기존 Reading에서도 공유하는 자료 catalog입니다. Wikipedia page/revision/content 기반 ID로 재사용하며, Plan 전용 임시 소유권 필드는 없습니다.

따라서 Plan 또는 학습 전 항목 삭제 때도 snapshot을 보존합니다. 다른 세션/항목의 참조 여부와 무관하게 공용 catalog 자료를 임의로 정리하지 않습니다. 참조가 없어졌다는 이유만으로 사용자가 저장한 원문을 지우지 않으며 별도 GC는 추가하지 않았습니다. BNE 항목은 snapshot을 만들지 않습니다.

## 6. LearningSession 연결

`startPlanItem`의 transaction 안에서 기존 session_id를 먼저 확인합니다. 있으면 그대로 반환하며, 없을 때만 기존 Reading/Listening 생성 로직을 호출하고 항목에 연결합니다. 생성과 연결은 같은 transaction입니다. 연결 단계가 실패하면 세션 생성까지 rollback됩니다.

순서는 충돌하지 않는 임시 양수 범위로 옮긴 뒤 0부터 재배치하므로 UNIQUE 제약을 유지합니다. plan/item 생성 요청 ID의 재사용은 동일 요청에 한해 재반환하며, 내용이 다른 재사용은 거절합니다.

## 7. History 삭제와의 관계

기존 History 삭제 transaction에 항목의 session_id 해제와 updated_at 갱신을 추가했습니다. 삭제 실패 시 이 변경도 rollback됩니다. DB FK의 SET NULL도 안전장치입니다. 항목은 PLANNED로 돌아오며 다음 Start에서 새 세션을 만듭니다.

반대로 Plan/item 삭제는 세션, Companion, History, Anki, Review를 지우지 않습니다. 독립 Anki 보존 등 기존 History 삭제 정책도 유지합니다.

## 8. PDF 구현 방식

`/print/[articleId]`는 로그인 보호를 받는 별도 화면이며 실제 Simple Wikipedia provider/revision/attribution이 있는 snapshot만 표시합니다. title, 본문, source URL, revision ID/URL, 저작자 및 history URL, license 이름/URL, 변경·생략 고지를 포함합니다.

React의 텍스트 렌더링을 사용하며 학습 메모, 질문, ChatGPT 내용은 인쇄 화면에 넣지 않습니다. `window.print()`로 브라우저의 Print / Save as PDF를 열고 인쇄 CSS로 버튼을 숨깁니다. PDF 파일의 서버 생성/저장은 없으며 BNE와 Mock 자료에는 제공하지 않습니다.

## 9. 주요 변경 파일

신규:

- `src/domain/study-plan.ts`: 타입, action validation, 상태/다음 항목 계산.
- `src/data/plan-repository.ts`: CRUD, 순서, 안전한 세션 생성/연결.
- `src/features/plan/{plan-page,plan-links,article-print}.tsx`.
- `src/app/plan/page.tsx`, `src/app/print/[articleId]/page.tsx`.
- migration 0004, `tests/study-plan.test.ts`, `tests/fixtures/plan-article.ts`, `tests/e2e/study-plan.spec.ts`, `playwright.plan.config.ts`.

변경:

- schema/repository/session-deletion, domain schemas/types.
- Shell/Provider/Home/History/Reading/globals.css 및 History 삭제 확인창.
- package.json, migration journal, scripts/migrate.ts, scripts/prepare-e2e.ts.
- `tests/e2e/companion.spec.ts`: 자동 저장 완료를 확인한 뒤 카드 검토 버튼을 클릭하도록 안정화.
- E2E fixture 초기화는 file DB만 허용하도록 강화. 외부 원문을 가장하는 fixture는 격리 테스트에서만 사용.

## 10. Unit / integration

`npm test`: **73 / 73 통과**. 신규 Study Plan 테스트 7개가 local SQLite와 file libSQL 두 경로를 검증합니다. 기존 66개 테스트도 모두 통과했습니다.

신규 검증 범위: 입력/타입, 생성 요청 중복, 같은 콘텐츠의 여러 항목/여러 Plan 추가, 이름 변경, ↑/↓와 순서 unique 제약, 항목/Plan 삭제, 동시 Start의 동일 세션 반환, 완료 계산, History 삭제 후 연결 해제와 재시작, 공유 snapshot 보존, History/Anki/Review 보존, 재접속, 잘못된 ID/자료 유형/URL, 생성/연결/삭제 실패 rollback, revision 변경.

## 11. E2E

- Plan: SQLite **3 / 3**, file libSQL **3 / 3 통과**.
- Reading: 제목/URL 입력, 중복 추가, 이름/순서 변경, 인쇄 화면, Start/Continue, 완료 표시, History 삭제 후 PLANNED, Home, 새로고침.
- Listening: Plan에서 바로 시작, 모든 round/Final Recall, 자동 완료 표시, 삭제 취소/확인, History 보존.
- 로그인 보호(`/plan`, `/print`, `/api/state`), 잘못된 ID, stale revision 409, 독립된 두 브라우저 context의 로그인과 focus 갱신.
- Chrome 375/768/800/1024/1440px에서 가로 넘침 없음. 인쇄 CSS와 attribution 표시 및 window.print 호출 검증. `artifacts/study-plan/`에 합성 fixture 화면 캡처를 생성하고 직접 확인했습니다.
- 기존 V1 회귀 **21 / 21**, 인증·History 삭제 **5 / 5**, 실제 Wikipedia **4 / 4 통과**. Himalayas, Physics, Albert Einstein과 오류 후 재시도를 검증했습니다.
- 편집 dialog가 열려 있을 때 포커스를 Save 버튼으로 옮겨도 revision을 자동 교체하지 않도록 보완했습니다. 두 브라우저가 같은 Plan 이름을 수정하면 오래된 초안 저장을 409로 막고 최신 이름을 보존하는 테스트를 추가했습니다. 최종 코드 기준 E2E 총 **36 / 36 통과**를 확인했습니다.

초기 E2E의 Level 선택자와 누락된 필수 최종 이해도 입력을 수정했습니다. 기존 Companion 테스트에서 자동 저장 중 버튼 비활성화와 클릭이 겹쳐 카드 요청이 전송되지 않는 타이밍 문제를 trace로 확인했고, 저장 완료 상태를 기다리도록 보완했습니다. 실패를 skip하거나 기능 기대값을 완화하지 않았습니다. ChatGPT/BNE는 실제 로그인/콘텐츠 대신 기존 외부 사이트 mock을 사용합니다.

## 12. Lint / typecheck / build

- `npm run lint`: 통과.
- `npm run typecheck`: 통과.
- `npm run build`: 통과. `/plan`, `/print/[articleId]` 포함 정상 빌드.
- 빌드 개인정보 검사: 37개 manifest 검사, 사용자 DB·환경 파일·개인 artifacts 포함 없음.
- `git diff --check`: 통과. 환경 파일/실제 DB 및 기존 migration 0000–0003 변경 없음.

## 13. 격리 DB migration

local SQLite 및 file libSQL에서 모두 통과했습니다.

- 기존 0000–0003을 실제 SQL로 적용한 격리 DB에 14개 기존 앱 테이블의 합성 fixture를 넣음.
- 0004 적용 전후 기존 테이블의 모든 행/필드 원문이 동일함을 비교(단순 개수 확인보다 강한 검사).
- 같은 migration 재실행 시 중복 적용 없음. journal 수와 hash 검증 유지.
- migration 뒤 의도적 오류 발생 시 새 테이블 생성과 journal 삽입 모두 rollback.
- foreign_key_check: 위반 없음. integrity_check: `ok`.
- 세션 연결 실패 및 History/Plan 삭제 실패 때 데이터 전체 rollback.
- 기존 0000–0003 SQL/metadata 파일은 변경되지 않음.

이 결과는 실제 원격 TEST DB나 Galaxy 실기기 검증을 의미하지 않습니다.

## 14. 실제 TEST Turso에 적용될 변경

적용 대상은 0004 SQL과 migration journal의 해당 hash 기록입니다. 새 테이블 2개/인덱스 4개만 생기며, 기존 기록에 Plan을 자동 연결하지 않습니다. 원격 DB의 적용 이력이 로컬 0000–0003과 일치하는지 아직 확인하거나 변경하지 않았습니다.

## 15. 별도 승인 후 적용 전 백업·검증 절차

1. 현재 대상이 기존 TEST DB인지 확인하고 사용자 두 기기의 쓰기를 잠시 중단합니다. 비밀값은 출력하지 않습니다.
2. TEST DB의 일관된 전체 백업을 접근 제한된 위치에 만듭니다. 현재 `db:backup`은 **로컬 SQLite 전용**이므로 원격 백업이라고 사용하지 않습니다. 원격 전체 백업을 별도 로컬 DB로 복원해 확인한 뒤에만 진행합니다.
3. 기존 테이블 목록, 각 row count, 정렬된 행 내용 hash, migration hash/timestamp, foreign_key_check/integrity_check 결과를 기록합니다. 원문/사용자 메모·토큰은 보고서나 Git에 출력하지 않습니다.
4. 기존 0000–0003 hash가 일치하고 새 Plan 테이블이 없는지 확인합니다. 다르면 적용을 중단합니다.
5. 같은 백업 복제본에서 0004를 다시 검증합니다. backup 파일 및 복원 성공 여부를 확인합니다.
6. 승인된 TEST DB에 migration-only runner를 transaction으로 실행합니다. 기존 테이블 count/hash가 모두 동일하고 새 테이블이 비어 있으며 FK/integrity가 정상인지 검증합니다.
7. 그 뒤 별도 승인 범위에서만 Git/Preview 단계로 진행합니다. 두 기기는 새로고침해 새 revision을 받습니다.

## 16. Rollback

- migration 실패: DDL와 journal 기록을 포함한 transaction 전체 rollback. 로컬 SQLite/libSQL에서 이 경로를 검증합니다.
- 적용 후 앱 문제: 우선 이전 코드로 복귀하고 **추가 테이블은 보존**합니다. 기존 코드와 호환되는 additive schema이며, 새 Plan 데이터 손실을 피합니다.
- 테이블을 제거하는 물리 rollback은 자동 실행하지 않습니다. Plan 데이터와 적용 이후 학습 기록을 별도 보존하고 사용자 승인 후 수행합니다. 적용 전 백업으로 무조건 덮어쓰면 그 이후 학습 데이터가 손실되므로 금지합니다.

## 17. 예상 위험·제한

- 실제 원격 TEST migration 이력/백업/네트워크 잠금은 아직 검증하지 않았습니다.
- 새 코드 먼저 배포하면 테이블 누락 오류가 납니다. schema 먼저, 코드 나중 순서가 필요합니다. 기존 원격 DB에 연결된 로컬 개발 서버도 동일하므로, 승인 전 새 기능 확인은 migration된 격리 DB에서만 해야 합니다.
- 다른 기기에서 변경한 뒤 오래 열린 폼을 저장하면 기존 정책대로 conflict가 발생하며 새로고침이 필요합니다. Plan 읽기 화면은 포커스 복귀/주기적 조회로 갱신하고, 편집 dialog가 열려 있을 때는 원래 revision을 유지합니다.
- Wikipedia 불러오기는 외부 API 응답에 의존합니다. 불러오기 성공 뒤 계획 추가가 취소·실패해도 snapshot은 공용 catalog로 남습니다.
- PDF 대화상자, 파일 저장 위치, 페이지 나눔은 브라우저/기기에 따라 다릅니다. Galaxy 실기기 Save as PDF는 수동 확인 대상입니다.
- drag는 추가하지 않았으며 키보드/터치로 사용 가능한 ↑/↓를 제공합니다.

## 18. 적용 준비 상태

구현과 격리 DB 검증은 완료되어 **TEST Turso 적용을 위한 백업·사전 검증 단계로 진행할 준비가 되었습니다.** Unit/integration 73개, E2E 36개, lint/typecheck/build가 모두 통과했습니다.

원격 DB 자체의 migration 이력과 백업 복원 검증은 아직 수행하지 않았으므로 무조건 적용 가능하다고 보장하지 않습니다. 별도 승인 후 15절의 사전 검증을 통과해야 실제 migration을 실행합니다. 실제 TEST Turso 및 사용자 DB, 환경 파일은 변경하지 않았으며 commit/push/Preview 배포도 수행하지 않았습니다.

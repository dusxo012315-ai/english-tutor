# DEPLOYMENT PREPARATION REPORT

최종 확인일: 2026-09-27. 범위: Vercel Hobby + Turso Free + 앱 내부 단일 비밀번호의 PHASE 1/2 및 PHASE 3 설정 준비.

**원격 Preview는 아직 배포하지 않았습니다.** 사용자가 계정을 아직 만들지 않았으므로 계정 생성·수동 설정 안내를 준비했습니다. 운영 DB 생성, 기존 데이터 이전, production 전환, 결제, 도메인 구매는 하지 않았습니다.

## 1. 변경한 코드

새 파일:

- `src/data/connection.ts`: 공통 비동기 Drizzle 연결 및 transaction
- `src/server/environment.ts`, `auth.ts`, `revision.ts`: 환경 검증·인증·충돌 검증
- `src/proxy.ts`: 페이지/API 인증 경계
- `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`, `logout/route.ts`
- `src/components/auth-navigation.ts`, `logout-button.tsx`
- `scripts/auth-secret.ts`, `scripts/prepare-e2e.ts`, `scripts/check-build-privacy.mjs`
- `tests/deployment.test.ts`, `tests/e2e/deployment.spec.ts`, `playwright.deployment.config.ts`
- `.vercelignore`, `PREVIEW_SETUP.md`, 이 보고서

주요 변경 파일:

- `src/data/repository.ts`, `learning-repository.ts`, `anki-repository.ts`, `review-repository.ts`: 모든 DB I/O await
- `src/server/store.ts`, `tutor-runtime.ts`: 드라이버 선택·비동기 호출; OpenAI 어댑터 비활성 보존
- `src/app/api/state/route.ts`, `src/app/api/articles/resolve/route.ts`: 인증·Origin·safe error·revision
- `src/components/provider.tsx`, `shell.tsx`: 최신 조회·충돌 차단·로그아웃 UI
- `src/features/anki/quick-add.tsx`: 선택 저장 중 이전 패널에서 대화상자를 여는 race 방지
- `src/features/tutor/companion-panel.tsx`, `src/features/history/history-page.tsx`: local 전용 저장 문구 제거
- `scripts/migrate.ts`, 기존 repository 관련 단위 테스트와 Playwright config: 비동기·격리 DB 대응
- `package.json`, `package-lock.json`: @libsql/client 및 시험/비밀번호 스크립트
- `.env.example`, `.gitignore`, `tsconfig.json`, `next.config.ts`, `README.md`

현재 저장소는 최초 commit 전 상태여서 `git status`는 기존 파일도 untracked로 표시합니다. 위 목록은 이번 작업 범위입니다.

## 2. DB abstraction

기존 Drizzle schema/JSON payload와 Repository 인터페이스를 유지했습니다. sqlite-proxy의 비동기 query callback 아래에서 local은 better-sqlite3, cloud는 @libsql/client를 사용합니다. 서버 Repository의 `ready`를 기다린 후 조회·수정합니다.

local 쓰기는 BEGIN IMMEDIATE, libSQL 쓰기는 SDK write transaction입니다. 연결별 작업 큐로 transaction과 일반 조회의 혼입을 막고, AsyncLocalStorage로 하위 Repository의 호출을 같은 transaction에 포함합니다. 중첩 transaction은 독립 savepoint가 아니라 외부 transaction에 참여하며, 내부 실패를 catch하더라도 외부 작업 전체를 rollback합니다. rollback·동시 호출·재시작 지속성·외래키 위반 거부·TSV 상태 변경을 양 드라이버에서 검증했습니다.

## 3. local / Turso 전환

- `DB_MODE=local`: 별도 `DATABASE_PATH`의 SQLite. better-sqlite3 유지.
- `DB_MODE=libsql`: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. Preview는 반드시 TEST DB.
- libSQL `file:`은 비production 시험만 허용합니다. Vercel에서는 local 파일 DB를 거부합니다.
- APP_MODE는 더 이상 실행 모드를 결정하지 않습니다. DB_MODE/WIKIPEDIA_MODE/TUTOR_MODE를 분리합니다.
- 기존 `data/reading-room-demo.db`를 여는 경로는 보호합니다. `.env.local`을 수정하지 않았으므로 README의 별도 시험 환경변수를 사용해야 합니다.

## 4. 인증

회원가입·프로필·다중 사용자 없이 비밀번호 1개입니다. salted scrypt hash로 검증하고 HMAC-SHA256 서명 쿠키를 발급합니다. 쿠키는 HttpOnly, SameSite=Strict, Path=/, 30일 만료이며 HTTPS/production에서는 Secure입니다. 로컬 HTTP 개발에만 Secure=false 예외가 있습니다.

Proxy에서 모든 주요 페이지/API를 보호하고 state·Wikipedia route에서도 재검증합니다. 변경 API는 APP_URL과 Origin 일치를 요구합니다. 로그인 실패 메시지는 일반화하며, 설정 누락 시 인증을 우회하지 않습니다. 로그아웃은 해당 브라우저 쿠키와 앱 초안을 지우고 전체 문서를 다시 로드합니다. 미저장 초안이 있으면 확인을 받습니다.

비밀번호 hash/서명 secret 교체 시 기존 서명은 무효화됩니다. 개별 토큰의 서버 저장·폐기는 구현하지 않았으므로 복사된 유효 토큰은 만료/secret 교체 전까지 유효할 수 있습니다. 로그인 요청 제한은 프로세스별 보조 장치이며 Preview에서 플랫폼 WAF 제한도 설정해야 합니다.

## 5. 환경변수

필수 Preview: `DB_MODE=libsql`, `DATABASE_PURPOSE=test`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_ENABLED=true`, `APP_PASSWORD_HASH`, `AUTH_SECRET`, 정확한 HTTPS `APP_URL`.

권장: `DEV_SEED=false`, `WIKIPEDIA_MODE=live`, `TUTOR_MODE=companion`. local만 `DATABASE_PATH` 사용. 전체 표와 비밀번호 생성은 [PREVIEW_SETUP.md](PREVIEW_SETUP.md)에 있습니다. DB 토큰·인증 secret을 NEXT_PUBLIC 변수에 넣지 않습니다. OPENAI_API_KEY는 사용하지 않습니다.

## 6. DB migration

새 테이블/새 SQL migration은 없습니다. 기존 `drizzle/`의 4개 migration 및 기존 Reading/Anki backfill을 유지합니다. `npm run db:migrate:test`만 허용하며 TEST DB의 journal/hash를 확인하고 schema를 준비합니다. cloud 런타임에서는 자동 migration하지 않습니다.

이번 작업은 격리된 시험 DB만 생성·변경했습니다. 실제 원본 데이터 backup/import/행 수 검증은 운영 이전 전에 별도 단계로 수행해야 하며 이번에 완료했다고 주장하지 않습니다. 원본 파일의 작업 전후 SHA-256은 동일합니다:

`31F7CF6EDD02498652D40895FC8B75F39FCB1F2A4612162ABA852F68BD254DB8`

## 7. Preview 준비 상태

앱 코드·환경 예제·시험 schema 명령·설정 안내를 준비했습니다. 계정/TEST Turso/원격 토큰/Vercel 프로젝트가 없으므로 실제 원격 연결 및 배포는 미실행입니다. libSQL 파일 모드 성공이 Turso 네트워크·Vercel 런타임 성공을 보장하지는 않습니다. 운영 전환은 잠겨 있습니다.

## 8. 자동화 테스트

시험은 원본과 분리된 DB에서 실행했습니다.

| 범위 | 결과 |
|---|---|
| 단위/통합 전체 | 55/55 통과 |
| local V1 E2E | 21/21 통과 |
| libSQL 파일 모드 V1 E2E | 21/21 통과 |
| 인증/두 context 충돌/Tablet E2E | 2/2 통과 |
| 실제 MediaWiki 서비스 테스트 | 3/3 통과 |
| 이전 Mock 화면 E2E | 3/3 통과 |
| 실제 Wikipedia 브라우저 E2E | 4/4 통과 |
| TEST schema CLI (local / libSQL file) | 양쪽 성공 |

인증 검증: 비로그인 페이지와 `/api/state` GET/POST 및 Wikipedia API 차단, 잘못된 비밀번호, 로그인 후 접근, 로그아웃 후 차단, HTTPS Secure/HttpOnly/Strict 쿠키와 만료, 변조/기한 검사, Origin 거부, 로그인 제한. 별도 브라우저 context의 stale revision은 409이고 최신 조회에는 다른 context의 새 기록이 보입니다.

Reading/Listening/Companion/History/Review/Anki/TSV/Resume·draft 복원·중복 카드·재내보내기·오류 화면을 기존 V1 suite로 검사했습니다. 외부 ChatGPT/BNE는 mock입니다. 실제 Wikipedia는 Himalayas/Physics/Albert Einstein 본문·선택/문맥을 확인했습니다. Tablet 768/800/1024px는 설치된 Chrome의 viewport 시험이며 실제 Galaxy 하드웨어 검증은 남아 있습니다.

수정 중 libSQL Quick Add race 1건을 발견하고 버튼 대기 처리 후 21/21로 재검증했습니다. 빌드 검사 중 readonly NODE_ENV 테스트 타입 오류와 동적 파일 경로 tracing 경고도 수정했습니다. 테스트 중 Next 설정 변경으로 발생한 이전 화면 E2E의 서버 재시작 실패는 설정 고정 후 3/3으로 재검증했습니다. 저장 상태 문구 변경에 맞춰 Wikipedia/Companion 테스트의 기대 문구도 갱신했습니다. Tablet 캡처에서 로그아웃 글자 줄바꿈을 발견해 상단 아이콘 버튼으로 변경했고, Tablet 검사는 로딩 제목 대신 각 페이지의 실제 제목을 기다리도록 강화했습니다.

로그: `artifacts/deployment-*.log`. TSV fixture/export 기존 검증은 UTF-8·한글·apostrophe·특수문자·탭/줄바꿈·고정 필드 수를 포함합니다.

## 9. lint / typecheck / build

`npm run lint` 통과(오류/경고 없음), `npm run typecheck` 통과, `npm run build` 통과했습니다. build에는 개인정보 파일 추적 검사를 포함하며 최종 manifest 33개에서 DB·환경 파일·개인 산출물 포함 항목이 0건입니다.

Next 개발 서버가 route 타입을 생성하는 중의 typecheck는 임시 생성 파일 불일치로 실패하여 E2E 종료 후 순서대로 재검증했습니다. Windows/OneDrive의 이전 `.next` 경로 잠금은 기존 산출물을 `artifacts/` 아래에 보존하고 새 빌드 폴더를 생성해 해결했습니다. API route 제외 설정만으로는 Proxy trace의 원본 DB 경로까지 제거되지 않는 점도 발견해 해당 경로 연산을 tracing에서 제외했습니다. 외부 업로드는 없었습니다. `npm run build` 마지막의 privacy gate가 향후 재발 시 빌드를 실패시킵니다.

`artifacts/build-before-trace-fix`에는 수정 전 로컬 빌드가 보관되어 있으며 DB 복사본을 포함할 수 있습니다. 이 폴더는 개인 자료로 취급하고 공유하지 않습니다. Git 및 Vercel 업로드에서 artifacts 전체를 제외했습니다. 최종 `.next` 빌드는 위 privacy 검사를 통과했습니다.

작업 재개 시 E2E 자동 생성 `validator.ts`의 import 문 손상을 발견했습니다. 생성 타입 폴더를 artifacts에 보관한 뒤 공식 `next typegen`으로 다시 생성했습니다. `typecheck`도 route 타입 생성 후 TypeScript 검사를 실행하도록 변경해 새 checkout에서 필요한 생성 타입을 먼저 준비합니다. 최종 재확인 로그는 `deployment-typecheck-verified-final.log`, `deployment-lint-verified.log`입니다.

## 10. 알려진 제한

- 실제 Preview/Turso 네트워크, Galaxy Chrome, 실제 clipboard 권한/ChatGPT 로그인/Anki Desktop import는 미검증입니다.
- 충돌 검사는 전체 학습 상태 revision 기준입니다. 서로 다른 기록을 편집해도 보수적으로 충돌할 수 있습니다. 자동 병합·자동 재시도는 하지 않습니다.
- 편집 화면의 자동 최신 상태 적용을 억제하여 입력을 보호합니다. 새로고침 후 보관된 초안과 최신 기록을 비교해 저장해야 합니다. 초안은 기기 간 동기화하지 않습니다.
- 매 상태 요청은 현재 개인용 규모의 전체 학습 상태를 조회합니다. 대규모 데이터의 비용/지연 측정은 하지 않았으며 개인 1인 범위에서 먼저 시험합니다.
- 인증 만료 후 재로그인, 고정 APP_URL과 실제 접속 alias 일치, 로그인 WAF 제한이 필요합니다.
- 원본 DB를 사용하는 기존 dev 서버는 보호를 위해 종료했습니다. 별도 TEST DB 실행법은 README에 있습니다. 원본으로 되돌리는 자동 작업은 없습니다.

## 11. 사용자가 만들 계정

GitHub 개인 계정/private repo, Vercel Hobby, Turso Free. 앱 사용자 계정은 만들지 않습니다. 유료 플랜/도메인은 필요하지 않습니다.

## 12. 사용자가 Vercel에서 할 일

CLI 로그인·프로젝트 연결 → Preview 전용 환경변수 → 고정 HTTPS alias/APP_URL → Preview deploy → 로그인 WAF 제한 → 두 기기 확인. Git 자동 production 배포/`--prod`/Promote는 하지 않습니다. 단계별 명령과 공식 문서는 PREVIEW_SETUP을 참고합니다.

## 13. 사용자가 Turso에서 할 일

Free 계정에서 명확히 구분되는 빈 TEST DB 생성 → TEST DB 토큰을 안전하게 설정 → schema 시험 명령 → Preview 연결. 기존 SQLite 업로드나 운영 DB 생성은 하지 않습니다.

## 14. 운영 migration 전 확인

1. TEST Preview에서 Laptop/Galaxy 학습·동기화·충돌·TSV·외부 창·Resume 체크리스트 통과.
2. 새로 운영 DB 생성/기존 데이터 이전/production 전환을 명시적으로 승인.
3. 원본 SQLite 일관성 백업 및 복제본 integrity/foreign-key 검사, 테이블별 행 수·ID·payload 기준 확보.
4. 별도 운영 대상의 schema 검증 후 복사, 행 수·내용·관계 비교, 대표 학습 재개 확인.
5. 전환 전 rollback 계획과 전환 후 새 기록 보존 계획 확인. 원본 삭제/덮어쓰기는 별도 승인 없이 하지 않음.

현재 단계에서 멈춥니다. **운영 DB 생성·실제 데이터 migration·production 전환 승인은 별도로 필요하며, Preview 검증 완료 후 진행하는 것을 권장합니다.**

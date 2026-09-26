# Reading Room — V1

개인 영어 Reading·Listening 학습 앱입니다. Wikipedia 공식 API와 ChatGPT Companion을 사용하며 OpenAI API 키는 필요하지 않습니다. BNE 자료는 원 사이트에서만 봅니다.

## Getting Started (Windows PowerShell)

Node.js 22.13 이상과 npm이 필요합니다.

```powershell
npm ci
# 기존 환경 파일은 덮어쓰지 않습니다.
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
# 기존 실제 DB는 보호됩니다. 별도 TEST DB만 사용합니다.
$env:DB_MODE='local'
$env:DATABASE_PATH='./data/deployment-local.db'
$env:DATABASE_PURPOSE='test'
# 로컬 HTTP 시험 전용. Preview에서는 인증을 끌 수 없습니다.
$env:AUTH_ENABLED='false'
$env:APP_URL='http://127.0.0.1:3000'
npm run db:migrate:test
npm run dev
```

[앱 열기](http://127.0.0.1:3000). 포트를 바꾸면 APP_URL도 같은 origin으로 바꾸세요. 배포 준비 버전에는 단일 비밀번호 인증이 있습니다. Preview/production에서는 인증을 끌 수 없습니다. 인증 설정과 TEST Turso 준비는 [PREVIEW_SETUP.md](PREVIEW_SETUP.md), 검증 결과는 [DEPLOYMENT_PREPARATION_REPORT.md](DEPLOYMENT_PREPARATION_REPORT.md)를 보세요. 아직 운영 배포·실제 데이터 이전을 하지 않았습니다.

## Using the App

- **Reading**: Home에서 영어 Wikipedia 제목/URL 입력 → 단어·문장 선택 → 질문 유형/프롬프트 수정 → 복사·ChatGPT 열기 → What I learned와 이해도 저장 → Save to Anki → 학습 마치기. 선택과 출처는 자동 연결됩니다.
- **Listening**: Home의 Start Listening → BNE lesson HTML URL·직접 정한 제목·레벨 → 원 사이트 열기 → First Listening → Script Check → Listen Again → Final Recall. 이전 단계 버튼으로 저장된 기록을 확인할 수 있습니다. 완료 전에는 수정 가능하고, 완료 후에는 조회와 메모 추가를 지원합니다.
- **ChatGPT Companion**: 프롬프트를 복사하고 별도 창에서 직접 Ctrl+V 후 질문합니다. Final Recall의 현재 요약은 저장 전에도 ‘영어 요약 첨삭’에 전달됩니다. ChatGPT 답변은 자동 수집하지 않습니다.
- **Review**: 최근 학습에서 다시 볼 항목과 이유를 확인합니다. Review 완료 후 이해도 재평가, Not now(한국 시간 오늘만), 영구 제외를 지원합니다. Anki의 복습 간격을 대신하지 않습니다.
- **Anki**: Save to Anki/Quick Add → Card Editor → Mark Ready → 여러 카드 선택 → Export TSV. 한 파일은 한 덱만 선택합니다. Anki에서 Basic 노트 유형, Front/Back/Tags 필드 매핑, HTML 허용, 대상 덱을 직접 확인하세요. Exported는 파일 생성 기록이며 실제 가져오기 성공을 뜻하지 않습니다.
- **Resume**: Home의 Continue Learning에서 진행 중인 Reading과 Listening을 이어갑니다. History의 ALL/READING/LISTENING 필터로 과거 학습을 찾습니다.

## 입력과 저장

Listening 라운드·요약, What I learned, 이해도, 핵심 설명, 학습 메모, Reading 프롬프트, Quick Add, Anki 편집 초안을 **현재 브라우저 탭의 sessionStorage에 500ms 지연 저장**합니다. 페이지 이동·새로고침 직전에도 보관합니다. 표시되는 ‘초안 보관됨’은 DB 저장과 다릅니다. 각 영역의 저장/완료 버튼을 눌러 확정하세요. 저장 실패 시 입력과 초안은 유지됩니다.

탭을 닫거나 브라우저 저장소를 지우면 미확정 초안은 사라질 수 있습니다. 저장소 사용이 차단되면 안내와 새로고침 경고를 표시합니다. 다른 기기/탭과 초안을 동기화하지 않습니다. Anki 초안은 카드 버전별로 분리하여 오래된 초안이 다른 탭에서 갱신한 카드를 자동 덮어쓰지 않습니다. **Listening 임시 질문 텍스트는 초안 보관 대상이 아니며** 이동·라운드 변경·새로고침 때 사라집니다.

## Data / Backup

기존 실제 DB는 `data/reading-room-demo.db`이며 이번 준비 버전에서는 이 경로를 열지 못하도록 보호합니다. 별도 시험 DB의 기본값은 `data/deployment-local.db`입니다. 기존 `.env.local`은 자동 변경하지 않았으므로 위 PowerShell 환경변수로 경로를 명시하세요. cloud 모드는 `DB_MODE=libsql`로 선택하며 Vercel 파일시스템에 DB를 저장하지 않습니다. 아래 백업 명령은 local SQLite용입니다. 운영 데이터 백업·이전은 별도 승인 후 진행합니다.

```powershell
npm run db:backup
```

SQLite backup API를 사용하므로 WAL에 남은 변경도 일관된 스냅샷으로 `DB 폴더/backups/reading-room-시각.db`에 저장합니다. 복원은 서버를 종료하고 현재 DB와 `-wal`, `-shm`을 별도 보관한 뒤 백업 DB를 원 경로에 복사하고 재시작하세요. 실행 중인 DB 파일 하나만 복사해 덮어쓰지 마세요. OneDrive 동기화 폴더에서는 DB 동시 동기화/다른 PC 동시 실행을 피하고 가능하면 로컬 비동기화 폴더에 보관하세요.

새 DB에는 시연 학습 세션·질문·카드를 자동 생성하지 않습니다. 개발용 시연은 **별도의 DATABASE_PATH**와 `DEV_SEED=true`를 지정한 새 DB에서만 사용하세요. production 모드에서는 시연 학습 seed를 실행하지 않습니다. 화면용 창작 Mock 자료는 출처를 명시합니다. E2E는 사용자 DB와 분리된 `data/*e2e*.db`를 사용합니다.

## Troubleshooting

- **Popup blocked**: 표시되는 새 탭 링크를 직접 누르세요. 팝업 허용 여부와 창 크기는 브라우저가 결정합니다.
- **Clipboard permission**: 브라우저 권한을 확인하거나 표시된 프롬프트를 직접 선택해 복사하세요. 실패를 성공으로 표시하지 않습니다.
- **Wikipedia loading error**: Simple English Wikipedia의 영어 제목 또는 HTTPS `/wiki/` URL을 확인하고 같은 입력으로 다시 시도하세요. 연결·응답 지연·요청 제한은 별도 안내합니다. 실패 시 Mock 원문으로 대체하지 않습니다.
- **TSV import**: UTF-8/탭 구분/HTML 허용/Front·Back·Tags 매핑/대상 덱을 확인하세요. 동일 앞면의 처리와 재내보내기는 Anki 가져오기 설정에 영향을 받습니다.
- **저장 오류**: 현재 초안을 유지한 채 재시도하세요. DB 경로·권한·디스크 공간을 확인하고 백업을 먼저 만드세요. 내부 SQL/경로/stack trace는 사용자 오류 메시지에 포함하지 않습니다.
- **개발 캐시/404**: 개발(`.next-local`), E2E(`.next-e2e`), build(`.next`)를 분리했습니다. 서로 다른 E2E 서버를 동시에 실행하지 마세요. 캐시 정리가 필요하면 해당 서버를 종료하고 캐시 폴더를 백업 이름으로 변경하세요. `data`를 지우지 마세요.

## V1 검증

```powershell
npm test
npm run test:e2e:v1
npm run test:e2e:legacy
npm run test:wiki:live
npm run test:e2e:wiki
npm run lint
npm run typecheck
npm run build
```

Chrome이 설치되어 있어야 브라우저 테스트를 실행할 수 있습니다. ChatGPT와 BNE 목적지는 테스트 mock이며 실제 로그인/Anki Desktop 가져오기는 수동 검증 항목입니다. 비활성 OpenAI provider는 보존되며 유료 live 테스트는 기본적으로 skip됩니다. 결과·Known Issues·수동 체크리스트는 [V1_STABILIZATION_REPORT.md](V1_STABILIZATION_REPORT.md)를 보세요.

## 이전 단계의 구현 상세

아래는 STEP 7~10의 구현 이력입니다. 당시의 시작/마이그레이션 명령보다 위 Getting Started와 PREVIEW_SETUP의 준비 단계 제한이 우선합니다. 현재 cloud DB는 앱 시작 시 migration하지 않습니다.


## STEP 9 — Review Hub

Home의 **Start Review** 또는 `/review`에서 최근 30일 학습 중 다시 볼 항목을 최대 6개씩 확인합니다. 낮은 이해도, 반복 질문·듣기 어려움, 낮은 듣기 이해도, 미완료 기록, Anki Candidate, 직접 표시한 Need review를 설명 가능한 규칙으로 계산합니다. Anki의 spaced repetition을 대신하지 않습니다.

Review에서 기존 기록을 확인하고 이해도를 1–5로 재평가할 수 있습니다. **Not now**는 한국 시간 오늘만 숨기고, **Don't recommend this again**은 확인 후 영구 제외합니다. 원래 기록은 유지됩니다. Ask ChatGPT는 클립보드+팝업 방식을 재사용합니다. 기존 Anki 카드가 있으면 **Open Candidate**, 없으면 **Create Anki Card**를 제공합니다.

Listening/Reading Insights와 주간 요약도 기존 기록에서 계산합니다. DB migration `0003_neat_ronan.sql`은 가벼운 `review_events`만 추가하며 기존 테이블의 행은 유지합니다. 현재 AppState 버전은 **4**입니다. 개발 서버 시작 시 migration이 적용되며 `npm run db:migrate`로 먼저 적용할 수도 있습니다.

검증 명령: `npm test`, `npm run test:e2e:review`, `npm run test:e2e:legacy`, `npm run lint`, `npm run typecheck`, `npm run build`. E2E는 별도 테스트 DB를 사용합니다. Next 개발 서버와 build를 동시에 실행하지 마세요. 파일 목록·점수 규칙·DB 보존·테스트 결과는 [REVIEW_HUB_TEST_REPORT.md](REVIEW_HUB_TEST_REPORT.md)를 참고하세요.

개인 영어 Reading·Listening 학습 웹앱입니다. **Simple English Wikipedia 공식 API와 ChatGPT Companion을 사용합니다. OpenAI API 키가 필요하지 않습니다.** Breaking News English는 원 사이트에서 학습하고, 앱에는 직접 작성한 학습 기록만 남깁니다.

## STEP 8 · 공통 Anki Candidates

`/cards`에서 Reading·Listening·Manual 후보를 함께 관리합니다. Reading의 `Save to Anki`, Companion의 `Create Anki card`, Listening 각 단계와 결과의 `Save expression to Anki`는 같은 Quick Add를 엽니다. Expression만 입력해 저장하고 나머지는 나중에 완성할 수 있습니다. What I learned의 버튼은 현재 작성한 설명을 제안하며 모든 제안은 직접 수정할 수 있습니다. Listening 임시 질문 텍스트는 후보에 자동 전달하지 않습니다.

- Candidates → Card Editor → Mark Ready → Ready to Export에서 선택 → Export TSV 순서입니다. Exported에서 다시 선택하면 재내보내기 경고 후 진행할 수 있습니다. Archived는 보관함이며 원본 학습 기록을 삭제하지 않습니다.
- 표현은 80자·10단어 이내입니다. 긴 선택은 자동 저장하지 않고 짧은 표현을 다시 입력하도록 안내합니다. Example은 직접 작성한 짧은 예문을 넣으세요.
- 정규화(NFKC·소문자·앞뒤 공백 제거·연속 공백 축약)로 유사 표현을 찾아 Open existing / Save anyway를 제공합니다. 저장을 강제로 금지하지 않습니다.
- Vocabulary/Expression 템플릿은 표현이 앞면, 뜻·설명·예문이 뒷면입니다. Sentence 템플릿은 예문이 앞면, 뜻·핵심 표현·설명이 뒷면입니다. Front/Back 직접 편집과 최종 미리보기도 지원합니다. 원래 Wikipedia 저작자·라이선스 표시는 유지됩니다.
- 설정의 Deck presets는 한 줄에 하나씩 수정합니다. 이는 앱의 후보 기본값이며 실제 Anki 덱을 생성·수정하지 않습니다. 한 파일은 한 target deck만 선택할 수 있습니다. 가져올 때 Anki에서 해당 덱과 Basic 앞·뒤 노트 유형을 직접 선택하세요.
- UTF-8 TSV는 `#separator:Tab`, `#html:true`, `#columns:Front\tBack\tTags`, `#tags column:3` 헤더를 사용합니다. 실제 구분자는 탭이며 필드 안의 탭은 공백, 줄바꿈은 `<br>`로 처리하고 HTML 특수문자를 escape합니다. [Anki 공식 규격](https://docs.ankiweb.net/importing/text-files.html)에 맞춰 구성했습니다.
- 내보내기 시 파일명·카드 수·시각·덱·당시 카드 스냅샷을 기록합니다. EXPORTED는 파일을 생성했다는 뜻이며 실제 Anki 가져오기 성공을 의미하지 않습니다. 실패한 다운로드는 Exported에서 다시 내보낼 수 있습니다.

`0002_hesitant_fantastic_four.sql`은 `anki_candidates`, `anki_settings`, `candidate_exports`를 추가합니다. 앱 시작/`db:migrate` 시 기존 카드를 한 번씩 Candidate로 backfill합니다. 원본 카드·기존 export_batches는 그대로 남깁니다. 공통 편집기로 수정하기 전에는 이전 화면의 수정이 반영되며, 공통 편집기로 수정한 뒤에는 그 내용을 이전 카드로 덮어쓰지 않습니다. 이전 카드 화면은 `/cards?card=...` 및 페이지 하단 링크로 계속 사용할 수 있습니다. STEP 8 당시 AppState는 버전 3이며, 현재는 버전 4입니다.

검증 보고서: [ANKI_CANDIDATE_TEST_REPORT.md](ANKI_CANDIDATE_TEST_REPORT.md). 10장 샘플 파일: `artifacts/anki/sample-10-cards.tsv` (`npm test`로 재생성). 자동화는 Anki Desktop의 실제 가져오기까지 수행하지 않습니다.

## Listening 사용법

1. `/listening`에서 BNE lesson HTML URL, 직접 정한 제목, Level(0~6/기타)을 입력합니다. `https://breakingnewsenglish.com/YYMM/YYMMDD-lesson-name.html` 형식과 `www` 호스트를 허용하며 MP3·다른 호스트·쿼리 URL은 거절합니다. URL의 존재 여부는 서버에서 조회하지 않습니다.
2. `Open Breaking News English`로 원 페이지를 열고 듣습니다. 앱은 본문·문제·스크립트·음원을 요청하거나 복제하지 않으며 iframe이나 MP3 직접 링크도 사용하지 않습니다.
3. Round 1에서 첫 이해도·핵심 아이디어·요약·난이도를 저장하고, Round 2에서 놓친 이유를 복수 선택합니다. Round 3에서 다시 들은 이해도·새 내용·어려운 부분을 저장합니다.
4. Final Recall에 자신의 영어 요약, 최종 이해도, 복습 여부를 작성하면 결과 화면이 나옵니다. 각 단계의 완료 버튼을 눌러 저장하세요. 미확정 입력은 현재 탭의 초안으로 복원되며, DB 기록은 저장 버튼으로 확정합니다.
5. 짧은 표현은 별도 `학습 표현으로 저장` 버튼을 눌러 저장합니다(80자·10단어 이내). 학습 메모도 따로 저장할 수 있습니다.

Listening Companion은 7가지 질문 유형을 제공합니다. Final Recall 요약 첨삭에는 현재 작성 중인 자신의 요약을 사용하고, 다른 단계에서는 저장된 요약을 사용합니다. **임시 질문 텍스트는 컴포넌트 메모리에만 존재하며 서버 요청·DB·브라우저 저장소에 넣지 않습니다.** 화면에서 복사하는 프롬프트에는 포함되지만, History용 프롬프트는 서버에서 해당 부분을 제외하고 재생성합니다. 라운드 이동·새로고침 시 임시 입력은 사라집니다.

Reading과 Listening 모두 `What I learned`, 내 이해 정도, 선택적인 핵심 설명 직접 붙여넣기를 저장합니다. ChatGPT 답변을 자동으로 가져오지 않습니다. 창 열기 기록은 버튼 실행 여부이며 실제 질문 전송·답변 수신을 의미하지 않습니다. Listening에서 저장한 표현은 History에서 확인하며, 기존 Reading Anki 카드 생성·검토·TSV 내보내기는 그대로 사용합니다.

History에는 ALL / READING / LISTENING 필터, 질문 기록과 직접 적은 핵심 설명이 표시됩니다. Home의 This Week는 한국 시간 월요일부터 시작한 세션을 집계합니다. 이해도 평균은 각각 값이 저장된 세션만 대상으로 하므로 첫·최종 평균의 표본 수가 다를 수 있습니다. 학습 시간은 시작부터 완료까지의 경과 초이며 휴식도 포함합니다.

### 데이터베이스와 마이그레이션

`drizzle/0001_steady_captain_cross.sql`이 `learning_sessions`, `listening_details`, `companion_interactions`, `learned_expressions`를 추가합니다. 공통 메타데이터와 Listening 상세는 분리하며 기존 Reading 상세 테이블·본문 스냅샷·Anki 연결은 유지합니다. 이 단계의 AppState는 2였으며 STEP 8에서 3으로 확장했습니다.

`npm run db:migrate` 또는 앱 시작 시 마이그레이션과 멱등 backfill이 실행됩니다. 기존 Reading ID와 시작/완료 시각을 유지하며 실제 Wikipedia는 WIKIPEDIA, 창작 시연 자료는 MANUAL로 표시합니다. 과거의 정확한 학습 시간은 알 수 없어 null로 남깁니다. 기존 Companion 초안은 이전 기록으로 한 번만 이관하고 ChatGPT 열림 여부를 추정하지 않습니다. 기존 AI 해설은 삭제하지 않지만 새로 생성하지 않습니다.

이번 작업 전 SQLite backup API로 만든 백업은 `data/backups/before-learning-1790268365033.db`입니다. 사용자 DB와 테스트 DB는 분리됩니다. 통합 E2E는 3103 포트와 `data/learning-e2e.db`를 사용합니다. 최신 구현·검증 내역은 [LEARNING_TEST_REPORT.md](LEARNING_TEST_REPORT.md)에 있습니다.

## 실행

Windows / Node.js 22.13 이상. 검증 환경: Node 24.14.0, npm 11.9.0.

```powershell
npm ci
# 최초 설정 시에만 복사합니다. 기존 .env.local은 덮어쓰지 마세요.
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

[로컬 앱 열기](http://127.0.0.1:3000). 기본 서버는 127.0.0.1에만 바인딩됩니다. API 키 없이 Wikipedia 읽기를 사용할 수 있습니다. DB는 첫 실행 시 자동 생성됩니다.

```powershell
npm run dev -- --port 3001
npm run build
npm start
```

## Wikipedia 읽기

1. 홈에 영어 제목(`Himalayas`, `Physics`, `Albert Einstein`) 또는 `https://simple.wikipedia.org/wiki/...` URL을 입력합니다. 모바일 Wikipedia URL도 지원합니다.
2. 공식 MediaWiki `action=query`로 제목·리다이렉트·판 번호·사이트 이용 조건을 확인한 뒤 `action=parse&oldid=...`로 해당 판의 본문을 가져옵니다. 요약 API나 임의 사이트 크롤링을 사용하지 않습니다.
3. 본문 단어·문장을 드래그하고 `선택한 부분 질문하기`를 누릅니다. 키보드 선택과 `이 문단에서 질문` 대체 경로도 제공합니다.
4. 오른쪽 Tutor에서 선택한 인용과 `전달된 원문 문맥 확인`을 볼 수 있습니다. 정확한 UTF-16 위치, 원래 문단, 인접 문단, 출처·판 번호가 서버에서 구성·저장됩니다. 브라우저가 임의로 제출한 인용 문자열을 신뢰하지 않습니다.
5. 원문 하단에서 저작자 표시, 편집 이력, 저장한 판, 라이선스, 가져온 시각과 읽기용 변경 내역을 확인합니다.

영어 본문은 일반 텍스트로 렌더링하며 요약·번역·재작성을 하지 않습니다. 제목·소제목·문단·일반 목록을 유지합니다. 표·이미지·탐색 상자·각주 목록은 생략하고 이를 안내합니다. 수식을 지운 뒤 문장이 그대로인 것처럼 표시하지 않도록 수식 포함 문단 전체를 생략합니다. 전체 원문은 링크로 확인할 수 있습니다.

외부 HTML은 Cheerio로 구조를 읽고 텍스트만 추출합니다. 외부 HTML, 이벤트 속성, script를 React에 삽입하지 않습니다. 문서별 credit/license 안내 상자에서 추가 고지와 안전한 링크를 보존합니다. 일반 라이선스는 API의 rightsinfo가 반환하는 CC BY-SA 4.0임을 확인한 경우에만 사용합니다.

## 예외 처리

| 상황 | 동작 |
| --- | --- |
| 잘못된 URL / 다른 호스트 / HTTP / 포트·인증정보 / 지원하지 않는 경로 | 외부 요청 전에 거부 |
| 존재하지 않는 문서 | 철자·URL 확인 안내, 입력 유지 |
| 동음이의어 | 구체적인 문서 제목을 선택하도록 안내, 임의 문서로 대체하지 않음 |
| 네트워크·HTTP·JSON/API 오류 | 원인별 오류, 수동 재시도 가능 |
| 응답 지연 | 서버 전체 조회 15초 제한, 브라우저 20초 제한 |
| 요청 제한(429) | Retry-After가 있으면 대기 시간 전달, 자동 재시도 없음 |
| 복잡한 표·이미지·수식 | 읽기 본문에서 생략하고 내역 안내 |
| 읽을 본문 없음 / 5MiB 응답 / 100,000자 본문 상한 | 성공이나 잘린 본문으로 저장하지 않고 안내 |
| 라이선스 확인 실패 | 가져오기 보류 |

실제 조회 오류를 Mock 본문으로 대체하지 않습니다. 조회는 사용자가 누를 때만 수행합니다. 기존 기록은 저장 당시 본문 스냅샷을 읽습니다. 새 판을 가져와도 이전 스냅샷을 덮어쓰지 않습니다.

## ChatGPT Companion

1. Reading 본문에서 단어나 문장을 선택합니다. 오른쪽 패널에서 선택 원문, 글 제목, 주변 문맥을 확인합니다.
2. 문장 해석 / 문법·문장 구조 / 단어·표현 / 예문 / 이해도 확인 문제 / 자유 질문 중 하나를 선택합니다.
3. 자동 생성된 프롬프트를 확인하고 필요하면 `프롬프트 수정`으로 편집합니다. 편집 내용은 SQLite에 저장됩니다. 직접 수정한 내용은 유형 변경으로 덮어쓰지 않으며 `자동 프롬프트로 되돌리기`로 복원할 수 있습니다.
4. `ChatGPT에서 질문하기`를 누르면 클립보드에 복사한 다음 `https://chatgpt.com`을 약 500×800px 팝업으로 엽니다.
5. ChatGPT에서 직접 붙여넣기(Ctrl+V) 후 전송합니다. 로그인·후속 대화·답변은 ChatGPT 창에서 진행합니다.

- `프롬프트 복사`, `ChatGPT 열기`를 각각 사용할 수도 있습니다. 팝업 차단 시 `ChatGPT를 새 탭으로 열기` 링크를 직접 누릅니다. 브라우저에 따라 팝업 대신 탭이 열릴 수 있습니다.
- 클립보드 권한이 없거나 API를 사용할 수 없으면 오류를 표시하고 프롬프트를 직접 선택·복사할 수 있습니다. localhost/127.0.0.1 또는 HTTPS에서 사용하세요. 브라우저 보안 정책을 우회하지 않습니다.
- 앱은 ChatGPT DOM 접근, 자동 입력·전송, 답변 수집을 하지 않습니다. URL에 프롬프트를 넣지 않습니다. 팝업의 opener 연결은 즉시 해제합니다.
- `선택 내용 초기화`는 현재 선택만 해제합니다. History에서 질문 유형과 수정한 프롬프트를 다시 열 수 있습니다. 실제 ChatGPT 전송·응답 여부는 앱이 확인하지 않으므로 `프롬프트 준비`로 표시합니다.
- 기존 설명·학습 이력·Anki 카드는 유지됩니다. 새 선택에서는 배운 내용을 직접 정리해 카드 초안을 만들고 기존 검토·확정·TSV 내보내기를 사용할 수 있습니다.
- 선택 최대 1,200자, 주변 문맥 최대 6,000자, 자유 질문 1,000자, 수정 프롬프트 16,000자 제한입니다. 주변 문맥 생략 여부도 안내합니다.

### Provider 구조와 보존된 API 코드

`src/domain/tutor-provider.ts`의 `TutorProvider` 계약과 `ChatGPTCompanionProvider`가 클라이언트에서 프롬프트를 준비합니다. 브라우저 clipboard/window 기능은 `companion-browser.ts`, 화면은 `companion-panel.tsx`, 현재 서버 동작 제한은 `src/server/tutor-runtime.ts`로 분리했습니다.

기존 `src/server/adapters/openai.ts`, `SqliteRepository.executeTutor`, 통합 Tutor 화면은 삭제하지 않았습니다. OpenAI 어댑터는 현재 Route Handler에서 import하거나 호출하지 않습니다. 이전 `TUTOR_MODE=openai` 또는 API 키가 남아 있어도 Companion으로 동작하며 직접 AI 생성 요청은 거절합니다. 향후 서버 전용 OpenAIProvider를 추가할 때 보존한 비동기 어댑터·검증 코드·테스트를 재사용할 수 있습니다. `TUTOR_MODE=mock`은 기존 시연 회귀 테스트 전용입니다.
## 기술 구성과 저장

Next.js App Router / TypeScript / Tailwind CSS / SQLite / better-sqlite3 / Drizzle ORM / Zod / Cheerio / Lucide. 정확한 패키지 버전은 package-lock.json에 고정합니다.

```text
src/app/                       페이지 및 같은 origin의 API
src/features/                  home / reading / tutor / history / cards
src/domain/selection.ts         인용·문맥 생성, 위치와 길이 검증
src/server/wikipedia/           URL 검증, API provider, HTML 추출, 오류
src/server/adapters/mock.ts     이전 시연 provider와 Mock Tutor
src/data/                      SQLite Repository와 Drizzle schema
src/fixtures/                  이전 화면 검증용 창작 자료
```

기존 디자인 토큰·글꼴·패널 너비·반응형을 유지합니다. PRD의 IndexedDB/Vite 대신 사용자의 초기 지시에 따라 Next.js와 SQLite를 사용합니다. 실제 Wikipedia와 창작 Mock 자료를 화면에서 구분합니다.

local 모드는 서버의 별도 SQLite 파일에, libsql 모드는 설정한 TEST Turso DB에 저장합니다. 단일 사용자 비밀번호 인증을 사용합니다. 기존 JSON payload schema는 유지하며 cloud schema는 배포 전 별도 명령으로 준비합니다.

## 환경 변수

| 변수 | 의미 |
| --- | --- |
| `APP_MODE` | 폐기된 설정. 무시하며 DB_MODE/WIKIPEDIA_MODE/TUTOR_MODE를 각각 사용 |
| `WIKIPEDIA_MODE=live` | 기본값. 공식 API 사용. `mock`은 오프라인 회귀 테스트 전용 |
| `DATABASE_PATH` | local 시험 기본 `./data/deployment-local.db`; 기존 실제 DB 경로는 보호 |
| `DB_MODE` | local / libsql. 전체 인증·cloud 변수는 PREVIEW_SETUP 참조 |
| `TUTOR_MODE=companion` | 기본값. 이전 `openai` 값도 Companion으로 처리. `mock`은 이전 회귀 테스트 전용 |
| `OPENAI_API_KEY` | 이번 버전에서 사용하지 않음. 비워 두세요 |
| `OPENAI_MODEL` | 보존한 향후 통합 어댑터용. 현재 사용하지 않음 |

.env.local에 WIKIPEDIA_MODE가 없어도 기본값은 live입니다. DB, 환경 비밀값, 빌드·테스트 출력은 Git에서 제외합니다. OneDrive 경로에서 실행하는 경우 DB 파일의 OneDrive 동기화 여부는 Git과 별도입니다.

## 자동화 테스트

### History에서 학습 기록 삭제

각 Reading/Listening 기록의 **Delete**를 누르고 제목과 안내를 확인한 뒤 **삭제 확인**을 누릅니다. 취소하면 기록은 그대로 유지됩니다. 삭제는 되돌릴 수 없습니다.

- 세션, Reading 질문/선택/답안, Listening 라운드, Companion 기록·배운 내용, 세션에 저장한 표현과 메모를 함께 삭제합니다.
- Anki 후보·Ready·Exported·Archived 카드는 **보존**하고 삭제한 세션과의 연결만 해제합니다. 출처 제목·URL·저작자 표시는 유지합니다.
- 이전 카드의 필수 질문 연결은 제거하되, 카드 내용은 공통 Anki 카드로 보존합니다. 이전 카드와 공통 카드가 서로 다르게 편집되었다면 두 버전을 보존합니다.
- 해당 세션만 가리키는 Review 기록은 정리합니다. 다른 세션/카드와 공유하는 표현·듣기 어려움의 복습 이력은 유지하며 추천은 남은 데이터로 다시 계산합니다. 보존된 미완성 Anki 후보는 계속 Review에 나올 수 있습니다.
- 원문 스냅샷, 내보내기 당시의 카드/TSV 이력, 덱 설정과 다른 세션은 보존합니다.
- 기존 `/api/state` 인증·revision 검사를 거쳐 한 트랜잭션에서 처리합니다. 실패하면 전부 롤백합니다. DB schema 변경이나 migration은 없습니다.

다른 기기는 다음 상태 갱신 때 반영됩니다. 입력 중이라 갱신이 보류되거나 충돌 안내가 나오면 입력을 보관하고 새로고침하세요. 삭제한 세션을 다시 저장해 되살리지는 않습니다.

`npm test`는 독립 임시 SQLite/libSQL DB에서 삭제·보존·외래키·롤백을 검증합니다. `npm run test:e2e:deployment`는 별도 로컬 DB에서 로그인 보호, 취소/확인, 다른 탭 갱신, Home/Review/Anki와 revision 충돌을 확인합니다. 기존 사용자 DB에는 테스트 삭제를 실행하지 않습니다.

### 실행 명령

```powershell
npm test                 # 네트워크 없는 도메인·DB·Wikipedia 계약/오류 테스트
npm run test:e2e:learning # 통합 Reading/Listening/History/Anki, 외부 사이트 Mock
npm run test:e2e:anki     # STEP 8 Candidate 통합 흐름 + Reading/Listening 회귀
npm run test:e2e:legacy  # 이전 Mock 학습·카드·반응형 회귀
npm run test:e2e:companion # 현재 Tutor·클립보드·팝업·History·Anki
npm run test:wiki:live    # 실제 API, 3개 문서의 제목/URL 및 문맥 검증
npm run test:e2e          # Companion 브라우저 테스트 별칭
npm run test:e2e:wiki     # 실제 API + Chrome, 3개 문서 선택·문맥·복원
npm run typecheck
npm run lint
npm run build
npm audit
```

E2E는 설치된 Chrome을 사용합니다. Mock 테스트는 3100/data/e2e.db, Wikipedia 테스트는 3101/data/wiki-e2e.db, Tutor 테스트는 3102/data/companion-e2e.db를 사용합니다. Next 빌드 디렉터리를 공유하므로 개발 서버와 E2E/빌드를 동시에 실행하지 마세요. 테스트마다 WebServer가 자동 시작·종료됩니다. 실제 API 테스트는 네트워크 상태와 Wikipedia의 요청 제한에 영향을 받으므로 짧은 간격으로 반복하지 마세요.

검증 결과는 [WIKIPEDIA_TEST_REPORT.md](WIKIPEDIA_TEST_REPORT.md)에 있습니다. 실제 문서별 메타데이터·문맥 증거와 화면 캡처는 `artifacts/wikipedia/`에 저장하며 Git에서 제외합니다. [TEST_REPORT.md](TEST_REPORT.md)는 이전 Mock 단계의 이력입니다.

## 공식 자료

- [MediaWiki parse](https://www.mediawiki.org/wiki/API:Parsing_wikitext)
- [MediaWiki revisions](https://www.mediawiki.org/wiki/API:Revisions)
- [Wikimedia 이용 조건 — 콘텐츠 라이선스](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)

현재 검증은 [COMPANION_TEST_REPORT.md](COMPANION_TEST_REPORT.md)를 확인하세요. [TUTOR_TEST_REPORT.md](TUTOR_TEST_REPORT.md)는 이전 통합 API 단계의 이력입니다. 이번 버전은 OpenAI API를 호출하지 않습니다. 이전 유료 테스트는 별도 보관하며 `ENABLE_ARCHIVED_OPENAI_TESTS=true`를 명시하지 않으면 건너뜁니다.

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

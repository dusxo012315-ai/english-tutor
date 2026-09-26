# STEP 9 — Review Hub

## 구현

`/review`와 Home의 Today's Review, 주 메뉴 Review를 추가했습니다. 최근 학습에서 다시 볼 근거가 있는 항목을 한 번에 최대 6개 보여줍니다. Anki의 장기 암기 일정이나 spaced repetition은 구현하지 않습니다.

- Review: 기존 질문 프롬프트, What I learned, 이해도, 관련 세션·날짜·Listening 요약을 조회합니다. 완료 시 선택적인 1–5 이해도와 메모를 기록하고 Before/After를 표시합니다.
- Ask ChatGPT: 기존 `copyPrompt` / `openChatGPT`를 재사용합니다. 복사 후 500×800 팝업을 시도하고 차단 시 사용자 클릭 새 탭 링크를 제공합니다. 사용자가 직접 붙여넣습니다. OpenAI 호출·ChatGPT DOM 접근·scraping은 없습니다.
- Anki: 정규화된 동일 표현의 기존 카드를 상태와 관계없이 찾아 Open Candidate로 연결합니다. 카드가 없으면 기존 Quick Add를 사용하고 What I learned를 수정 가능한 설명으로 제안합니다. 짧은 표현 제한과 중복 경고는 그대로 적용됩니다.
- Not now: 한국 시간 당일 숨김. 다음 날 다시 계산합니다. Don't recommend this again: 확인 dialog 후 영구 제외. 원래 학습·카드는 삭제하지 않습니다.
- Reading/Listening에 공통 세션 Need review 체크를 추가했습니다. Listening Final Recall의 기존 Need review와 예전 Reading 표시도 추천 근거로 유지합니다.

## 추천 규칙

UI와 분리된 `src/domain/review/review-service.ts`에서 기존 AppState를 읽어 계산합니다. DB에 ReviewItem을 대량 생성하지 않습니다. 최근 30일 질문·시작한 세션·생성한 Candidate가 대상입니다. 문자열 NFKC, 소문자, trim, 연속 공백 축약만 사용하며 의미 추론·AI 분류는 하지 않습니다.

| 근거 | 조건 | 가중치 |
|---|---|---:|
| Low understanding | 현재 이해도 ≤2/5 | +3 |
| User marked | Need review 표시 | +3 |
| Repeated question | 동일 정규화 표현 질문 ≥2회 | +2 |
| Listening difficulty | 동일 어려움이 서로 다른 세션 ≥2회 | +2 |
| Low first comprehension | 첫 이해도 <40% | +2 |
| Low final comprehension | 최종 이해도 <65% | +2 |
| Incomplete | 미완료 세션 또는 What I learned 미작성 | +1 |
| Unfinished Anki | CANDIDATE 상태 | +1 |
| Recent | 다른 근거가 있고 최근 7일 학습 | +1 |

상수는 `review-scoring.ts`에 있습니다. 근거별 한 번 가산하며 점수, 최신 학습일, 참조 키 순으로 정렬합니다. 점수는 사용자에게 표시하지 않습니다. 기존 3단계 이해도는 NOT_YET=1, PARTLY=2, UNDERSTOOD=5로 환산하고 화면에 환산임을 표시합니다. 새로운 학습보다 최근인 Review 재평가가 있으면 그 값을 사용합니다. 완료한 항목도 당일 숨기며, 다음 날 나머지 근거가 있다면 다시 추천될 수 있습니다. 이는 복습 간격 알고리즘이 아닙니다.

## Insights

- Listening: 최근 10개 세션, 어려움별 세션 수. 첫·최종 값이 모두 있는 동일 세션끼리 평균과 차이(percentage points)를 계산합니다. 미기록을 0%로 처리하지 않습니다.
- Reading: 최근 30일 질문 유형, 낮은 이해도를 기록했던 표현, What I learned 미작성 수. 문법명은 자동 추론하지 않습니다.
- This Week: 한국 시간 월요일 기준 Reading/Listening 수, 가장 반복한 문법 질문의 선택 표현, 가장 흔한 듣기 어려움, 완료한 고유 Review 항목 수. 향상은 항목별 주간 첫 Review 전 값과 마지막 재평가를 비교합니다.

## DB 및 보존

`drizzle/0003_neat_ronan.sql`: `review_events(id TEXT PRIMARY KEY, payload TEXT NOT NULL)`만 추가합니다. AppState 버전은 4입니다. ReviewEvent JSON:

`id`, `createdAt`, `itemType`(EXPRESSION/LISTENING_DIFFICULTY/SESSION), `sourceReference`, `action`(REVIEWED/CHATGPT/ANKI/DISMISSED), `userUnderstandingBefore`, `userUnderstandingAfter`, `note`, `dismissal`(TODAY/FOREVER/null), `candidateId`.

표현 또는 세션 참조와 작은 이벤트 메타데이터만 저장하며 원래 프롬프트·본문·학습 기록은 복제하지 않습니다. 숨김 상태도 DISMISSED 이벤트에 저장합니다. 요청 UUID 재전송은 중복 삽입하지 않습니다. 대상 존재 여부와 이해도 1–5를 서버에서 검증합니다. LearningSession의 선택 필드 `needReview`는 기존 JSON에 호환되며 이전 행을 일괄 변경하지 않습니다.

실제 DB 백업: `data/backups/before-review-1790336758866.db`. `npm run db:migrate` 성공. 마이그레이션 직후 기존 13개 테이블의 모든 행을 백업과 깊은 비교해 동일함을 확인했습니다: cards 3, export_batches 0, learning_items 6, preferences 1, sessions 4, snapshots 5, companion_interactions 1, learned_expressions 0, learning_sessions 5, listening_details 1, anki_candidates 3, anki_settings 1, candidate_exports 1. 새 review_events는 0개입니다.

## 신규 파일

- `src/app/review/page.tsx`
- `src/features/review/review-hub.tsx`
- `src/domain/review/review-types.ts`, `review-scoring.ts`, `review-service.ts`
- `src/data/review-repository.ts`
- `drizzle/0003_neat_ronan.sql`, `drizzle/meta/0003_snapshot.json`
- `tests/review.test.ts`, `tests/e2e/review.spec.ts`, `playwright.review.config.ts`
- 이 보고서

## 변경 파일

- `src/domain/learning.ts`, `types.ts`, `schemas.ts`: 세션 표시·이벤트 타입·검증
- `src/data/schema.ts`, `repository.ts`, `drizzle/meta/_journal.json`: 이벤트 저장 및 migration
- `src/components/shell.tsx`: Review 메뉴
- `src/features/home/home-page.tsx`: Home Review 요약
- `src/features/reading/reading-page.tsx`, `src/features/listening/listening-session.tsx`: Need review
- `src/features/anki/quick-add.tsx`: 생성 후 Review 연결 콜백
- `src/features/tutor/interaction-reflection.tsx`: 자동 저장 중 버튼 클릭 누락 방지
- `src/app/globals.css`: 반응형 Review 카드 배치
- `package.json`, `README.md`: 실행 명령·사용법

## 검증 결과

| 검사 | 결과 |
|---|---|
| `npm test` | 47/47 통과 (기존 39 + Review 8) |
| Review E2E | 4/4 통과, 요구 시나리오 A–E 포함 |
| 기존 Companion/Listening/Anki E2E | 12/12 통과 |
| `npm run test:e2e:legacy` | 3/3 통과 |
| `npm run lint` | 통과, 오류·경고 없음 |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과, `/review`를 포함한 10개 라우트 생성 |
| 실제 개발 서버 smoke | Home, Review, Cards, History, 기존 Reading/Listening 상세 모두 HTTP 200 |
| 데스크톱·모바일 화면 | 1440px / 390px 확인, 브라우저 오류·가로 넘침 없음 |

최종 개발 서버: `http://127.0.0.1:3000/review`. 실제 DB 상태는 schemaVersion 4, Companion 모드, LearningSession 5개, AnkiCandidate 3개로 확인했습니다. 화면 확인은 원래 학습 데이터를 변경하지 않았습니다. 화면 산출물: `artifacts/review/desktop.png`, `artifacts/review/mobile.png`.

테스트·빌드 후 개발 서버 재시작 때 Next 개발 캐시가 API/동적 상세 경로를 404로 처리하는 현상이 있었습니다. 서버를 종료하고 workspace 내부 `.next/dev`를 백업 이름으로 변경한 뒤 새 캐시로 시작해 해결했습니다. DB와 소스 파일은 삭제하지 않았으며, 위 HTTP/API 및 화면 검증은 복구 후 다시 통과했습니다.

Review E2E는 실제 로컬 Chrome의 clipboard와 popup을 사용하며 ChatGPT 목적지는 mock으로 대체합니다. 정상 팝업, 차단 후 새 탭, ReviewEvent 저장을 검증합니다. Reading 낮은 이해도 → 원래 질문 조회 → 4/5 재평가 → 원래 이해도 보존, Listening 반복 어려움 → 프롬프트, Anki 신규 생성 및 기존 카드 편집기 연결, Not now 및 영구 제외를 검증했습니다. 다음 날 다시 노출되는 날짜 경계는 단위 테스트로 검증합니다.

첫 브라우저 실행에서는 3건 실패했습니다. 자동 draft 저장으로 버튼이 비활성화되는 순간 클릭이 누락되는 기존 Companion 경합을 수정했고, Need review 체크박스는 즉시 표시하고 저장 실패 시 원래 상태로 돌아가도록 했습니다. Windows clipboard CRLF는 테스트에서 LF와 동등하게 비교합니다. 이어서 테스트 준비 코드가 검증할 표현까지 숨긴 문제를 수정했습니다. 최종 기존 12개 회귀 및 새 4개 시나리오는 각각 재실행하여 모두 통과했습니다. 마지막 legacy 3개도 통과했습니다.

## 직접 확인할 사항

1. 실제 사용 중인 브라우저에서 팝업과 클립보드 권한을 허용하고 ChatGPT 로그인 후 직접 붙여넣기/전송하기. 외부 ChatGPT 페이지 자체는 자동화에서 mock 처리합니다.
2. Review 완료 → 이해도 재평가, 오늘 숨김과 영구 제외의 차이 확인하기. 날짜 경계는 한국 시간이며 자동화 단위 테스트는 가상 시각으로 검증합니다.
3. 기존 Anki 카드 열기 또는 Quick Add 후 실제 Anki Desktop에서 TSV 가져오기. Anki에서의 실제 가져오기·복습은 앱 자동화 범위 밖입니다.
4. BNE 원문은 원 사이트에서 열어 학습합니다. Review도 기사·스크립트·음원을 요청하거나 저장하지 않습니다.

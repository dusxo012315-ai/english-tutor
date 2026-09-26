# STEP 8 · Anki Candidate 구현·검증 보고

2026-09-25 · Windows · Next.js / SQLite / Drizzle · ChatGPT Companion 유지.

## 추가 파일

- `src/domain/anki.ts`: 모델·입력 검증·정규화·중복 탐지·템플릿·상태 전환·TSV.
- `src/data/anki-repository.ts`: Candidate·preset·export 저장, 이전 카드 backfill.
- `src/features/anki/quick-add.tsx`: 학습 중 후보 저장 및 중복 경고.
- `src/features/anki/candidate-form.tsx`: 세부 필드·Front/Back·미리보기.
- `src/features/anki/anki-page.tsx`: 상태별 목록·필터·검색·편집·내보내기·덱 설정.
- `src/features/anki/session-candidates.tsx`: 세션별 카드 링크와 질문·학습 결과·카드 수.
- `drizzle/0002_hesitant_fantastic_four.sql`, `drizzle/meta/0002_snapshot.json`.
- `tests/anki.test.ts`, `tests/e2e/anki.spec.ts`, `playwright.anki.config.ts`.
- `ANKI_CANDIDATE_TEST_REPORT.md`.

## 변경 파일

`src/domain/types.ts`, `schemas.ts`; `src/data/schema.ts`, `repository.ts`, `learning-repository.ts`; `src/components/provider.tsx`; `src/app/cards/page.tsx`, `globals.css`; `src/features/tutor/companion-panel.tsx`, `interaction-reflection.tsx`; `src/features/listening/listening-companion.tsx`, `listening-session.tsx`; `src/features/history/history-page.tsx`; `src/features/learning/dashboard-stats.tsx`; `drizzle/meta/_journal.json`; `scripts/migrate.ts`; `package.json`; `README.md`.

기존 `src/features/cards/cards-page.tsx`, 기존 카드 테이블·내보내기 코드·OpenAI 어댑터는 삭제하지 않았습니다. OpenAI API는 호출하지 않습니다. 저장소는 이전 단계부터 기존 파일들도 untracked 상태였으며 커밋은 만들지 않았습니다.

## DB migration / schema

3개 테이블을 추가합니다. `anki_candidates`는 공통 LearningSession에 nullable 외래 키를 가지며 Manual 카드는 세션 없이 생성할 수 있습니다. `anki_settings`는 덱 preset, `candidate_exports`는 내보내기 배치와 원본 스냅샷·TSV를 보존합니다.

AnkiCandidate 필드: id, createdAt, updatedAt, sourceSessionId, sourceType(READING/LISTENING/MANUAL), sourceTitle, sourceUrl, expression, meaning, explanation, exampleSentence, userNote, cardType, targetDeck, tags, status, exportedAt. 추가로 충돌 방지 version, 직접 편집 frontOverride/backOverride, 저작자 표시 attribution, legacy 연결 메타데이터를 둡니다.

cardType은 VOCABULARY / EXPRESSION / SENTENCE / GRAMMAR / IRREGULAR_VERB / CUSTOM입니다. 상태는 CANDIDATE / READY / EXPORTED / ARCHIVED입니다. incomplete 카드는 Ready/Export로 넘길 수 없으며 stale version 업데이트와 부분 배치 내보내기는 거절합니다. 요청 ID를 재사용하면 중복 저장·배치가 생기지 않습니다.

SQL migration 후 Repository가 기존 카드를 `legacy:<기존 ID>`로 backfill합니다. 앞면·뒷면·출처·exportedAt을 그대로 가져오고 원본 카드는 유지합니다. 정확한 카드 생성일이 없던 자료는 연결된 학습 항목/세션 시각을 사용합니다. 검토 보류는 Candidate, 초안은 Candidate, 확정은 Ready, 내보낸 카드는 Exported로 연결합니다. 공통 편집기로 사용자가 수정한 후보는 이전 데이터로 덮어쓰지 않습니다.

백업: `data/backups/before-anki-candidates-1790286140472.db` (SQLite backup API).

실제 DB에 `npm run db:migrate`를 적용했습니다. 백업과 비교해 기존 snapshots 5, sessions 4, learning_items 6, cards 3, preferences 1, export_batches 0, learning_sessions 5, listening_details 1, companion_interactions 1, learned_expressions 0개의 행과 payload가 모두 동일했습니다. 새 Candidate 3개에 기존 카드의 front/back/exportedAt이 그대로 연결되었습니다. integrity_check=ok, foreign_key_check 오류 0개입니다.

## 화면과 학습 연결

Reading 선택 → Companion → What I learned → Create Anki card / Save to Anki. 선택 표현과 직접 적은 설명을 제안하며 편집 가능합니다. 긴 선택은 저장하지 않고 짧게 입력하도록 안내합니다.

Listening Script Check·Listen Again·Final Recall·결과와 Companion에서 공통 Quick Add를 엽니다. 원문·스크립트·음원 요청은 추가하지 않았습니다. 임시 질문 텍스트는 자동 카드 입력·DB 저장하지 않습니다. 사용자가 Expression을 직접 입력합니다.

History에 세션별 Candidate와 Card Editor 링크를, Home에 이번 주 생성한 후보 수 및 그 후보들의 현재 Ready/Exported 수를 표시합니다. 실제 spaced repetition과 Anki 덱 관리는 구현하지 않습니다.

## 카드 템플릿 / export 형식

TYPE A: Front=expression; Back=meaning + explanation + Example(exampleSentence).

TYPE B: Front=exampleSentence; Back=meaning + Key expression(expression) + Explanation(explanation).

추가 카드 타입도 템플릿 레지스트리를 확장할 수 있습니다. 현재 Sentence 외 타입은 TYPE A를 기본으로 쓰며 Front/Back override가 가능합니다. 사용자 메모·출처/라이선스는 뒷면에 추가됩니다.

UTF-8, 실제 탭으로 구분한 3열 Front/Back/Tags. `#separator:Tab`, `#html:true`, `#columns:Front<TAB>Back<TAB>Tags`, `#tags column:3`을 사용합니다. 필드 안의 탭은 공백, CR/LF는 HTML `<br>`, HTML 특수문자는 entity로 변환합니다. 각 필드는 따옴표로 감쌉니다. 줄바꿈은 행 구분에만 사용합니다.

한 배치에 한 덱만 허용하고, 내보내기 확인 화면에 target deck을 보여줍니다. 덱 헤더는 넣지 않으며 Anki 가져오기에서 직접 선택합니다. 재내보내기에는 중복 가능성 경고가 표시됩니다. Anki의 첫 필드 중복 처리 설정에 따라 기존 노트를 갱신하거나 새 노트를 만들 수 있습니다. 근거: [Anki 공식 Text Files](https://docs.ankiweb.net/importing/text-files.html).

## 검증

새 단위/저장소 테스트는 유형별 생성, Quick Add, normalization, legacy 포함 중복 탐지, Save anyway, 두 템플릿, override·attribution, 길이·출처·태그 검증, 상태 전환, 동시 수정 충돌, 실패 시 트랜잭션 보존, 재내보내기 확인, request ID 멱등성, 덱 preset 재시작, 실제 v2 DB 업그레이드를 검사합니다.

`artifacts/anki/sample-10-cards.tsv`에는 최소 10장과 한글, 영어 apostrophe, 따옴표, 탭·CRLF·줄바꿈, `< > &`, accented 문자, emoji가 포함됩니다. UTF-8 strict decode와 모든 데이터 행의 3필드를 프로그램적으로 검사합니다.

브라우저 통합 테스트는 Reading→Candidate→Ready→Export, Listening→Quick Add→Companion→Sentence→Export, 중복 경고, preset, 모바일을 검증합니다. 기존 Wikipedia Mock·Reading·Listening·Companion·History·Dashboard·기존 Anki 회귀 테스트도 실행합니다. 외부 ChatGPT/BNE는 Mock이며 실제 OpenAI 호출은 없습니다.

| 검증 | 결과 |
| --- | --- |
| `npm test` | 39/39 통과, 실패 0 |
| `npm run test:e2e:anki` | 최종 12/12 통과, 실패 0 |
| `npm run test:e2e:legacy` | 최종 3/3 통과, 실패 0 |
| `npm run lint` | 통과, 오류·경고 0 |
| `npm run typecheck` | 통과 |
| `npm run build` | production build 통과; Reading·Listening·Anki·API 경로 생성 확인 |
| 최종 개발 서버 | 127.0.0.1:3000 실행; Home·Anki·History·Listening·기존 Listening/Reading 세션 모두 HTTP 200; API schemaVersion 3 |
| 실제 DB migration | 기존 10개 테이블 보존, 카드 3개 이관, 무결성 통과 |
| 10장 샘플 TSV | UTF-8 strict decode, 데이터 10행·각 3필드, 한글·apostrophe·특수문자·줄바꿈 처리 통과 |

중간 검증에서 입력란의 접근성 이름과 액션 타입 좁히기 오류를 수정했습니다. 구버전 DB 테스트 fixture에는 기존 preferences도 포함하도록 수정했습니다. Next 개발 캐시 재사용 중 일부 경로가 404로 나타나고 생성 타입 파일이 손상되는 문제가 재현되어, 테스트 서버를 종료하고 `.next/dev`를 `.next/dev-before-anki-recovery`로 보관한 뒤 새 캐시로 재실행했습니다. 이후 최종 통합 12개가 모두 통과했습니다. Node의 NO_COLOR/FORCE_COLOR 경고는 테스트 결과에 영향을 주지 않았습니다.

## 실제 Anki에서 직접 확인

이전 화면 안내 영역의 `.page` 클래스 중복으로 발생한 레이아웃 테스트 선택자 충돌도 수정했습니다. 기존 카드 학습·다운로드·모바일·키보드 회귀 3개를 재실행하여 모두 통과했습니다.

1. 샘플 TSV를 가져오고 UTF-8·탭 구분·HTML 허용, Front/Back/Tags 매핑을 확인합니다.
2. Basic 앞·뒤 노트 유형과 원하는 실제 덱을 선택합니다. 노트 유형 이름은 Anki 언어 설정에 따라 다릅니다.
3. 10장, 한글·apostrophe·특수문자·줄바꿈, Source attribution이 올바르게 보이는지 미리보기와 실제 카드에서 확인합니다.
4. 동일 파일/카드를 다시 가져올 때 중복 처리(갱신·무시·새 노트)와 대상 덱을 확인합니다. EXPORTED는 앱에서 파일을 생성한 상태이며 Anki 등록 확인이 아닙니다.
5. 사용자 브라우저의 실제 다운로드 위치와 파일 저장을 확인합니다. 앱은 Anki Desktop에 직접 연결하지 않습니다.

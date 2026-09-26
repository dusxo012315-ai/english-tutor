# V1 Stabilization Report — STEP 10

## 1. Audit와 발견한 문제

Home, Reading, Listening, History, Review, Anki 및 Anki 내부 Deck presets 설정을 검토했습니다. 별도 Settings route는 없습니다.

| 발견한 문제 | 조치 |
|---|---|
| Listening 라운드·요약, What I learned, 메모, 카드 편집 입력이 이동/새로고침으로 사라짐 | 명시적으로 선택한 입력만 탭 초안으로 보관, 저장 성공 시 제거 |
| Home 이어하기가 Reading 중심 | 공통 LearningSession의 Reading/Listening Continue Learning, 단계 표시 |
| 저장한 Listening 이전 단계로 돌아갈 UI 부족 | 완료 단계 표시와 단계 버튼, 이전 입력 조회·완료 전 수정 |
| Final Recall 저장 전 summary 첨삭은 이전 요약을 사용 | 현재 직접 작성 중인 최종 요약을 Companion에 전달·기록 |
| Anki 편집기가 URL에 반영되지 않아 새로고침 시 닫힘 | Candidate URL을 사용, 카드/버전별 편집 초안 복원 |
| Create Anki Card / Save expression / Save to Anki 혼용·중복 버튼 | Save to Anki 통일, Companion의 중복 버튼 제거 |
| Home의 기존 카드 수와 새 Candidate 수 불일치 | 공통 Candidate 기준 표시·연결, 이전 목록은 접어서 제공 |
| History Need review 필터에 공통 표시 누락, 일부 필터 빈 화면 안내 누락 | 공통 표시 반영, 필터 결과가 없으면 Empty UI |
| API catch에서 SQL/파일 경로 등 예상치 못한 오류가 노출될 수 있음 | UserFacingError만 메시지 공개, 나머지는 일반 오류 안내 |
| 초기 DB에 시연 세션이 자동 삽입됨 | 새 사용자 DB 시연 학습 생성 금지, 별도 개발 DB에서 opt-in |
| 이전 카드 삭제 뒤 Candidate에 오래된 legacy 참조 잔존 | Candidate·출처를 보존하고 선택적 legacy 참조만 해제 |
| 레거시 backfill의 카드별 조회, Review 통계 재계산 중복 | 일괄 Map 조회 및 이미 계산한 통계 재사용 |
| Next 개발/테스트/빌드 캐시 간 간섭 | `.next-local` / `.next-e2e` / `.next` 분리 |
| Tablet 1024px에서 본문과 Companion이 함께 좁아짐 | 1100px 이하 기존 본문/Companion 탭 방식 사용 |
| 아이콘만 남는 메뉴의 접근성 이름 불명확 | 주 메뉴 링크 aria-label 추가 |

## 2. 입력 보존 및 UX

`useDraft`는 입력을 500ms 지연 후 sessionStorage에 보관하며 이동/새로고침 전에도 보관합니다. DB는 기존 저장·완료 버튼으로 확정합니다. ‘초안 보관됨’과 ‘Saved’를 구분합니다. 브라우저 저장소 차단 시 안내하며 입력을 지우지 않습니다. Reading 프롬프트는 기존 DB 자동 저장도 유지합니다.

Listening의 임시 질문 텍스트는 메모리에만 두고 **초안 저장에서 제외**합니다. 본문 scraping, MP3 다운로드/직접 링크, iframe, ChatGPT DOM 제어는 추가하지 않았습니다. 새 AI 호출·Speaking·AnkiConnect·SRS도 추가하지 않았습니다.

## 3. 의도적으로 유지한 부분

- 기존 단일 사용자 SQLite 구조, LearningSession/AnkiCandidate/ReviewEvent 모델과 이전 기록을 유지했습니다.
- OpenAIProvider와 이전 Mock 학습·카드 화면은 호환성 및 future 용도로 보존했습니다. 현재 Companion runtime은 OpenAI adapter를 import하거나 API 키를 요구하지 않습니다.
- Reading과 Listening은 서로 다른 화면을 사용합니다. 공통화를 위한 대규모 재설계는 하지 않았습니다.
- 세션/History 삭제 기능을 새로 만들지 않았습니다. Candidate는 Archive이며, Review dismiss도 삭제가 아닙니다.
- 완료된 Listening 라운드는 조회만 가능하며 추가 생각은 메모로 남깁니다. 완료 시각/소요 시간을 소급 변경하지 않습니다.

## 4. 신규 파일

- `src/components/use-draft.tsx`
- `src/features/learning/continue-learning.tsx`
- `src/domain/errors.ts`
- `src/app/error.tsx`
- `scripts/backup.ts`
- `tests/stabilization.test.ts`
- `tests/e2e/stabilization.spec.ts`
- `playwright.v1.config.ts`
- `V1_STABILIZATION_REPORT.md`

## 5. 변경 파일

- Home/Reading/Listening/History/Review/Anki/Companion 관련 feature 컴포넌트, `src/components/provider.tsx`, `shell.tsx`, `src/app/globals.css`
- `src/app/learn/[sessionId]/page.tsx`, `src/app/listening/[sessionId]/page.tsx`: 세션별 컴포넌트 상태 분리
- `src/app/api/state/route.ts`: 안전한 오류 응답
- `src/domain/learning.ts`, `schemas.ts`, `anki.ts`, `selection.ts`, `tsv.ts`: 현재 요약 전달 및 사용자 오류 타입
- `src/data/repository.ts`, `learning-repository.ts`, `anki-repository.ts`, `review-repository.ts`
- `src/server/tutor-runtime.ts`, `src/server/adapters/mock.ts`: 사용자 오류 타입
- `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`, `tsconfig.json`, `next-env.d.ts`
- `package.json`, `scripts/migrate.ts`, `README.md`
- 기존 Playwright config: 독립 테스트 DB의 개발 seed 명시 및 E2E 캐시 설정
- 기존 Anki/Companion/Learning/Review E2E: 통일된 버튼 문구 반영
- 임시 DB를 쓰는 저장소 단위 테스트: 개발용 seed 명시

## 6. DB와 데이터 일관성

**새 DB migration 없음**, AppState 버전 4 유지. 작업 전 SQLite backup API로 `data/backups/before-v1-1790341115569.db`를 만들었습니다. `npm run db:backup`도 검증하여 `data/backups/reading-room-1790342287325.db`를 생성했습니다.

기존 사용자의 학습·카드를 자동 삭제/초기화하지 않았습니다. sourceSessionId는 Candidate 생성 시 실존 세션인지 검증합니다. SQL 외래키는 활성화되어 있습니다. ReviewEvent는 의도적으로 과거 항목을 참조하는 이벤트이며 dismiss해도 원 학습 데이터는 유지됩니다. 오래된 카드 삭제 시 공통 Candidate 및 export 스냅샷은 보존하고 legacy 링크만 해제합니다.

최종 개발 서버 재시작 및 브라우저 확인 후 백업과 현재 DB의 **14개 애플리케이션 테이블을 모든 행·필드 기준으로 비교하여 동일함을 확인**했습니다. 공통 세션 5개, Reading 상세 4개, Listening 상세 1개, Candidate 3개, Companion 기록 1개, 기존 export 기록을 포함해 모두 보존되었습니다. `foreign_key_check` 위반 0건, `integrity_check` 결과 `ok`입니다.

## 7–11. 자동화, lint, typecheck, build

| 검증 | 결과 |
|---|---|
| `npm test` | 51/51 통과 — 도메인·저장소·validation·Review·Anki/TSV·초기 DB 격리 |
| `npm run test:e2e:v1` | 21/21 통과 — Reading/Listening/Companion/Review/Anki 및 초안·Resume·반응형 |
| 마지막 초안 수정 후 Learning/Stabilization 재실행 | 10/10 통과 (위 E2E의 부분 재검증) |
| `npm run test:e2e:legacy` | 3/3 통과 |
| `npm run test:e2e:wiki` | 4/4 통과 — 실제 Wikipedia 문서와 오류·재시도 |
| Companion LIVE E2E | 1/1 통과 — 실제 Wikipedia + Companion, OpenAI 호출 없음 |
| `npm run test:wiki:live` | 3/3 통과 — Himalayas, Physics, Albert Einstein 제목/URL 및 본문 문맥 |
| Archived OpenAI live | 1개 의도적으로 skip, 유료 API 호출 없음 |
| `npm run lint` | 통과 |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 — production 컴파일·TypeScript·정적 생성·페이지 최적화 완료 |

고유 E2E 시나리오는 총 29개 통과했습니다. 최초 실행에서 Home의 동일 제목과 변경된 Tablet breakpoint를 반영하지 않은 기존 locator, Back 이동 전 navigation 대기 누락이 발견되어 테스트를 수정한 뒤 통과했습니다. 시나리오를 제거하거나 실패를 무시하지 않았습니다. 테스트는 시간별 독립 DB를 사용했습니다.

최소 10장 TSV fixture에서 UTF-8, 동일 필드 수, 탭 구분, 내부 탭/개행 정리, 한글·apostrophe·특수문자를 검증했습니다. `artifacts/anki/sample-10-cards.tsv`와 복수 카드 E2E 산출물 `artifacts/anki/v1-multiple.tsv`를 생성했습니다.

실제 OpenAI 유료 live 테스트는 Companion 버전 정책에 따라 명시적으로 비활성화하여 skip합니다. 보존된 adapter는 Mock SDK 계약 테스트로 검증합니다. 외부 사이트의 실제 로그인/답변이나 Anki Desktop 가져오기를 자동화 성공으로 주장하지 않습니다.

## 12–14. Desktop / Tablet / Mobile

- Desktop: 1280 / 1440 / 1920px
- Tablet: 768 / 820 / 1024px — Reading 본문 우선, 기존 탭으로 Companion 전환
- Mobile 기본 대응: 375 / 430px — Review / History / Anki / navigation
- 위 8개 폭에서 각 화면 로드 후 Reading 및 Review/History/Anki 가로 넘침·브라우저 오류 검사가 통과했습니다. Reading 및 Anki 스크린샷은 `artifacts/v1/reading-{width}.png`, `width-{width}.png`에 있습니다. 1024px Reading과 375px Anki 이미지를 직접 확인했습니다.
- 자동화 외 실제 앱 브라우저에서 Home → Continue Toys → 기존 Round 3 → Round 2의 저장된 difficulty 체크 복원, Review 추천 이유 → 원래 기록 dialog → Escape 닫기, Anki Exported 3개 보존을 확인했습니다. 이 확인에서는 실제 사용자 기록을 수정하지 않았습니다.
- 개발 서버는 `http://127.0.0.1:3000`에서 실행 중입니다. Home/Review/Anki/History/Listening 및 기존 Reading·Listening 세션 URL 모두 HTTP 200, `/api/state`는 schema 4 / tutor companion으로 정상 응답했습니다. PC·태블릿·모바일 검사는 브라우저 viewport 기준이며 실제 태블릿 하드웨어 검증은 아닙니다.

## 15. 보안 점검

- `.env.local`, DB, 캐시, 테스트 산출물은 Git ignore 확인. 키를 출력하거나 클라이언트 환경변수로 전달하지 않았습니다.
- 활성 Companion runtime은 OpenAI 키 없이 실행합니다. 보존된 OpenAI 코드의 서버 경계를 유지합니다.
- `dangerouslySetInnerHTML`/eval 사용 없음. 사용자 입력은 React 텍스트로 렌더링합니다. Wikipedia는 서버에서 태그·표·이미지·활성 콘텐츠를 제거한 텍스트 블록으로 변환합니다. TSV HTML도 escape합니다.
- Wikipedia/BNE는 지정 HTTPS 호스트와 lesson/document URL 형식을 검증합니다. BNE는 HTML 원문 링크만 제공합니다.
- POST Origin 검사와 입력 길이/범위 검증을 유지합니다. 예상치 못한 오류에서 DB 경로·SQL·stack trace가 사용자에게 노출되지 않도록 수정했습니다.
- `npm audit --omit=dev --audit-level=high`: 알려진 운영 의존성 취약점 0개.

## 16. Performance 점검

카드별 backfill SELECT를 미리 읽은 Map 조회로 바꿨습니다. 같은 Review 렌더에서 추천 계산을 두 번 수행하지 않습니다. 초안은 매 키 입력마다 DB에 쓰지 않습니다. Wikipedia 요청은 명시적인 사용자 불러오기 동작에서만 발생하며 오류를 Mock 원문으로 대체하지 않습니다. 대규모 캐싱/상태관리 교체나 bundle 재설계는 하지 않았습니다.

## 17. Known Issues / 범위

- 확정되지 않은 초안은 현재 탭에만 보관합니다. 탭 종료/저장소 삭제/기기 변경까지 보장하지 않습니다. 버전이 달라진 Anki 카드에는 오래된 초안을 자동 적용하지 않습니다.
- Listening 임시 질문 텍스트는 정책상 새로고침·단계 변경 시 소멸합니다.
- 동시 다중 사용자 서비스가 아니며, OneDrive에서 같은 SQLite 파일을 여러 PC가 동시에 쓰는 운영은 지원하지 않습니다.
- 팝업 크기·새 탭 동작·클립보드 권한은 브라우저가 결정합니다. BNE URL 형식은 검증하지만 해당 lesson의 실제 존재를 서버에서 조회하지 않습니다.
- EXPORTED는 TSV 파일 생성 상태이며 실제 Anki 가져오기 여부를 알 수 없습니다. 중복 가져오기 동작은 Anki 설정에 따릅니다.
- 여러 E2E 개발 서버를 같은 프로젝트에서 동시에 실행하지 마세요. 기본 개발 서버/빌드/E2E 캐시는 분리되어 있습니다.

## 18. Manual Verification Checklist

- [ ] 실제 Wikipedia 불러오기 (사용자 브라우저)
- [ ] 실제 BNE HTML lesson 열기
- [ ] 실제 clipboard 복사 (사용자 권한 설정)
- [ ] 실제 ChatGPT popup
- [ ] ChatGPT 로그인 상태에서 Ctrl+V 후 질문
- [ ] popup 차단 fallback
- [ ] 실제 Anki Desktop TSV 가져오기
- [ ] 한글 표시
- [ ] Front / Back / Tags mapping
- [ ] 원하는 Anki deck 선택
- [ ] 새로고침 후 학습 기록 유지

위 체크리스트는 사용자 환경에서 확인할 항목입니다. 자동화 Chrome의 clipboard/popup, 실제 MediaWiki API, 테스트 DB의 새로고침 복원은 별도로 검증합니다.

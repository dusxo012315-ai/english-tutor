# ChatGPT Companion 구현·테스트 기록

검증일: 2026-09-25 / Windows / Chrome / Next.js 16

## 구현

기본 Tutor는 ChatGPT Companion입니다. API 키 없이 프롬프트를 만들고, 클립보드 복사 후 ChatGPT를 별도 창으로 엽니다. 팝업 크기는 500×800으로 요청하지만 최종 창/탭 동작은 브라우저가 결정합니다. 팝업이 차단되면 일반 새 탭 링크를 직접 누를 수 있습니다. 복사 실패는 명시적으로 표시하고 직접 선택·복사할 수 있습니다.

여섯 질문 유형(해석, 문법/구조, 어휘/표현, 예문, 확인 문제, 자유 질문)마다 지시가 달라지며 선택 텍스트, 제목, 원문 URL, 주변 문맥을 포함합니다. 프롬프트 편집 내용을 저장·복원합니다. 초기화는 현재 선택만 지우고 이력을 보존합니다. History는 `프롬프트 준비` 상태를 표시하며 ChatGPT 전송·응답을 확인한 것으로 기록하지 않습니다.

ChatGPT 입력창 자동 삽입, DOM 조작, 답변 scraping, URL을 통한 프롬프트 전송은 없습니다. 사용자가 직접 붙여넣고 전송합니다. 기존 카드와 해설을 보존하며 새 선택으로 직접 작성한 카드도 기존 검토·확정·TSV 내보내기에 연결했습니다.

## 변경 파일

| 파일 | 변경 내용 |
| --- | --- |
| `src/domain/tutor-provider.ts` | TutorProvider 계약, ChatGPTCompanionProvider, 6개 질문 유형과 프롬프트 생성 |
| `src/features/tutor/companion-panel.tsx` | 선택·문맥·질문·프롬프트 편집, 복사/열기/초기화, 수동 카드 UI |
| `src/features/tutor/companion-browser.ts` | navigator.clipboard, 500×800 popup, opener 분리 및 오류 반환 |
| `src/server/tutor-runtime.ts` | 현재 Companion 실행 정책; 과거 openai 설정도 유료 호출 활성화 불가 |
| `src/app/api/state/route.ts` | OpenAI 어댑터 import와 호출 제거, Companion 상태 반환 |
| `src/data/repository.ts` | 프롬프트 초안 저장, 선택 초기화, 수동 카드 생성 및 기존 기록 보존 |
| `src/domain/types.ts`, `src/domain/schemas.ts` | Companion 저장 필드와 요청 검증 |
| `src/features/reading/reading-page.tsx` | 기본 Companion 패널과 기존 읽기/선택 연결 |
| `src/features/history/history-page.tsx` | 준비한 질문·수정 프롬프트 조회 및 원문에서 재열기 |
| `src/features/home/home-page.tsx` | Companion 질문 집계 |
| `src/components/shell.tsx`, `src/app/globals.css` | Companion 표시, 기존 디자인에 맞춘 프롬프트·문맥 영역 |
| `.env.example`, `README.md`, `package.json` | API 키 없는 설정, 사용법과 현재 테스트 명령 |
| `tests/companion.test.ts` | 프롬프트·저장·복원·카드·입력 검증·API 비활성화 단위 테스트 |
| `tests/e2e/companion.spec.ts` | 실제 클립보드·팝업·fallback·History·Anki·실제 Wikipedia 브라우저 검증 |
| `playwright.companion.config.ts`, `playwright.tutor.config.ts` | 현재 Companion 테스트 환경, 기존 명령 별칭 |
| `tests/e2e/wikipedia.spec.ts` | 기존 문맥 테스트를 Companion UI에 맞게 갱신 |
| `tests/archived/integrated-tutor.spec.ts`, `tests/archived/README.md` | 이전 통합 UI 테스트를 삭제하지 않고 별도 보관 |
| `tests/tutor.live.test.ts` | 이전 유료 테스트를 명시적 opt-in 없이는 실행하지 않도록 변경 |

`src/server/adapters/openai.ts`, `SqliteRepository.executeTutor`, 기존 통합 Tutor 화면은 보존했습니다. 현재 Route Handler에서 OpenAI 코드를 실행하지 않습니다. 향후 OpenAIProvider는 서버 경계에서 보존한 어댑터를 재사용할 수 있으며 현재 클라이언트용 계약에 API 키나 SDK를 포함하지 않습니다.

## 자동화 테스트 결과

- `npm test`: **23개 통과**. Companion 4개, 기존 도메인·저장소·Wikipedia 13개, 보존된 OpenAI 어댑터의 네트워크 없는 Mock 테스트 6개.
- `npm run test:e2e:legacy`: **3개 통과**. 기존 학습·History·카드·TSV, 9개 화면 크기, 모바일·키보드 동작 회귀.
- `npx eslint src tests playwright.companion.config.ts playwright.tutor.config.ts`: 통과.
- `npm run typecheck`: 통과.
- `npm run build`: 프로덕션 컴파일·타입 검사·페이지 생성 통과.
- `npm run test:e2e:companion`: 4개 시나리오 검증. 첫 실행에서 2개 통과, 테스트의 Windows 줄바꿈/문장 경계 가정을 수정한 뒤 실패한 2개 재실행 모두 통과.
  - 선택 → 문법 유형 → 제목·원문·문맥 포함 프롬프트 → 실제 클립보드 복사 → 실제 popup 생성·크기 옵션·opener 해제 → 편집 저장·초기화·History 복원.
  - popup 차단 시 새 탭 링크 및 실제 새 탭 생성, clipboard 권한 거부 안내.
  - 모바일 Reading → 자유 질문 → 수동 Anki 카드 검토·확정·TSV 다운로드.
  - **실제 MediaWiki API로 Himalayas 불러오기**, 실제 문장 선택과 주변 문맥 일치, 문법 프롬프트 생성, 직접 API 생성 요청 차단.

클립보드는 Windows가 LF를 CRLF로 바꾸므로 읽어 온 결과에서 줄바꿈 표현만 정규화해 비교합니다. 선택된 원문의 문자와 내용은 변경하지 않습니다. 초기 Wikipedia 테스트는 모든 첫 문단에 `. ` 구분자가 있다는 잘못된 가정 때문에 Range 끝 위치가 범위를 벗어났습니다. 실제 구분자가 있는 문단을 고르고 존재하는 원문 범위만 선택하도록 테스트를 수정했습니다.

ChatGPT 목적지 응답은 테스트용 빈 HTML로 대체했습니다. 브라우저의 클립보드와 popup/tab 생성은 실제 기능을 사용했으며, ChatGPT 로그인 화면이나 실제 답변은 자동화하지 않았습니다. 차단·권한 거부는 테스트에서 시뮬레이션했습니다. ChatGPT에 질문을 전송하거나 OpenAI API를 호출하지 않았습니다.

## 남는 사용 환경 차이

Chrome에서 검증했습니다. 브라우저의 사용자 설정·보안 정책에 따라 창 크기 요청을 무시하거나 탭으로 열 수 있습니다. 차단 시 제공된 링크를 사용하세요. Anki는 TSV 생성까지 검증했으며 Anki Desktop의 실제 가져오기는 수행하지 않았습니다. 기존 3개 문서 전체 Wikipedia 전용 회귀 스위트는 이번 단계에서 재실행하지 않았고, 현재 Companion의 실제 연결은 Himalayas로 검증했습니다.

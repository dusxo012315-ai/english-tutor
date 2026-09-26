# Wikipedia 연동 구현·검증 보고서

검증일: 2026-09-24 · Windows / Node 24.14.0 / Chrome 151.0.7922.174

## 구현 결과

- 기존 Home 입력과 Reading 디자인을 유지하고, 기본 조회를 실제 Simple English Wikipedia 공식 MediaWiki API로 변경.
- 제목·HTTPS 문서 URL·모바일 URL 지원. 리다이렉트는 최종 제목으로 처리하고 일반 namespace 0만 허용.
- query에서 제목·pageId·revisionId·timestamp·rightsinfo를 확인하고, parse의 oldid로 같은 판의 전체 HTML을 요청.
- HTML을 구조적으로 정제해 소제목·문단·일반 목록을 읽기용 텍스트로 제공. 표·이미지·각주·수식 포함 문단은 생략 내역 안내. 외부 HTML을 직접 렌더링하지 않음.
- 제목·원문 URL·Wikipedia contributors·편집 이력·판 고정 링크·CC BY-SA 4.0·추출 시각·변경 및 추가 고지 제공.
- 본문과 출처를 불변 SQLite snapshot으로 저장. 새 조회로 기존 기록의 원문을 덮어쓰지 않음.
- 선택 구간을 서버에 block ID/UTF-16 start/end로 전달하고, 서버가 저장 원문에서 정확한 quote를 재구성. 포함 문단과 인접 문단을 최대 6,000자로 구성해 Tutor에 전달·저장.
- Tutor에서 인용과 원래 문맥 확인, 추측 저장, 새로고침 복원 제공. 실제 AI 미연결 상태를 명시하며 실제 문서에 Mock 설명을 끼워 넣지 않음.
- 이전 Mock 기록과 카드 기능 보존. 실문서와 Mock 출처 배지를 구분.

## 자동화 테스트 결과

| 구분 | 명령 | 결과 |
| --- | --- | --- |
| 도메인·DB·API fixture·오류 | `npm test` | 13/13 통과 |
| 실제 Wikipedia 제목/URL 조회 | `npm run test:wiki:live` | 3/3 통과 |
| 실제 Wikipedia + Chrome | `npm run test:e2e:wiki` | 4/4 통과 |
| 기존 Mock 화면·카드·반응형 회귀 | `npm run test:e2e` | 3/3 통과 |
| strict 타입 검사 | `npm run typecheck` | 통과 |
| 린트 | `npm run lint` | 통과 |
| 프로덕션 빌드 | `npm run build` | 통과 |
| 패키지 검사 | `npm audit` | 취약점 0건 |

### 실제 문서 결과

문서 내용은 이후 편집될 수 있으며 아래 수치는 검증 당시 저장한 판 기준입니다.

| 문서 | pageId | revisionId | 읽기 블록 | 본문 UTF-16 길이 | 제목/URL 일치 | 선택·문맥 일치 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Himalayas | 14079 | 10732576 | 20 | 5,039 | 통과 | 통과 |
| Physics | 591 | 10979726 | 107 | 16,004 | 통과 | 통과 |
| Albert Einstein | 2138 | 11004286 | 69 | 24,934 | 통과 | 통과 |

각 문서에 대해:

1. 공식 API에서 제목으로 가져온 자료의 본문 길이·블록·출처·라이선스를 확인.
2. 원문 URL로 재조회하여 pageId와 snapshot ID가 같음을 검증.
3. 실제 본문의 문장 범위를 선택하고 `selection.quote === sourceText.slice(start,end)` 확인.
4. `context`의 선택 문단 text가 저장된 원문 문단과 정확히 같음을 검증.
5. Chrome에서 실제 DOM Range 선택 → 질문 버튼 → 서버 응답의 LearningItem → Tutor blockquote 및 펼친 문맥을 비교.
6. 추측 입력 후 새로고침하여 동일 인용·추측 복원 확인.

별도 spy Tutor 어댑터를 주입한 단위 테스트에서도 `explain()`에 전달된 LearningItem의 quote·context·source revision을 확인했습니다. 이는 **어댑터 입력 전달 검증**이며 실제 OpenAI 호출 결과가 아닙니다.

### 예외·안전한 렌더링 테스트

- 잘못된 host, HTTP, 사용자정보, 포트, query, 지원하지 않는 경로, 이중 인코딩, 비정상 문자, 비일반 문서 제목을 외부 요청 전에 거부.
- missing 문서, 동음이의어, 불명확한 라이선스, parse/query 판 불일치, HTTP 200 내부 error를 구분.
- 네트워크 단절, 잘못된 JSON, 지연·timeout, 429, 크기 초과를 모의 주입해 검증.
- script/onclick, 복잡한 표·그림, 중첩 목록, 각주, 수식 문단, 추가 credit 고지를 포함한 HTML fixture 정제 검증.
- 같은 단어가 반복될 때 문자열 첫 일치가 아닌 저장 offset 사용. surrogate pair 중간 선택 거부. 긴 문맥은 6,000자 안에서 선택을 보존.
- 실패 뒤 입력 유지·버튼 재활성화, 재시도 가능 상태를 Chrome에서 검증.

## 발견·조정한 사항

- 실제 API의 라이선스 URL은 `/4.0/deed.simple` 형태였습니다. 공식 도메인과 CC BY-SA 4.0 경로를 검증하면서 deed 언어 경로를 허용하도록 조정했습니다.
- 제목+URL 연속 비교에서 짧은 시간에 12개 요청을 보내자 Wikipedia가 429를 반환했습니다. 실패를 성공으로 바꾸거나 다른 원문으로 대체하지 않았습니다. Retry-After 전달을 추가하고, 실제 API 테스트에 문서별 32초 간격을 두어 재실행한 최종 결과는 3/3 통과였습니다. 앱의 자동 재시도는 없습니다.
- 기존 Repository는 시연 배열에서만 article을 찾았으므로 저장된 실제 snapshot 조회로 변경했습니다. 이전 JSON payload 및 DB 파일은 유지합니다.
- 실문서에 고정된 Mock 밑줄·정답을 적용하지 않도록 분리했습니다.

## 검증 증거와 실행 환경

- 실제 조회 메타데이터와 선택·문맥: `artifacts/wikipedia/Himalayas.json`, `Physics.json`, `Albert-Einstein.json`.
- Chrome 캡처: `artifacts/wikipedia/wiki-Himalayas.png`, `wiki-Physics.png`, `wiki-Albert-Einstein.png`. Physics 화면을 직접 열어 기존 배치와 인용 패널을 확인했습니다.
- 기존 Mock 반응형 회귀: 1440, 1366, 1024, 768, 390px 및 900/901·650/651 경계.
- Wikipedia E2E 전용 DB: `data/wiki-e2e.db`, 포트 3101. 일반 Mock 회귀 DB: `data/e2e.db`, 포트 3100. 사용자 개발 DB와 분리.
- artifact와 DB는 Git 제외 대상이며 외부에 게시하지 않았습니다.

## 남은 범위

- 실제 OpenAI 설명 호출·생성 품질은 이번 범위 밖이며 미연결입니다. API 키 없이 Wikipedia와 선택 문맥 전달은 동작합니다.
- 실제 단말의 터치 선택, 여러 문단을 가로지르는 범위 선택, 복잡한 수식/표/이미지 렌더링은 미지원 또는 미검증입니다. 한 문단 안의 단어·문장과 문단 버튼을 지원합니다.
- 원문 전체와 동일한 시각 렌더링을 제공하는 기능이 아닙니다. 생략된 내용은 원문 링크에서 확인합니다.
- 수식·표·미디어에 별도 이용 조건이 있을 수 있으므로 이번 텍스트 추출에서는 해당 요소를 재배포하지 않습니다.
- 현재 단일 로컬 사용자 구조이며 클라우드 배포·인증은 하지 않았습니다.

## 실행

```powershell
npm run dev
```

[로컬 앱](http://127.0.0.1:3000)에서 제목 또는 Simple English Wikipedia URL을 입력합니다. `WIKIPEDIA_MODE` 기본값은 live이며, 기존 `.env.local`에 이 변수가 없어도 실제 연결됩니다.

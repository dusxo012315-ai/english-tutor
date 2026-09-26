# Reading Room — UI·디자인 명세

버전 1.0 · 2026-09-23 · 기준: 비공개 시제품 버전 1

## 1. 재현 기준과 산출물

- [시제품](https://yeontae-english-reading.dusxo012315.chatgpt.site)
- 실제 소스 commit: `128a19bb26e1c086d0dc81366e3597baaf726629`
- `PROTOTYPE_SOURCE.zip`의 `dist/index.html`, `dist/styles.css`, `dist/app.js`가 해당 배포와 일치하는 기준 소스다.
- 아래 **기준 값**은 CSS에서 직접 읽은 값이다. 화면을 보고 추정한 수치가 아니다.
- **개발 보완**은 현재 소스와 별도로 표시한다. 시제품의 결함이나 누락을 확정된 서비스 동작으로 오해하지 않는다.
- 전 화면 실제 브라우저 캡처는 이번 산출물에 포함하지 않는다. 실행 가능한 소스와 수치 명세로 재현할 수 있다. 기존 검증은 JavaScript 문법·렌더링 분기·상태 로직 수준이며 실제 PC·태블릿 시각 검증은 개발 단계 M1/M9에서 수행한다.

## 2. 시각 방향

밝은 작업 공간, 파란색의 단일 행동 강조, 읽기 영역의 큰 영어 세리프체가 핵심이다. 왼쪽 탐색 → 중앙 원문 → 오른쪽 설명의 위계를 유지한다. 큰 장식 이미지·그라데이션·게임 점수·움직이는 배경을 추가하지 않는다.

Home은 오늘 자료와 최근 학습을 빠르게 여는 작업 화면이다. Reading은 원문이 주 영역이며 Tutor는 보조 영역이다. 한국어 설명은 고딕계열로 구분한다. History는 시간과 학습 항목을 중심으로 간결하게 표시한다.

## 3. 색상 토큰

| 토큰/용도 | 정확한 값 |
| --- | --- |
| `--ink` 기본 글자 | `#202a3a` |
| `--muted` 보조 글자 | `#687386` |
| `--line` 기본 경계 | `#e4e8ef` |
| `--blue` 주 행동·활성 메뉴 | `#2951d5` |
| `--blue-dark` 주 버튼 hover | `#173aaf` |
| `--soft` 활성 메뉴·소프트 버튼 | `#edf2ff` |
| `--bg` 앱 작업 배경 | `#f7f9fc` |
| 원문·카드·사이드바 | `#ffffff` |
| Tutor 패널·카드 미리보기 | `#f8faff` |
| 원문 영어 본문 | `#2e3643` |
| 선택 표현 mark | 배경 `#eaf0ff`, 아래선 `#abc0fd` |
| mark hover | `#dbe6ff` |
| 사용자 drag selection | `#d2ddff` |
| 인용 왼쪽 선 | `#9cb3f4` |
| focus-visible | `#819df6`, 3px outline, offset 3px |
| 메뉴 팝오버·toast | `#263554`, 글자 흰색 |
| 사용자 대화 bubble | `#eaf0ff` |
| 정답 결과 | `#ecf5ef` |
| 오답 결과 | `#fff3e2` |
| 성공 badge | 배경 `#eaf5ef`, 글자 `#27714f` |
| 확인 필요 badge | 배경 `#fff3df`, 글자 `#866017` |
| 기본 badge | 배경 `#edf0f5`, 글자 `#687386` |
| 오류 글자 | `#ae422d` |
| dialog backdrop | `#23314a55` |

배경을 어둡게 바꾸거나 여러 포인트 색을 도입하지 않는다. 정답/오답/보류는 색과 함께 문구·아이콘으로 구분한다. 낮은 대비의 보조 색을 중요한 안내나 입력 본문에 사용하지 않는다.

## 4. 타이포그래피

### 4.1 정확한 font stack

```css
--serif: Georgia, 'Times New Roman', serif;
--sans: Inter, -apple-system, BlinkMacSystemFont,
        'Segoe UI', 'Noto Sans KR', Arial, sans-serif;
```

시제품은 웹폰트 파일을 로드하지 않는다. `Inter`나 `Noto Sans KR`는 설치되어 있을 때만 적용되므로 OS별 한글 fallback이 다를 수 있다. 픽셀 단위 비교는 같은 OS·브라우저에서 한다. 개발 보완으로 자체 호스팅 폰트를 도입한다면 별도 변경 기록과 전 화면 검증이 필요하다.

### 4.2 크기·행간·간격

| 요소 | font-size / line-height | weight / 기타 |
| --- | --- | --- |
| 기본 body | 16px / 1.65 | sans |
| Home·History h1 | 30px / 1.4 | 기본 bold, letter-spacing -1px |
| 오늘 글 Himalayas | 54px / 1.1 | serif, -2px |
| Reading 문서 제목 | 57px / 1.1 | serif, -2px |
| 영어 본문 | 기본 21px / 1.9 | serif, 조절 18~26px |
| 영어 소제목 | 29px / 1.35 | serif, 500, -0.5px |
| 일반 h2 | 20px / 상속 | -0.4px |
| 섹션 목록 제목 | 18px / 상속 | sans |
| Tutor 제목 | 18px / 상속 | sans, -0.5px |
| Tutor 본문 | 14px / 1.9 | sans |
| 선택 인용 | 18px / 1.7 | serif |
| Tutor 영어 예문 | 17px / 1.9 | serif, `#354777` |
| 문법 chunk 영문/역할 | 15px / 11px | 역할 글자 muted |
| 저장 표현 제목 | 21px | serif, 500 |
| 카드 앞면 미리보기 | 25px | serif |
| 입력 | 14px / 1.7 | sans |
| 버튼 | 14px | 600 |
| 설명 label | 14px | 600 |
| 보조 metadata | 12~13px | sans |
| eyebrow | 12px | 700, letter-spacing 1.8px |
| 로고 | 20px / 1.1 | serif, bold, -0.5px |

개발 보완: 11px 문법 역할·12px 단계/행동은 기능 판단에 필요하므로 14px까지 높이는 접근성 수정 후보로 관리한다. 확정된 배치·색상은 유지하며 변경 전후를 비교한다. 문서의 영어 본문과 사용자 영작에는 `lang="en"`, 전체 문서에는 `lang="ko"`를 지정한다.

## 5. 공간·경계·컴포넌트

모든 크기는 CSS px, `box-sizing:border-box` 기준이다.

| 요소 | 규격 |
| --- | --- |
| 전역 sidebar | 기본 width 206px, fixed, padding 29px 18px 22px, 오른쪽 1px border |
| 상단 bar | 기본 높이 77px, 좌우 padding 38px, 아래 border |
| Home/History `.page` | max-width 1190px, margin auto, padding 39px 45px 50px |
| Home 주 grid | `minmax(0,1fr) 236px`, gap 24px |
| 오늘 글 카드 | radius 12px, 1px border, 위 27px 31px 23px, 아래 17px 30px |
| 최근 글 행 | columns `40px 1fr auto`, gap 16px, padding 20px 23px |
| 표현 grid | 3열, gap 15px |
| 표현 카드 | padding 20px, radius 9px, 1px border |
| Reading shell | max-width 1600px, columns `minmax(0,1fr) 390px`, gap 0 |
| Reading 본문 영역 | padding 32px 42px 50px, 흰 배경, min-width 0 |
| Tutor | 오른쪽 width 390px, 왼쪽 border, sticky top 0, height `calc(100vh - 77px)`, overflow-y auto |
| Tutor header | padding 22px 23px 16px, sticky top 0, z-index 3 |
| Tutor body | padding 22px |
| 설명 카드 | padding 17px, radius 9px, 1px border, 아래 margin 17px |
| 원문 문단 | margin-bottom 22px |
| 원문 섹션 제목 | margin 31px 0 16px, 번호와 gap 12px |
| Reading header | padding-bottom 27px, 아래 border, margin-bottom 30px |
| 인용 | 왼쪽 3px border, padding 10px 13px, margin 10px 0 20px |
| 기본 button | min-height 44px, padding 10px 17px, radius 8px, gap 9px, border 1px |
| icon button | min-width 42px, padding 9px |
| nav item | min-height 47px, padding 11px 14px, radius 7px, 아래 margin 7px |
| textarea | width 100%, min-height 115px, padding 11px 12px, radius 7px, resize vertical |
| 추가 질문 입력 | min-height 45px, max-height 130px |
| checkbox | 17×17px, accent blue |
| 일반 icon | 20×20px, stroke 1.6, round cap/join |
| dialog | width `min(550px,92vw)`, max-height 85vh, radius 13px, padding 0 |
| dialog header/content | 23px 25px, header 아래 border |
| 선택 menu | fixed, z-index 50, radius 8px, padding 5px, 어두운 배경 |
| toast | fixed bottom 26px, 중앙, max-width 90vw, radius 8px, z-index 100 |

그림자: 일반 카드에는 그림자 없이 border 사용. dialog만 `0 24px 90px #17243e33`, toast `0 8px 30px #1e2b4926`, 선택 메뉴 `0 6px 20px #20325230`.

## 6. 반응형 규칙

미디어 쿼리는 파일 순서대로 적용된다. 동일 selector가 겹치면 더 뒤의 값이 우선한다. 아래 구간표는 최종 적용값이다.

| viewport 폭 W | navigation | Reading layout | Tutor 폭 | 본문 좌우 padding | 주요 변화 |
| --- | --- | --- | --- | --- | --- |
| W ≥ 1600 | sidebar 206 | 2열 | 420 | 70 | reader shell 최대 1600 |
| 1200 < W < 1600 | sidebar 206 | 2열 | 390 | 42 | 기본 desktop |
| 1050 < W ≤ 1200 | sidebar 178 | 2열 | 350 | 28 | page padding 32, Tutor padding 19 |
| 900 < W ≤ 1050 | icon rail 78 | 2열 | 350 | 27 | nav text·logo text·사용자 정보 숨김 |
| 650 < W ≤ 900 | icon rail 78 | 1열 전환 | 화면 내부 max 660 | 45 | 본문/Tutor 탭, Tutor sticky·고정 높이 해제 |
| W ≤ 650 | 상단 nav 높이 64 | 1열 전환 | 화면 내부 max 660 | 25 | workspace margin-top 64, topbar 높이 62 |

900px 이하에서는 `.reader-shell[data-mobile=read]`일 때 Tutor를, `tutor`일 때 본문을 `display:none`으로 숨긴다. 전환 버튼은 sticky top 0, z-index 10, 기본 padding 0 24px(650 이하 0 13px)이다. 숨긴 영역에 키보드 포커스가 남지 않게 한다.

### 6.1 실제 본문 폭 계산

시제품에는 `.article-text` 자체의 고정 max-width가 없다. 실제 영문 폭은 shell에서 navigation, Tutor, 본문 padding을 뺀 값이다. 아래는 border 차이를 제외한 명목 값이다.

| viewport | workspace | reader-main 외곽 | 실제 text 폭 |
| --- | --- | --- | --- |
| 1920 | 1714, shell은 1600으로 제한 | 1180 | 약 1040px |
| 1600 | 1394 | 974 | 약 834px |
| 1440 | 1234 | 844 | 약 760px |
| 1366 | 1160 | 770 | 약 686px |
| 1280 | 1074 | 684 | 약 600px |
| 1200 | 1022 | 672 | 약 616px |
| 1024 | 946 | 596 | 약 542px |
| 901 | 823 | 473 | 약 419px |
| 900 | 822 | 822, 1열 | 약 732px |
| 768 | 690 | 690, 1열 | 약 600px |
| 650 | 650 | 650 | 약 600px |
| 390 | 390 | 390 | 약 340px |

초광폭에서 1040px가 긴 행으로 느껴질 수 있다. **개발 보완 제안**은 영어 본문에 `max-width:72ch; margin-inline:auto`를 추가하는 것이다. 이는 현재 소스의 값이 아니며, 기본 재현 후 1920px 읽기 비교로 적용 여부를 기록한다. 901/900 경계에서 폭 변화도 직접 확인한다.

### 6.2 추가 반응형 값

- Home grid의 보조 통계 열: 기본 236px → ≤1200에서 205px → ≤900에서 200px → ≤650에서 아래 행.
- 표현 grid: 기본 3열 → ≤900에서 1열. 각 표현 카드는 제목·뜻 2열로 바뀌고 footer는 전체 폭.
- History 표현 grid: 기본 2열 → ≤900에서 1열.
- Home/History page padding: 기본 39/45/50 → ≤1200에서 32 → ≤1050에서 30 → ≤650에서 26px 21px.
- Reading 제목: 기본 57px → ≤1050에서 50 → ≤900에서 55 → ≤650에서 49.
- 오늘 글 제목: 기본 54px → ≤1200에서 49.
- 본문 line-height: 기본 1.9 → ≤650에서 1.85.
- 650 이하의 Home 통계는 두 칸 가로 배열, 사이 구분선. 날짜 표시는 숨긴다.

## 7. 화면 구성과 상호작용 재현

### 7.1 공통 AppShell

왼쪽은 Reading Room 로고 → 학습 홈 → 읽기 학습 → 학습 기록 → 저장한 표현 → 하단 사용자 표시 순서다. 활성 메뉴는 soft 배경+blue 글자다. 상단은 breadcrumb와 상태 안내 버튼이다.

실서비스에서는 시연 모드 배지를 항상 붙이지 않는다. 실제 AI/저장 연결 상태에 맞는 배지를 제공하고 데모 화면만 `시연 모드`로 표시한다. 이름을 코드에 하드코딩하기보다 개인 설정의 displayName으로 제공한다. 여러 사용자 계정을 추가하라는 의미는 아니다.

### 7.2 Home

- 상단: `오늘의 학습`, 보조 문장, 오른쪽 날짜.
- 첫 행: 큰 오늘 글 카드와 좁은 표현·질문 통계 카드.
- 다음: 최근에 공부한 글 목록과 학습 기록 링크.
- 마지막: 다시 기억할 표현 카드.
- 실제 버전의 제목·URL 입력은 오늘 글 카드 근처에 1행 폼으로 추가한다. 폭이 좁으면 입력과 버튼을 줄바꿈한다.
- 빈 상태에서는 시연 날짜·표현 수를 표시하지 않는다. 초기 Himalayas 추천은 ‘추천 자료’로 표현한다.

### 7.3 Reading

본문 상단: 홈 이동/글자 크기 → 출처 eyebrow → 영문 제목 → 주제·원문·라이선스 → 선택 도움말 → 번호 있는 소제목과 문단.

선택 메뉴는 선택 범위의 아래에 놓고 viewport 밖으로 넘지 않도록 보정한다. 시제품 기준 left는 `[8, W−242]`, top은 `[8, H−60]` 범위다. 실제 메뉴 너비가 바뀌면 하드코딩 242 대신 측정 너비로 보정한다. scroll/Escape에서 닫고 원문 선택은 별도의 데이터로 보존한다.

준비된 밑줄 표현은 데모에만 존재한다. 실모드에서는 사용자 질문·보관 표현의 표시로 사용하되, 아직 질문하지 않은 특정 문구에 데모 행동을 남기지 않는다.

본문 하단: 생략 범위와 출처·편집 이력·라이선스, `이번 학습 마치기`. 긴 원문은 정상 스크롤하고 내부에 또 다른 고정 높이 읽기 창을 만들지 않는다.

### 7.4 AI Tutor

- 고정 제목과 mode badge.
- `내 추측 / 설명 / 기억 확인` 3단계. 원형 숫자 19px, 단계 사이 얇은 선.
- 선택 문장은 흰 인용 상자로 고정.
- 추측: label, textarea, 보조 문구, 주 버튼, ‘아직 모르겠어요’.
- 설명: 문장 해석 → 문법 구조 chunk와 설명·예문 → 주요 표현 checkbox → 보관 → 기억 확인 → 추가 대화.
- 추가 대화: 내 말은 오른쪽으로 20px 들여쓰기, soft 배경. 답변은 흰 카드. 전송 버튼은 파란 정사각형.
- 문제: 세 선택지를 세로로 배열. 선택 상태는 파란 border와 soft 배경. 제출 후 결과·해설 및 영작 입력.
- 저장된 사용자 추측과 설명을 구분하고 답변이 추측을 자동으로 ‘정답’ 처리하지 않게 한다.

### 7.5 History

상단 제목과 `다시 읽기`, 아래 4개 탭. 날짜별 카드에는 제목·학습 섹션·질문 수·첫 시도 결과를 표시한다. 질문 상세는 원문/내 추측/AI 설명을 펼친다. 오답은 내 답과 정답, 해설을 함께 보인다.

탭을 WAI-ARIA tab으로 구현할 경우 좌우 키·Home/End·roving tabindex까지 제공한다. 그렇지 않으면 단순 필터 버튼으로 구현해 잘못된 tab semantics를 피한다. 실제 버전은 날짜별 사용자 기록과 데모 기록을 같은 목록에서 섞지 않는다.

### 7.6 표현·카드 모달

공통 dialog 안에서 목록 → 편집 → 미리보기로 전환한다. 550px/92vw 폭, 화면 높이 85vh 제한, 내부 세로 스크롤. 닫기 버튼·Escape·backdrop 닫기를 지원한다. 미저장 카드가 있으면 버리기 전 확인한다. focus trap과 닫은 뒤 호출 버튼으로 포커스 복원을 지킨다.

앞면/뒷면 미리보기의 카드 표면은 Tutor와 같은 연한 배경. 내보내기 성공 문구는 `다운로드 시작`으로 표현하고 `Anki에 저장 완료`라고 하지 않는다.

## 8. 상태 UI

| 상태 | 위치·표현 | 행동 |
| --- | --- | --- |
| 본문 로딩 | 오늘 글 입력 옆/Reading 본문 | 같은 버튼 중복 실행 금지, 입력 유지 |
| AI 요청 중 | Tutor 현재 단계 | ‘설명 만드는 중’, 입력 read-only, 취소/기다리기 |
| 저장 중 | 현재 입력 또는 Tutor header | 작은 상태 문구 |
| 저장 성공 | 같은 위치 | transaction 완료 후 ‘저장됨’ |
| 저장 실패 | 입력/답변 바로 아래, 오류 색 | ‘저장되지 않음’ + 재저장; toast만으로 끝내지 않음 |
| AI 실패 | 선택 문맥·추측 아래 | 원인에 맞는 짧은 안내, 수동 재시도 |
| 오답 | 결과 카드 | 내 답·정답·해설, 색 외에 문구 |
| 설명 검토 필요 | 설명·연결 카드 | 경고 badge, 내보내기 차단 이유 |
| 기록 없음 | 해당 목록 | 짧은 안내 + 글 읽기 이동 |
| 세션 종료 | 요약 dialog | 질문·문제·표현·영작 실제 개수 |

정상적인 input·textarea에는 전체 화면 리렌더로 caret·스크롤·IME 조합이 끊기지 않게 한다. 새 튜터 결과 도착 시 사용자가 다른 항목을 보는 중이면 현재 화면을 빼앗지 않는다.

## 9. 접근성과 품질 보완

다음은 실제 앱의 필수 품질 조건이다. 시제품 CSS에 이미 모두 구현되어 있다는 뜻이 아니다.

- 주 행동 및 터치 버튼 hit area 최소 44×44px. 현재 32px 글자 크기 버튼·작은 문단 버튼은 투명 padding으로 영역 보완.
- 본문 확대 200%에서 내용·버튼 겹침, 가로 스크롤, 숨겨진 필수 행동이 없어야 한다.
- 긴 URL, 1,200자 인용, 긴 한국어·영어 입력은 줄바꿈하며 패널을 넓히지 않는다.
- `prefers-reduced-motion`에서 전환·smooth scroll 제거. 기본 toast 전환은 0.2초.
- skip link, landmark, label, 키보드 선택 대체 버튼, 명확한 focus-visible 제공.
- icon rail의 모든 버튼은 accessible name과 hover/focus 설명을 갖는다.
- 작은 글자 대비·badge 대비는 실제 색 조합으로 검사한다. 코드에 값이 있다는 것만으로 접근성 통과 처리하지 않는다.
- mobile nav는 fixed top이므로 뒤 콘텐츠와 전환탭이 가려지지 않아야 한다. safe-area가 필요한 기기에서 검증한다.

## 10. 시제품에서 그대로 옮기지 말아야 할 구현

| 현재 소스 | 실제 앱에서 바꿀 점 |
| --- | --- |
| sessionStorage 단일 state | IndexedDB 모델·Repository·transaction |
| 질문과 대화의 전역 배열 | LearningItem별 thread·메시지 연결 |
| 시연 fixture에 맞춘 substring 선택 | 실제 블록 ID·UTF-16 spans·quote anchor |
| 하나의 전역 production 문자열 | LearningItem별 영작 레코드 |
| 최근 attempt를 그대로 노출 | 명시적 재시도 시작 시 새 Attempt draft, 제출 전 정답 숨김 |
| 페이지 이동 시 전체 innerHTML 재작성 | 컴포넌트 상태·focus·caret·draft 유지 |
| 두 선택 메뉴가 동일 행동 | questionType을 의미/문법으로 구분해 전달 |
| 고정 숫자·시연 날짜 합산 | 실제 Repository 집계 |
| 제한된 범위에서만 고정 설명 | 실제 TutorAdapter, 모의 답변은 데모 전용 |
| 사용되지 않는 일부 CSS class | 필수 시각 요소로 오해하지 않음; 사용한 컴포넌트만 재현 |

## 11. UI 검증 체크리스트

실제 브라우저에서 1440×900, 1366×768, 1024×768, 768×1024, 390×844를 확인하고 900/901, 650/651 경계도 비교한다. Home, Reading의 추측·설명·문제 상태, History 네 필터, 표현 목록·카드 미리보기를 캡처한다.

- [ ] 핵심 영역의 너비와 색상 토큰이 위 기준과 일치한다.
- [ ] 데스크톱 오른쪽 Tutor와 본문 스크롤을 각각 사용할 수 있다.
- [ ] 태블릿 전환 후 선택 문맥·추측·읽기 위치가 유지된다.
- [ ] hover 없이도 선택·추측·문제·카드 행동이 가능하다.
- [ ] 키보드로 전체 흐름·모달·필터를 사용할 수 있다.
- [ ] 빈 상태·오류·긴 글·긴 답변에서도 레이아웃이 깨지지 않는다.
- [ ] 브라우저/OS/font fallback과 적용한 개발 보완을 검증 기록에 적는다.

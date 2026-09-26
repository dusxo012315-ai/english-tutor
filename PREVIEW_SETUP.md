# 개인용 TEST Preview 설정

현재 단계: 코드·로컬 검증. GitHub/Vercel/Turso 계정이 아직 없으므로 원격 배포는 하지 않았습니다. 이 문서는 사용자가 설정할 때의 안내입니다. **운영 DB 생성, 실제 학습 데이터 업로드, production 전환은 별도 승인 전에는 진행하지 않습니다.**

## 1. 계정

- GitHub 개인 계정: private 저장소로 소스 보관. 아직 이 폴더에는 최초 commit이 없습니다.
- Vercel 개인 Hobby 계정: Next.js Preview. 처음에는 Git 자동 배포 연결 없이 CLI로 Preview만 만듭니다.
- Turso Free 계정: `reading-room-test` 같은 별도 TEST DB만 생성합니다. 유료 전환·결제 정보·도메인은 필요하지 않습니다. 무료 한도 초과 시 업그레이드를 자동으로 진행하지 마세요.

비밀번호, AUTH_SECRET, Turso 토큰을 채팅·Git·스크린샷으로 공유하지 마세요. `.env*`, `data/`, DB/WAL/SHM, `artifacts/`, `.vercel/`는 Git 제외 대상입니다. `.vercelignore`도 실제 DB와 환경 파일의 업로드를 제외합니다. 첫 commit 전 `git status --short`로 반드시 확인합니다.

## 2. 비밀번호 생성

16자 이상의 다른 서비스와 겹치지 않는 비밀번호를 비밀번호 관리자에 보관합니다. PowerShell 7에서:

```powershell
Read-Host '앱 비밀번호 (16자 이상)' -MaskInput | npm run auth:secret
```

출력되는 `APP_PASSWORD_HASH`와 `AUTH_SECRET`을 환경변수에 저장합니다. 평문 비밀번호는 앱 서버 설정에 저장하지 않습니다. 명령 인자에 비밀번호를 쓰지 마세요. Windows PowerShell 5라면 PowerShell 7의 터미널을 사용하세요. 테스트 코드에 있는 고정 비밀번호/secret은 Preview에서 사용하면 안 됩니다.

## 3. 환경변수

| 변수 | 로컬 시험 | Vercel Preview |
|---|---|---|
| DB_MODE | local 또는 libsql | libsql |
| DATABASE_PATH | ./data/deployment-local.db | 불필요 |
| DATABASE_PURPOSE | test | test (필수) |
| TURSO_DATABASE_URL | libSQL 시험 시 file:./data/별도.db | TEST DB의 libsql:// URL |
| TURSO_AUTH_TOKEN | file 모드는 불필요 | TEST DB 토큰 |
| AUTH_ENABLED | true 권장; HTTP 개발만 false 허용 | true 필수 |
| APP_PASSWORD_HASH | 생성한 salt:scrypt hash | 생성한 hash |
| AUTH_SECRET | 생성한 무작위 secret | 생성한 secret |
| APP_URL | http://127.0.0.1:3000 | 고정 Preview alias의 정확한 https origin |
| DEV_SEED | false (시험용 새 DB만 true 가능) | false |
| WIKIPEDIA_MODE | live | live |
| TUTOR_MODE | companion | companion |

이 변수에 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. NODE_ENV는 플랫폼에 맡기고, APP_MODE는 더 이상 사용하지 않습니다. NEXT_BUILD_SCOPE는 E2E 전용입니다. OPENAI_API_KEY는 필요 없으며 배포하지 않습니다.

## 4. TEST Turso schema 준비

Turso 대시보드에서 **빈 TEST DB**와 그 DB 전용 토큰을 만듭니다. 기존 DB import 기능은 사용하지 않습니다. CLI를 쓰는 경우 공식 [DB 생성](https://docs.turso.tech/cli/db/create), [토큰 생성](https://docs.turso.tech/cli/db/tokens/create) 문서를 따르세요.

로컬 PowerShell에서 위 환경변수 중 DB_MODE=libsql, DATABASE_PURPOSE=test, URL/token, 인증 설정을 지정합니다. 토큰 입력은 개인 환경 파일 또는 보안 입력을 사용합니다. 환경변수는 기존 `.env.local`보다 우선합니다.

```powershell
npm ci
npm run db:migrate:test
```

이 명령은 기존 `drizzle/` migration 4개를 순서대로 적용하고 journal checksum을 검사합니다. 학습 데이터는 가져오지 않습니다. 앱 구동 중 cloud DB를 자동 migration하지 않습니다. 기존 Reading/Anki 호환 backfill 코드는 유지하되 빈 TEST DB에는 실제 기록이 없습니다. 기존 창작 Mock article catalog는 초기 설정에 포함될 수 있으나 사용자 학습 데이터는 아닙니다.

실패 시 TEST DB와 로그를 확인하고 재실행합니다. 원본 SQLite 파일을 고치거나 초기화하지 않습니다. 운영용 import/rollback 도구는 운영 이전 승인 후 원본 복제본으로 별도 검증해야 합니다.

## 5. Vercel Preview만 준비

1. 로컬 테스트를 통과한 코드를 private GitHub 저장소에 보관합니다. 비밀값과 DB가 staged 목록에 없는지 확인합니다. 아직 Vercel Git 자동 배포는 연결하지 않습니다.
2. Vercel CLI로 본인 계정에 로그인하고 `vercel link`로 새 Hobby 프로젝트를 연결합니다. CLI 설치/로그인은 사용자가 직접 합니다. Next.js preset, Node.js 22 이상, install=`npm ci`, build=`npm run build`를 사용합니다.
3. 프로젝트 Settings → Environment Variables에서 **Preview 범위만** 위 환경변수를 설정합니다. Production 범위에는 운영 DB 값을 넣지 않습니다.
4. 처음 APP_URL은 소유할 예정인 고정 Preview alias로 지정합니다. `vercel deploy`로 Preview 배포합니다. **`--prod` 및 Promote to Production은 사용하지 않습니다.**
5. Deployment의 실제 URL을 확인한 뒤, 계정에서 사용 가능한 고정 `*.vercel.app` alias를 Preview deployment에 지정합니다. CLI `vercel alias set <deployment-url> <alias>` 또는 연결된 Git branch의 고정 Preview URL을 사용할 수 있습니다. 구매 도메인은 필요하지 않습니다. APP_URL이 그 alias의 정확한 HTTPS origin과 다르면 수정 후 Preview를 다시 배포하고 alias를 새 deployment로 연결합니다.
6. 앞으로는 그 alias로만 접속합니다. 임의 deployment URL로 로그인하면 Origin 검사 때문에 차단될 수 있습니다. 다른 origin을 자동 허용하지 않습니다.
7. Vercel의 Preview Deployment Protection이 먼저 로그인 화면을 표시하면 두 기기에서 본인 Vercel 계정으로 인증합니다. 앱 비밀번호 보호는 별도로 유지됩니다. 기본 보호를 끄는 작업은 이 안내에 포함하지 않습니다.
8. Firewall에서 `/api/auth/login` POST에 IP별 요청 제한을 설정합니다. 앱 안의 10분/10회 제한은 프로세스별 보조 장치이므로 서버리스 전체에 대한 제한을 보장하지 않습니다. 무료 플랜에서 가능한 범위의 플랫폼 rate-limit을 설정하고 확인합니다. 유료 옵션만 보이면 업그레이드하지 말고 설정을 중단해 알려 주세요.

CLI 명령 순서 예시 (계정과 환경변수를 준비한 뒤 사용자 실행):

```powershell
npm install --global vercel
vercel login
vercel link
# Dashboard에서 Preview 환경변수를 먼저 설정
vercel deploy
# 실제 반환된 deployment 주소와 본인이 소유 가능한 alias 사용
vercel alias set <deployment-url> <preview-alias.vercel.app>
```

Vercel install/build command에 DB migration을 넣지 마세요. Preview마다 같은 TEST DB를 반복 초기화할 필요가 없습니다. 환경변수를 바꾸면 기존 deployment가 아니라 새 Preview에 적용되므로 다시 배포하고 alias를 확인합니다.

공식 참고: [Preview 환경](https://vercel.com/docs/deployments/environments), [CLI deploy](https://vercel.com/docs/cli/deploy), [생성 URL](https://vercel.com/docs/deployments/generated-urls), [Alias](https://vercel.com/docs/cli/alias), [WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## 6. 두 기기 검증

동일 Preview alias를 Windows Chrome과 Galaxy Tablet Chrome에서 엽니다. 로그인 쿠키는 기기마다 별도이고 DB는 동일합니다. 로그인은 최대 30일 유지됩니다. 로그아웃은 해당 브라우저 쿠키를 지웁니다. 비밀번호 hash 또는 signing secret 교체는 기존 모든 서명을 무효화합니다.

- [ ] 비로그인 Home/History/API 차단, 잘못된 비밀번호 안내
- [ ] Laptop에서 실제 Wikipedia Reading 생성 → Tablet History에서 확인
- [ ] Tablet에서 Listening Round 1~Final 저장 → Laptop History/Review 확인
- [ ] What I learned, 이해도, Anki Candidate가 다른 기기에서도 보임
- [ ] 두 기기에서 같은 기록 편집: 오래된 쪽은 409 충돌 안내, 자동 덮어쓰기 없음
- [ ] 충돌 시 입력을 따로 보관하고 새로고침 → 최신 기록과 비교 후 명시적 저장
- [ ] 768/800/1024px Reading/Listening/Review/Anki/History 확인
- [ ] TSV 다운로드 및 실제 Anki Desktop 가져오기, UTF-8/한글/Front·Back·Tags/덱 확인
- [ ] 실제 clipboard 권한, ChatGPT popup 및 차단 fallback, 로그인 후 직접 붙여넣기
- [ ] BNE 원본 HTML lesson 열기 (MP3/본문 자동 수집 없음)
- [ ] 앱 새로고침/서버 재배포 후 저장된 기록 유지, Continue Learning
- [ ] 로그아웃 후 API 접근 차단

조회 화면은 다시 포커스를 얻거나 30초마다 최신 데이터를 요청합니다. textarea가 있는 편집 화면에서는 입력 보존을 위해 자동 적용하지 않으므로 재진입/새로고침으로 갱신합니다. 미저장 초안은 해당 탭에만 있고 기기 간 공유되지 않습니다.

## 7. 운영 이전은 별도 단계

TEST Preview 양 기기 검증을 마친 뒤에만 운영 DB 생성·이전 승인을 요청합니다. 승인 전에 원본 `data/reading-room-demo.db`는 그대로 보존합니다. 이후 필요한 절차는 SQLite 일관성 백업 → 별도 복제본 검사 → 빈 운영 DB schema 적용 → 명시적 데이터 복사 → 테이블별 행 수/ID/JSON/관계 검증 → 읽기 시험 → production 전환입니다. 새 운영 기록이 생긴 후에는 낡은 SQLite를 덮어써서 rollback하지 않습니다. 먼저 새 기록을 백업하고 복구 방향을 결정해야 합니다.

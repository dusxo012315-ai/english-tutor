# Study Plan TEST migration — 수동 실행

프로젝트 루트 PowerShell에서 한 번 실행합니다.

```powershell
npm run study-plan:migrate:test
```

입력 순서:

1. 기존 TEST DB hostname: Turso에서 실제 TEST 대상임을 확인한 뒤 입력합니다. hostname에 `test`가 독립된 이름 부분으로 있어야 합니다. 이 조건에 맞추려고 DB 이름이나 URL을 임의로 바꾸지 마세요.
2. 같은 DB의 `libsql://...` URL: 숨김 입력입니다.
3. 이미 보유한 해당 TEST DB 토큰: 숨김 입력입니다. 새 토큰을 생성하거나 Vercel Sensitive 값을 추출하지 마세요. 기존 토큰을 보유하지 않았다면 진행하지 마세요.

실행 중 두 기기에서 학습 저장을 잠시 멈춰 주세요. Production 대상으로 실행하지 마세요. hostname 확인은 운영자가 제공한 TEST 지정에 의존하며, 스크립트가 Turso 계정의 용도를 독립적으로 증명할 수는 없습니다.

자격정보는 하위 프로세스 환경에서만 사용하며 종료 시 이전 프로세스 환경을 복원합니다. `.env`, 명령행 인수, 로그, 소스 파일에 값이 저장되지 않습니다. Vercel CLI를 호출하지 않습니다. URL/토큰은 콘솔에도 표시하지 않습니다.

## 자동 처리

- 목적 `test`, 모드 `libsql`, hostname 일치, TEST 이름, Production 이름/환경 거부, placeholder 거부.
- 기존 0000–0003 migration hash·timestamp 및 14개 앱 테이블 schema 확인. 예상 밖 schema/index/trigger가 있으면 중단.
- FK/integrity 확인, 모든 기존 행(IDs 및 payload 포함)의 개수·내용 hash를 메모리에 기록.
- 새 적용 전 전체 앱 DB와 migration journal을 `data/backups/study-plan-operator/`의 별도 SQLite 파일로 복원하고 schema/데이터/FK/journal을 대조. 백업에는 학습 데이터가 있으므로 외부 공유하지 마세요. 토큰/접속 URL 환경값은 저장하지 않습니다. `data/`는 Git 제외 대상입니다.
- checksum이 고정된 0004만 적용. 기존 테이블 DROP/ALTER/backfill 없음.
- 새 테이블/인덱스/schema, migration 이력, 기존 데이터 불변, FK/integrity를 commit 전에 확인.
- 전체 원격 작업은 하나의 transaction. 검사 실패는 rollback. 이미 적용된 정상 DB는 변경 없이 종료.

출력 `APPLIED`는 검증과 commit 완료, `ALREADY_APPLIED`는 이미 적용되어 재적용하지 않았음을 뜻합니다. `STOPPED`이면 후속 배포를 하지 말고 결과를 알려 주세요. 네트워크가 commit 응답 직전에 끊긴 경우 성공 여부가 불확실할 수 있으므로 이 멱등 operator로 재검증할 수 있습니다. 실패 원문에 자격정보가 포함될 수 있어 driver 오류는 출력하지 않습니다.

원격 transaction 제한 시간이나 네트워크 문제로 중단될 수 있습니다. 백업/검사가 오래 걸리면 검사나 안전장치를 제거하지 말고 중단 결과를 검토해야 합니다.

## 검증 범위

SQLite와 libSQL 파일 fixture에서 성공 적용, 0004 적용 중 오류 rollback, 재실행, 기존 데이터 보존, 백업 복원, 잘못된 migration 이력 거부를 검증했습니다. 목적/대상/placeholder 거부도 검증했습니다. 실제 원격 DB와 실제 토큰 입력은 실행하지 않았습니다. Git commit/push 및 Vercel 배포는 별도 단계입니다.

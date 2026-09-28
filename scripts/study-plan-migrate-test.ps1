$ErrorActionPreference = 'Stop'
$names = @('DB_MODE','DATABASE_PURPOSE','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','STUDY_PLAN_EXPECTED_TEST_HOST')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:DB_MODE = 'libsql'
    $env:DATABASE_PURPOSE = 'test'
    $env:STUDY_PLAN_EXPECTED_TEST_HOST = Read-Host 'Existing TEST database hostname (must contain test; no URL scheme)'
    $urlSecure = Read-Host 'Existing TEST libsql URL (hidden)' -AsSecureString
    $tokenSecure = Read-Host 'Existing TEST token (hidden; do not create a new token)' -AsSecureString
    $env:TURSO_DATABASE_URL = [System.Net.NetworkCredential]::new('', $urlSecure).Password
    $env:TURSO_AUTH_TOKEN = [System.Net.NetworkCredential]::new('', $tokenSecure).Password
    & node ./node_modules/tsx/dist/cli.mjs scripts/study-plan-migrate-test.ts
    $operatorExit = $LASTEXITCODE
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    if ($urlSecure) { $urlSecure.Dispose() }
    if ($tokenSecure) { $tokenSecure.Dispose() }
}
exit $operatorExit

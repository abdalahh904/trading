$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$checks = @(
  @{Name="Dashboard endpoint"; Path="server.ts"; Pattern="app.get('/api/orders'"},
  @{Name="Piya endpoint"; Path="server.ts"; Pattern="app.get('/api/piya/brief'"},
  @{Name="Piya engine import"; Path="server.ts"; Pattern="piya_quant_engine.js"},
  @{Name="7 strategies"; Path="src/server/strategy_ranking.ts"; Pattern="FVG_LIQUIDITY_SWEEP"},
  @{Name="MTF confirmation"; Path="src/server/ai_trading_pipeline.ts"; Pattern="confirmMultiTimeframe"},
  @{Name="Attach-only bridge"; Path="mt5_desktop_bridge.py"; Pattern="AUTO_LOGIN"},
  @{Name="Test folder"; Path="TEST_LOGIN_API/test_login_api.bat"; Pattern="powershell"}
)
$failed=0
foreach ($c in $checks) {
  $f=Join-Path $root $c.Path
  if (-not (Test-Path $f) -or -not (Select-String -Path $f -Pattern $c.Pattern -Quiet)) {
    Write-Host "[FAIL] $($c.Name)" -ForegroundColor Red; $failed++
  } else { Write-Host "[PASS] $($c.Name)" -ForegroundColor Green }
}
if ($failed) { exit 1 }
Write-Host "FINAL SOURCE AUDIT PASS" -ForegroundColor Green

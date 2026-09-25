# ============================================================================
# AI-TRADER 24/7 WATCHDOG (PowerShell 7 / pwsh) — supervises the desktop bridge,
# platform server, and AI state. It NEVER launches or logs into the MT5 terminal.
# Kill switch: create STOP_WATCHDOG.txt next to this script to exit gracefully.
# Logs to watchdog.log. Poll cycle: 10 seconds.
# Liveness is verified via real HTTP probes (server /api/state, bridge /api/health)
# plus local listening-socket checks. A component is restarted only when proven
# down/hung (strike counter >= 3) to avoid restart fights during boot.
# ============================================================================
$ErrorActionPreference = 'SilentlyContinue'
$work = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverUrl = 'http://127.0.0.1:3000'
$bridgeUrl = 'http://127.0.0.1:18812'
$logPath = Join-Path $work 'watchdog.log'
Set-Location $work

function Resolve-CommandPath($name) {
    try {
        $cmd = Get-Command $name -ErrorAction Stop | Select-Object -First 1
        return $cmd.Source
    } catch { return $null }
}

$pythonExe = Resolve-CommandPath 'python'
if (-not $pythonExe) { $pythonExe = Resolve-CommandPath 'py' }
$nodeExe = Resolve-CommandPath 'node'
$tsxCli = Join-Path $work 'node_modules\tsx\dist\cli.mjs'
$terminalExe = if ($env:MT5_TERMINAL_PATH) { $env:MT5_TERMINAL_PATH } else {
    @('C:\Program Files\MetaTrader 5\terminal64.exe', 'C:\Program Files (x86)\MetaTrader 5\terminal64.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
}

# Environment used for restarted child processes. The production bridge is attach-only
# and never needs broker credentials from this watchdog.
$env:MT5_BRIDGE_URL = $bridgeUrl
$env:CLOUD_APP_URL = $serverUrl
$env:MT5_ENABLE_PYTHON_CLI_FALLBACK = 'false'

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    try { Add-Content -Path $logPath -Value $line } catch {}
}

function PortListening($port) {
    try {
        $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        return ($c -ne $null -and $c.Count -gt 0)
    } catch { return $false }
}

function ServerResponds() {
    try {
        $h = Invoke-RestMethod -Uri "$serverUrl/api/health" -TimeoutSec 6
        return ([string]$h.status -eq 'ok' -and [string]$h.ai_state -ne '')
    } catch { return $false }
}

function BridgeHealthy() {
    try {
        $h = Invoke-RestMethod -Uri "$bridgeUrl/api/health" -TimeoutSec 6
        return ($h -ne $null -and [string]$h.status -ne '')
    } catch { return $false }
}

function RestartTerminal() {
    # IMPORTANT: do not auto-launch terminal64.exe. MT5 must be started by the user so the
    # bridge never races the terminal's own startup/login/reconnect lifecycle.
    if (-not $terminalExe) {
        Log 'MT5 terminal is not running and no terminal executable was detected. Start MT5 manually.'
        return
    }
    Log 'MT5 terminal is not running -> waiting for the user to start the terminal. No automatic launch is performed.'
}

function RestartBridge() {
    if (-not $pythonExe) { Log 'Python executable not found; cannot restart bridge.'; return }
    $pythonName = Split-Path $pythonExe -Leaf
    if ((Get-Process $pythonName -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $pythonExe }).Count -gt 0) {
        Log 'Bridge process already exists; skipping duplicate start.'
        return
    }
    Log 'Bridge DOWN/unhealthy (18812) -> restarting mt5_desktop_bridge.py'
    try {
        $env:PORT = '18812'
        Start-Process -FilePath $pythonExe -ArgumentList 'mt5_desktop_bridge.py' -WorkingDirectory $work `
            -RedirectStandardOutput (Join-Path $work 'bridge_live.log') `
            -RedirectStandardError (Join-Path $work 'bridge_live_err.log') -WindowStyle Hidden
        Log 'Bridge restart command issued.'
    } catch { Log "Bridge restart ERROR: $($_.Exception.Message)" }
}

function RestartServer() {
    if (-not $nodeExe -or -not (Test-Path $tsxCli)) { Log 'Node or local tsx executable not found; run npm ci before enabling the watchdog.'; return }
    if ((Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nodeExe }).Count -gt 0) {
        Log 'Node process already exists; skipping duplicate server start.'
        return
    }
    Log 'Server DOWN (3000) -> restarting via node + tsx'
    $env:PORT = '3000'
    $serverEntry = Join-Path $work 'server.ts'
    try {
        Start-Process -FilePath $nodeExe -ArgumentList $tsxCli, $serverEntry -WorkingDirectory $work `
            -RedirectStandardOutput (Join-Path $work 'server_live.log') `
            -RedirectStandardError (Join-Path $work 'server_live_err.log') -WindowStyle Hidden
        Log 'Server restart command issued (node + tsx).'
    } catch { Log "Server restart ERROR: $($_.Exception.Message)" }
}

Set-Content -Path (Join-Path $work 'watchdog.pid') -Value $PID
$initTerm = (Get-Process terminal64 -ErrorAction SilentlyContinue).Count -gt 0
Log "WATCHDOG STARTED (PID $PID | pwsh $($PSVersionTable.PSVersion)) terminal=$initTerm bridgePort=$((PortListening 18812)) serverPort=$((PortListening 3000))"

$lastAiRunning = $false
$pendingResume = $false
$resumeAttempts = 0
$lastResumeTime = 0
$serverStrikes = 0
$bridgeStrikes = 0
$lastServerRestartTime = 0
$lastBridgeRestartTime = 0

while ($true) {
    # --- Graceful kill switch ---
    if (Test-Path (Join-Path $work 'STOP_WATCHDOG.txt')) {
        Log 'STOP_WATCHDOG.txt found -> watchdog exiting'
        Remove-Item (Join-Path $work 'STOP_WATCHDOG.txt') -ErrorAction SilentlyContinue
        break
    }

    # --- 1. MT5 terminal ---
    $termUp = (Get-Process terminal64 -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $termUp) { RestartTerminal }

    # --- 2. Desktop bridge ---
    if (-not (PortListening 18812)) {
        $now = [int](Get-Date -UFormat %s)
        if ($now - $lastBridgeRestartTime -ge 60) {
            $bridgeStrikes = 0
            RestartBridge
            $lastBridgeRestartTime = $now
        }
    } elseif (-not (BridgeHealthy)) {
        $bridgeStrikes++
        Log "Bridge unhealthy (strike $bridgeStrikes/3)"
        if ($bridgeStrikes -ge 3) {
            $bridgeStrikes = 0
            $now = [int](Get-Date -UFormat %s)
            if ($now - $lastBridgeRestartTime -ge 60) {
                RestartBridge
                $lastBridgeRestartTime = $now
            }
        }
    } else {
        $bridgeStrikes = 0
    }

    # --- 3. Platform server ---
    $serverWasRunning = $lastAiRunning
    if (-not (PortListening 3000)) {
        $now = [int](Get-Date -UFormat %s)
        $serverStrikes = 0
        if ($serverWasRunning) { $pendingResume = $true }
        $lastAiRunning = $false
        if ($now - $lastServerRestartTime -ge 90) {
            RestartServer
            $lastServerRestartTime = $now
        }
    } elseif (-not (ServerResponds)) {
        $serverStrikes++
        Log "Server not responding (strike $serverStrikes/3)"
        if ($serverStrikes -ge 3) {
            $serverStrikes = 0
            if ($serverWasRunning) { $pendingResume = $true }
            $lastAiRunning = $false
            $now = [int](Get-Date -UFormat %s)
            if ($now - $lastServerRestartTime -ge 90) {
                RestartServer
                $lastServerRestartTime = $now
            }
        }
    } else {
        $serverStrikes = 0
    }

# --- 4. AI state supervision + auto-resume. We actively keep the AI alive rather than
# allowing it to remain STOPPED/LOCKED when the server is healthy. ---
    try {
        $s = Invoke-RestMethod -Uri "$serverUrl/api/state" -TimeoutSec 6
        $st = [string]$s.ai_state
        if ($st -eq 'RUNNING') {
            $script:lastAiRunning = $true
            $script:resumeAttempts = 0
            $script:pendingResume = $false
        } else {
            # Keep the process alive without overriding deliberate user pauses or risk locks.
            $shouldResume = $false
            if ($script:pendingResume -and $st -eq 'STOPPED' -and -not $s.safe_mode -and -not $s.risk_settings.trading_locked) { $shouldResume = $true }
            $nowSec = [int](Get-Date -UFormat %s)
            if ($shouldResume -and $script:resumeAttempts -lt 8 -and ($nowSec - $script:lastResumeTime -gt 30)) {
                Log "AI state=$st -> auto-resuming autonomous trading (attempt $($script:resumeAttempts + 1))"
                $ok = $false
                try {
                    $rr = Invoke-RestMethod -Uri "$serverUrl/api/ai/start" -Method Post -TimeoutSec 15
                    Log "AI resume result: $($rr.message)"
                    $ok = $rr.success
                } catch { Log "AI resume ERROR: $($_.Exception.Message)" }
                $script:resumeAttempts++
                $script:lastResumeTime = $nowSec
                if ($ok) {
                    $script:resumeAttempts = 0
                    $script:pendingResume = $false
                    $script:lastAiRunning = $true
                }
            } elseif ($script:resumeAttempts -ge 8) {
                if ($script:pendingResume) { Log 'AI resume: gave up after 8 attempts (manual intervention required).' }
                $script:resumeAttempts = 0
                $script:pendingResume = $false
            }
        }
    } catch {
        if ($script:lastAiRunning) { $script:pendingResume = $true }
        $script:lastAiRunning = $false
    }

    # --- 5. Autonomous DevOps Self-Healing Trigger ---
    $nowSec = [int](Get-Date -UFormat %s)
    if ($nowSec - $script:lastSelfHealTime -ge 60) {
        $script:lastSelfHealTime = $nowSec
        try {
            $healRes = Invoke-RestMethod -Uri "$serverUrl/api/self-healing/scan" -Method Post -TimeoutSec 10
            if ($healRes.actionsTaken -and $healRes.actionsTaken.Count -gt 0) {
                Log "Self-Healing actions executed: $($healRes.actionsTaken -join '; ')"
            }
        } catch {}
    }

    Start-Sleep -Seconds 10
}

Log 'WATCHDOG EXITED.'
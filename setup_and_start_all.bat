@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
TITLE AI-TRADER One-Click Desktop Launcher
COLOR 0A

echo =======================================================================
echo              AI-TRADER - One-Click Desktop Launcher
 echo              MT5 attach-only ^| Demo-first ^| Piya always-on
 echo              SUPERVISED AUTO-RESTART ENABLED
 echo =======================================================================
echo.
echo MT5 MUST already be open and logged in to the configured Demo account.
echo This launcher will not start MT5, switch accounts, or replay a password.
echo Bridge + Dashboard will be started automatically and supervised.
echo.

:: 1. Detect Python executable
set "PY_CMD="
where python >nul 2>&1
if not errorlevel 1 set "PY_CMD=python"
if not defined PY_CMD (
  where py >nul 2>&1
  if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
  echo [ERROR] Python was not found in PATH.
  echo Install Python and enable "Add Python to PATH", then run this file again.
  pause
  exit /b 1
)
echo [1/5] Python: %PY_CMD%
%PY_CMD% --version

:: 2. Install bridge dependencies only when missing
%PY_CMD% -c "import MetaTrader5, fastapi, uvicorn, requests, pydantic" >nul 2>&1
if errorlevel 1 (
  echo [2/5] Installing missing MT5 bridge packages...
  %PY_CMD% -m pip install MetaTrader5 fastapi uvicorn requests pydantic
  if errorlevel 1 (
    echo [ERROR] Python dependency installation failed.
    pause
    exit /b 1
  )
) else (
  echo [2/5] MT5 bridge dependencies already installed.
)

:: 3. Start supervised MT5 bridge
set "PORT=18812"
set "MT5_BRIDGE_URL=http://127.0.0.1:18812"
set "MT5_ENABLE_PYTHON_CLI_FALLBACK=false"
echo [3/5] Starting supervised MT5 Desktop Bridge on http://127.0.0.1:18812 ...
start "AI-TRADER MT5 Bridge (AUTO-RESTART)" "%ComSpec%" /k call "%~dp0bridge_supervised.bat"

set /a bridge_wait=0
:wait_for_bridge
%SystemRoot%\System32\curl.exe -s --max-time 2 http://127.0.0.1:18812/api/health | %SystemRoot%\System32\findstr.exe /C:"healthy" | %SystemRoot%\System32\findstr.exe /C:"true" >nul 2>&1
if not errorlevel 1 goto bridge_ready
set /a bridge_wait+=1
if !bridge_wait! GEQ 60 (
  echo [ERROR] MT5 Desktop Bridge did not become healthy within 60 seconds.
  echo Check the Bridge window for the exact Python/MT5 error.
  pause
  exit /b 1
)
timeout /t 1 >nul
goto wait_for_bridge

:bridge_ready
:: 4. Check Node/npm and install dependencies if needed
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is required. Install Node.js 22+ and run this file again.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is required. Install Node.js 22+ and run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [4/5] Installing Node dependencies from package-lock.json...
  npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo [WARN] npm ci failed. Attempting automatic package-lock repair...
    npm install --package-lock-only --ignore-scripts --no-audit --no-fund
    if errorlevel 1 (
      echo [ERROR] Automatic package-lock repair failed. Check internet access and npm output above.
      pause
      exit /b 1
    )
    echo [INFO] package-lock repaired. Re-running npm ci...
    npm ci --no-audit --no-fund
    if errorlevel 1 (
      echo [ERROR] npm ci still failed after package-lock repair.
      pause
      exit /b 1
    )
  )
) else (
  echo [4/5] Node dependencies already installed.
)

:: 5. Start supervised dashboard
set "DASHBOARD_URL=http://127.0.0.1:3000"
echo [5/5] Starting supervised AI-TRADER Dashboard on http://127.0.0.1:3000 ...
start "AI-TRADER Dashboard (AUTO-RESTART)" "%ComSpec%" /k call "%~dp0dashboard_supervised.bat"
set /a dashboard_wait=0
:wait_for_dashboard
%SystemRoot%\System32\curl.exe -s --max-time 2 http://127.0.0.1:3000/api/health >nul 2>&1
if not errorlevel 1 goto dashboard_ready
set /a dashboard_wait+=1
if !dashboard_wait! GEQ 90 (
  echo [ERROR] AI-TRADER Dashboard did not become healthy within 90 seconds.
  echo Check the Dashboard window for the exact npm/server error.
  pause
  exit /b 1
)
timeout /t 1 >nul
goto wait_for_dashboard

:dashboard_ready
start "" http://127.0.0.1:3000

echo.
echo =======================================================================
echo AI-TRADER is READY.
echo Dashboard + MT5 Bridge are supervised with automatic restart.
echo Keep both windows open while trading; CTRL+C stops that component supervisor.
echo =======================================================================
pause

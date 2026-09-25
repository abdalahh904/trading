@echo off
setlocal
cd /d "%~dp0"
TITLE AI-TRADER MT5 Bridge (Attach-Only)
COLOR 0B

echo ===============================================================
echo AI-TRADER MT5 Desktop Bridge - ATTACH ONLY
echo MT5 must already be open and logged into the configured Demo account.
echo The bridge will not launch MT5 or replay broker credentials.
echo ===============================================================
echo.

set "PY_CMD="
where python >nul 2>&1
if not errorlevel 1 set "PY_CMD=python"
if "%PY_CMD%"=="" (
  where py >nul 2>&1
  if not errorlevel 1 set "PY_CMD=py -3"
)
if "%PY_CMD%"=="" (
  echo [ERROR] Python was not found in PATH.
  pause
  exit /b 1
)

%PY_CMD% -c "import MetaTrader5, fastapi, uvicorn, requests, pydantic" >nul 2>&1
if errorlevel 1 (
  echo Installing missing MT5 bridge packages...
  %PY_CMD% -m pip install MetaTrader5 fastapi uvicorn requests pydantic
  if errorlevel 1 (
    echo [ERROR] Could not install Python bridge dependencies.
    pause
    exit /b 1
  )
)

set "PORT=18812"
set "MT5_BRIDGE_URL=http://127.0.0.1:18812"
set "MT5_ENABLE_PYTHON_CLI_FALLBACK=false"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo [INFO] Port %PORT% is already in use by PID %%P.
  echo [INFO] Existing MT5 bridge is left untouched; this launcher will not create a duplicate instance.
  pause
  exit /b 0
)

%PY_CMD% mt5_desktop_bridge.py
if errorlevel 1 (
  echo.
  echo [ERROR] MT5 bridge stopped with an error. Check the message above.
  pause
  exit /b 1
)
pause

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
TITLE AI-TRADER MT5 Bridge - AUTO RESTART
COLOR 0B
set "PY_CMD="
where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD (
  where py >nul 2>&1 && set "PY_CMD=py -3"
)
if not defined PY_CMD (
  echo [ERROR] Python not found. Bridge supervisor stopped.
  timeout /t 15 >nul
  exit /b 1
)

:LOOP
cls
echo ===============================================================
echo AI-TRADER MT5 Desktop Bridge - SUPERVISED
 echo MT5 must already be open and logged into the configured Demo account.
echo The bridge will NOT launch MT5 or switch broker accounts.
echo ===============================================================
echo [%date% %time%] Checking local bridge port 18812...
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":18812 .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo [%date% %time%] Port 18812 is already in use by PID %PORT_PID%.
  echo Existing bridge instance is left untouched; duplicate bridge start skipped.
  echo Rechecking in 5 seconds...
  timeout /t 5 >nul
  goto LOOP
)
echo [%date% %time%] Starting bridge process...
%PY_CMD% mt5_desktop_bridge.py
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] Bridge exited with code %EXIT_CODE%.
echo Restarting in 5 seconds... Press CTRL+C to stop supervision.
timeout /t 5 >nul
goto LOOP

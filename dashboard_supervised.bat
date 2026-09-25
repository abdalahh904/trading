@echo off
setlocal EnableExtensions
cd /d "%~dp0"
TITLE AI-TRADER Dashboard - AUTO RESTART
COLOR 0A

:LOOP
cls
echo ===============================================================
echo AI-TRADER Dashboard - SUPERVISED
 echo Web UI: http://127.0.0.1:3000
echo ===============================================================
echo [%date% %time%] Starting dashboard process...
npm run dev
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] Dashboard exited with code %EXIT_CODE%.
echo Restarting in 5 seconds... Press CTRL+C to stop supervision.
timeout /t 5 >nul
goto LOOP

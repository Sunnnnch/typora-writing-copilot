@echo off
setlocal
set "LOG=%~dp0install_windows.log"
echo [%date% %time%] Starting installer > "%LOG%"
echo Starting Typrism installer...
echo If Windows shows a UAC prompt, click Yes.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0install_windows.ps1" %* >> "%LOG%" 2>&1
echo.>> "%LOG%"
echo Installer log written to: "%LOG%"
type "%LOG%"
pause
endlocal

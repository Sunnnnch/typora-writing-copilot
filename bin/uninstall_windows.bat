@echo off
setlocal
set "LOG=%~dp0uninstall_windows.log"
echo [%date% %time%] Starting uninstaller > "%LOG%"
echo Starting Typora Writing Copilot uninstaller...
echo If Windows shows a UAC prompt, click Yes.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0uninstall_windows.ps1" %* >> "%LOG%" 2>&1
echo.>> "%LOG%"
echo Uninstaller log written to: "%LOG%"
type "%LOG%"
pause
endlocal

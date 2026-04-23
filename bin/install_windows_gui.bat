@echo off
setlocal
powershell -Sta -ExecutionPolicy Bypass -NoProfile -File "%~dp0install_windows_gui.ps1"
if errorlevel 1 pause
endlocal

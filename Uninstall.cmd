@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0卸载.ps1"
if errorlevel 1 exit /b 1
echo Shortcut restored. Quit Codex completely and open it again.
pause

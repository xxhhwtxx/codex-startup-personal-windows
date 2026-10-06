@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0安装.ps1"
if errorlevel 1 exit /b 1
echo Installed. Open Codex from the desktop shortcut.
pause

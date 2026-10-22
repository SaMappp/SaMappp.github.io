@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
"%~dp0WiFiPresence-Capture\.venv\Scripts\python.exe" "%~dp0WiFiPresence-Capture-Start.py" %*
set "CAPTURE_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %CAPTURE_EXIT%

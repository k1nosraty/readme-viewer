@echo off
setlocal
if not exist "%~dp0index.html" (
  echo README Viewer could not find index.html.
  echo Extract the complete ZIP first, then run this launcher again.
  pause
  exit /b 1
)
start "" "%~dp0index.html"

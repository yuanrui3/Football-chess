@echo off
setlocal
cd /d "%~dp0"
set "FOOTBALL_NODE_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%FOOTBALL_NODE_ROOT%\node.exe" set "PATH=%FOOTBALL_NODE_ROOT%;%PATH%"
set "FOOTBALL_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if "%~1"=="" (
  echo Usage: mobile.cmd run android:open ^| android:build ^| android:run ^| mobile:sync ^| test:mobile
  exit /b 0
)
if exist "%FOOTBALL_PNPM%" (
  call "%FOOTBALL_PNPM%" %*
) else (
  call pnpm %*
)
exit /b %ERRORLEVEL%

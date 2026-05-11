@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "OUT_FILE=%TEMP%\stock-crawler-%RANDOM%.json"

pushd "%REPO_ROOT%" >nul 2>&1

call "%SCRIPT_DIR%crawler.bat" %* > "%OUT_FILE%"
if errorlevel 1 (
  set "EXIT_CODE=!ERRORLEVEL!"
  popd >nul 2>&1
  del /q "%OUT_FILE%" >nul 2>&1
  exit /b !EXIT_CODE!
)

python "%SCRIPT_DIR%submit-article" --input-file "%OUT_FILE%"
set "EXIT_CODE=!ERRORLEVEL!"
del /q "%OUT_FILE%" >nul 2>&1
popd >nul 2>&1
exit /b !EXIT_CODE!

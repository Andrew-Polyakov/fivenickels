@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."

pushd "%REPO_ROOT%" >nul 2>&1
python "%SCRIPT_DIR%pipeline.py" %*
set "EXIT_CODE=!ERRORLEVEL!"
popd >nul 2>&1
exit /b !EXIT_CODE!

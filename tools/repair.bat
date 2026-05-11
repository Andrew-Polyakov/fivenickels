@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Rebuild the front-end widget bundle and seed HomePage body when empty.
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "FRONT_END=%REPO_ROOT%\front-end"
set "WIGTAIL=%REPO_ROOT%\wigtail"

echo Installing front-end dependencies...
pushd "%FRONT_END%" >nul 2>&1
call npm install
if errorlevel 1 exit /b 1
popd >nul 2>&1

echo Building front-end widget bundle...
pushd "%FRONT_END%" >nul 2>&1
call npm run build
if errorlevel 1 exit /b 1
popd >nul 2>&1

echo Seeding HomePage body when empty...
pushd "%WIGTAIL%" >nul 2>&1
python manage.py seed_homepage_body %*
set "EXIT_CODE=!ERRORLEVEL!"
popd >nul 2>&1
if !EXIT_CODE! neq 0 exit /b !EXIT_CODE!

echo Repair complete.
exit /b 0

@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%..\front-end"

echo Building Wagtail widget bundle with development settings...
pushd "%FRONTEND_DIR%" || exit /b 1

call npx ng build --configuration development --output-hashing=none
if errorlevel 1 (
    set "BUILD_EXIT=%ERRORLEVEL%"
    popd
    exit /b %BUILD_EXIT%
)

call npm run build:check-assets
set "BUILD_EXIT=%ERRORLEVEL%"

popd
exit /b %BUILD_EXIT%

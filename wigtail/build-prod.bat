@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%..\front-end"

echo Building Wagtail widget bundle with production widget settings...
pushd "%FRONTEND_DIR%" || exit /b 1

call npm run build:widget
set "BUILD_EXIT=%ERRORLEVEL%"

popd
exit /b %BUILD_EXIT%

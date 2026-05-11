@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "PROJECT=%SCRIPT_DIR%StockCrawler\StockCrawler.csproj"

pushd "%REPO_ROOT%"
dotnet run --project "%PROJECT%" -- %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

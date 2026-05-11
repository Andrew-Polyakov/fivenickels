@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "PROJECT=%SCRIPT_DIR%StockCrawler\StockCrawler.csproj"
set "ENV_FILE=%REPO_ROOT%\.env"

pushd "%REPO_ROOT%" >nul 2>&1

if exist "%ENV_FILE%" (
  for /f "usebackq delims=" %%L in ("%ENV_FILE%") do call :load_apca_from_line "%%L"
)

dotnet run --project "%PROJECT%" -- %*
set "EXIT_CODE=!ERRORLEVEL!"
popd >nul 2>&1
exit /b !EXIT_CODE!

:load_apca_from_line
set "line=%~1"
if not defined line exit /b 0
for /f "tokens=* delims= " %%A in ("!line!") do set "line=%%A"
if "!line!"=="" exit /b 0
if /i "!line:~0,1!"=="#" set "line=!line:~1!"
for /f "tokens=* delims= " %%A in ("!line!") do set "line=%%A"
if "!line!"=="" exit /b 0
for /f "tokens=1,* delims==" %%A in ("!line!") do (
  set "key=%%A"
  set "value=%%B"
)
if not defined value exit /b 0
for /f "tokens=* delims= " %%A in ("!key!") do set "key=%%A"
for /f "tokens=* delims= " %%A in ("!value!") do set "value=%%A"
if "!value!"=="" exit /b 0
if /i not "!key:~0,5!"=="APCA_" if /i not "!key:~0,7!"=="ALPACA_" exit /b 0
set "!key!=!value!"
exit /b 0

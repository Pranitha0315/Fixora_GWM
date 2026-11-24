@echo off
REM FIXORA - DELETE the old FixoraDb (made by the old EnsureSchemaAsync) so migrations can create it fresh.
REM Uses the same connection string as the app (appsettings.Development.json). ALL DATA IN FixoraDb IS DELETED.
cd /d "%~dp0"
set PATH=%PATH%;%USERPROFILE%\.dotnet\tools
echo This will PERMANENTLY delete the FixoraDb database (demo data only - the app seeds it again).
echo Stop the app in Visual Studio first.
choice /M "Delete FixoraDb now"
if errorlevel 2 exit /b 0

dotnet ef database drop --force -c SharedDbContext -p src/Shared/Fixora.Shared.Infrastructure -s src/Host/Fixora.Host
if errorlevel 1 (
  echo.
  echo ======== FAILED - tell Claude "reset error" ========
  pause
  exit /b 1
)
echo.
echo ======== FixoraDb deleted. Now press F5 in Visual Studio. ========
pause

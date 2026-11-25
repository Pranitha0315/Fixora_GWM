@echo off
REM FIXORA - booking audit fixes: add the ManagerNote columns (workshop.Appointments, workshop.JobCards).
REM Double-click after pulling. (F5 also applies it automatically on startup.) Output is also saved to migrations_log.txt
cd /d "%~dp0"
set LOG=%~dp0migrations_log.txt
echo FIXORA booking-audit migration %date% %time% > "%LOG%"
set PATH=%PATH%;%USERPROFILE%\.dotnet\tools
REM dotnet-ef must read appsettings.Development.json (no password is built into the code any more)
set ASPNETCORE_ENVIRONMENT=Development
set DOTNET_ENVIRONMENT=Development

echo === 1/3 Build ===
dotnet build src/Host/Fixora.Host/Fixora.Host.csproj >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo === 2/3 Migration BookingAuditFixes (ManagerDbContext) ===
REM Already in the repo (pulled from git)? Then only apply it - never create it twice.
if exist "src\Manager\Fixora.Manager.Infrastructure\Persistence\Migrations\Workshop\*_BookingAuditFixes.cs" (
  echo Migration already exists - skipping create. >> "%LOG%"
) else (
  dotnet ef migrations add BookingAuditFixes -c ManagerDbContext -p src/Manager/Fixora.Manager.Infrastructure -s src/Host/Fixora.Host -o Persistence/Migrations/Workshop >> "%LOG%" 2>&1 || goto :fail
)

echo === 3/3 Apply to your local database ===
dotnet ef database update -c ManagerDbContext -p src/Manager/Fixora.Manager.Infrastructure -s src/Host/Fixora.Host >> "%LOG%" 2>&1 || goto :fail

echo ALL DONE >> "%LOG%"
echo.
echo ======== ALL DONE - ManagerNote columns added ========
pause
exit /b 0

:fail
echo FAILED >> "%LOG%"
echo.
echo ======== FAILED - last lines of the log: ========
powershell -NoProfile -Command "Get-Content -Tail 25 '%LOG%'"
pause
exit /b 1

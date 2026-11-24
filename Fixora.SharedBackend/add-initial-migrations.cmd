@echo off
REM FIXORA - create the first EF Core migration for all 5 DbContexts.
REM Double-click this file. Output is also saved to migrations_log.txt
cd /d "%~dp0"
set LOG=%~dp0migrations_log.txt
echo FIXORA migrations run %date% %time% > "%LOG%"

echo === 1/3 dotnet-ef tool ===
dotnet tool update --global dotnet-ef --version 10.* >> "%LOG%" 2>&1
if errorlevel 1 dotnet tool install --global dotnet-ef --version 10.* >> "%LOG%" 2>&1
set PATH=%PATH%;%USERPROFILE%\.dotnet\tools

echo === 2/3 Build ===
dotnet build src/Host/Fixora.Host/Fixora.Host.csproj >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo === 3/3 Initial migrations (5 contexts) ===
echo --- SharedDbContext >> "%LOG%"
dotnet ef migrations add Initial -c SharedDbContext   -p src/Shared/Fixora.Shared.Infrastructure     -s src/Host/Fixora.Host -o Persistence/Migrations >> "%LOG%" 2>&1 || goto :fail
echo --- CustomerDbContext >> "%LOG%"
dotnet ef migrations add Initial -c CustomerDbContext -p src/Customer/Fixora.Customer.Infrastructure -s src/Host/Fixora.Host -o Persistence/Migrations >> "%LOG%" 2>&1 || goto :fail
echo --- MechanicDbContext >> "%LOG%"
dotnet ef migrations add Initial -c MechanicDbContext -p src/Mechanic/Fixora.Mechanic.Infrastructure -s src/Host/Fixora.Host -o Persistence/Migrations >> "%LOG%" 2>&1 || goto :fail
echo --- ManagerDbContext >> "%LOG%"
dotnet ef migrations add Initial -c ManagerDbContext  -p src/Manager/Fixora.Manager.Infrastructure   -s src/Host/Fixora.Host -o Persistence/Migrations/Workshop >> "%LOG%" 2>&1 || goto :fail
echo --- ControlDbContext >> "%LOG%"
dotnet ef migrations add Initial -c ControlDbContext  -p src/Manager/Fixora.Manager.Infrastructure   -s src/Host/Fixora.Host -o Persistence/Migrations/Control >> "%LOG%" 2>&1 || goto :fail

echo ALL DONE >> "%LOG%"
echo.
echo ======== ALL DONE - 5 migrations created ========
echo Tell Claude "mudinjiduchu".
pause
exit /b 0

:fail
echo FAILED >> "%LOG%"
echo.
echo ======== FAILED - last lines of the log: ========
powershell -NoProfile -Command "Get-Content -Tail 25 '%LOG%'"
echo Tell Claude "error vandhuchu".
pause
exit /b 1

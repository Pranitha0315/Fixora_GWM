@echo off
REM FIXORA - build + run all backend tests. Results are saved to test_results.txt
cd /d "%~dp0"
set LOG=%~dp0test_results.txt
echo FIXORA tests %date% %time% > "%LOG%"
dotnet test tests/Fixora.tests/Fixora.tests.csproj --logger "console;verbosity=normal" >> "%LOG%" 2>&1
if errorlevel 1 (echo TESTS FAILED >> "%LOG%") else (echo TESTS PASSED >> "%LOG%")
powershell -NoProfile -Command "Get-Content -Tail 15 '%LOG%'"

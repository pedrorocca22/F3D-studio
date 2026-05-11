@echo off
echo ========================================
echo Starting F3D Studio
echo ========================================

REM Start backend (server.py) in background
start "F3D Backend" cmd /k "cd /d ""%~dp0"" && python server.py"

REM Wait a moment for backend to start
timeout /t 2 /nobreak >nul

REM Start frontend (npm run dev)
start "F3D Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo F3D Studio is starting...
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:3000
echo.
echo Press any key to exit this window (services will keep running)
pause >nul

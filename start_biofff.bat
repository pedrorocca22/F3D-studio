@echo off
echo ========================================
echo Starting BioFFF Studio
echo ========================================

REM Start backend (server.py) in background
start "BioFFF Backend" cmd /k "cd /d D:\fff3-main && python server.py"

REM Wait a moment for backend to start
timeout /t 2 /nobreak >nul

REM Start frontend (npm run dev)
start "BioFFF Frontend" cmd /k "cd /d D:\fff3-main && npm run dev"

echo.
echo BioFFF Studio is starting...
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:3000
echo.
echo Press any key to exit this window (services will keep running)
pause >nul
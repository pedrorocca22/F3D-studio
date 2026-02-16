@echo off
title DLP3 Bioprinter
echo ============================================
echo   DLP3 Bioprinter - Starting Services
echo ============================================
echo.

:: Start Flask Backend (server.py) in background
echo [1/2] Starting Flask Backend (port 8000)...
start "DLP3-Backend" cmd /k "cd /d "%~dp0" && "%~dp0.venv\Scripts\python.exe" server.py"

:: Wait a moment for backend to initialize
timeout /t 2 /nobreak > nul

:: Start Vite Frontend
echo [2/2] Starting Vite Frontend (port 5173)...
start "DLP3-Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo ============================================
echo   Both services started!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo ============================================
echo.
echo Press any key to open the app in your browser...
pause > nul
start http://localhost:3000

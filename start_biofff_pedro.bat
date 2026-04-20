@echo off
title BioFFF Studio Launcher - PC PEDRO

SET PROJECT_DIR=C:\Users\PEDRO\Documents\FFF3
SET PYTHON_EXE=python

echo =============================================
echo  BioFFF Studio Launcher (PC PEDRO)
echo  Directorio: %PROJECT_DIR%
echo =============================================
echo.

REM Determinar Python
SET PY_CMD=python
IF EXIST "C:\Users\PEDRO\Documents\FFF3\.venv\Scripts\python.exe" SET PY_CMD="C:\Users\PEDRO\Documents\FFF3\.venv\Scripts\python.exe"

REM Liberar puerto 3000 si hay otro proceso ocupandolo (ej. FF4 u otro Vite)
echo [0/2] Liberando puerto 3000...
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING 2^>nul') DO (
    echo     Matando proceso PID %%P en puerto 3000...
    taskkill /PID %%P /F >nul 2>&1
)

echo [1/2] Iniciando Backend en puerto 8000...
start "BioFFF Backend" cmd /k "cd /d C:\Users\PEDRO\Documents\FFF3 && %PY_CMD% server.py || echo ERROR EN BACKEND && pause"

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend en puerto 3000...
start "BioFFF Frontend" cmd /k "cd /d C:\Users\PEDRO\Documents\FFF3 && npx vite --port 3000 || echo ERROR EN FRONTEND && pause"

timeout /t 5 /nobreak >nul

echo Abriendo navegador...
start http://localhost:3000

echo ===================================================
echo  BioFFF Studio Launcher running...
echo  Para detener el programa, cierra las dos ventanas.
echo ===================================================
pause

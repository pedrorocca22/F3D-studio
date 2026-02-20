@echo off
title DLP3 - Deploy to Raspberry Pi
echo ============================================
echo   DLP3 - Deploying rpi_node to RPi
echo   Target: pi@192.168.137.148
echo ============================================
echo.

:: --- Configuration ---
set RPI_USER=pi
set RPI_IP=192.168.137.148
set RPI_PATH=/home/pi/dlp_project/rpi_node/
set LOCAL_PATH=%~dp0rpi_node\

echo [1/2] Copying files via SCP...
echo       From: %LOCAL_PATH%
echo       To:   %RPI_USER%@%RPI_IP%:%RPI_PATH%
echo.
scp -r "%LOCAL_PATH%." %RPI_USER%@%RPI_IP%:%RPI_PATH%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] SCP failed. Check:
    echo   - Is the RPi on? ^(ping %RPI_IP%^)
    echo   - Is SSH enabled on the RPi?
    echo   - Are the credentials correct? ^(user: %RPI_USER%^)
    pause
    exit /b 1
)

echo.
echo [2/2] Restarting dlp3-rpi.service on the RPi...
ssh %RPI_USER%@%RPI_IP% "sudo systemctl restart dlp3-rpi.service && sleep 2 && sudo systemctl status dlp3-rpi.service --no-pager"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Could not restart service automatically.
    echo Run manually on the RPi:
    echo   sudo systemctl restart dlp3-rpi.service
) else (
    echo.
    echo ============================================
    echo   Deploy complete! RPi service restarted.
    echo   Backend RPi: http://%RPI_IP%:5000
    echo ============================================
)

echo.
pause

@echo off
echo ============================================================
echo  F3D Studio - Build Script
echo  Genera un instalador de Windows listo para distribuir
echo ============================================================
echo.

REM --- Paso 1: Compilar el Frontend React ---
echo [1/3] Compilando Frontend (npm run build)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo el build del frontend.
    pause & exit /b 1
)
echo       Frontend compilado OK.
echo.

REM --- Paso 2: Crear entorno Conda limpio y compilar con PyInstaller ---
echo [2/3] Creando entorno Conda limpio y empaquetando con PyInstaller...
echo       (Esto puede tardar varios minutos la primera vez)
echo.

REM Crear entorno minimo si no existe
call conda env list | findstr f3d_build >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Creando entorno Conda: f3d_build...
    call conda create -y -n f3d_build python=3.11 pip
)

REM Instalar dependencias minimas de F3D Studio
call conda run -n f3d_build pip install flask flask-cors werkzeug pillow numpy-stl trimesh scipy pyinstaller --quiet

REM Ejecutar PyInstaller en el entorno limpio
call conda run -n f3d_build pyinstaller f3d_studio.spec --distpath dist_pyinstaller --workpath build_pyinstaller --noconfirm
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo PyInstaller.
    pause & exit /b 1
)
echo       Ejecutable generado en: dist_pyinstaller\F3D_Studio\
echo.

REM --- Paso 3: Compilar el instalador con Inno Setup ---
echo [3/3] Generando instalador con Inno Setup...
set ISCC="C:\Program Files\Inno Setup 7\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files (x86)\Inno Setup 7\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"

if not exist %ISCC% (
    echo [AVISO] No se encontro ISCC.exe. Abre setup.iss manualmente con Inno Setup Compiler.
) else (
    call %ISCC% setup.iss
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Fallo Inno Setup.
        pause & exit /b 1
    )
    echo       Instalador generado en: Output\Instalar_F3D_Studio_v1.0-beta.exe
)

echo.
echo ============================================================
echo  BUILD COMPLETADO
echo ============================================================
pause

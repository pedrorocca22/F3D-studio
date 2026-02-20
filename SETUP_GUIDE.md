# 🚀 DLP3 - Multi-PC Setup & Workflow

<<<<<<< HEAD
Este documento sirve como guía para sincronizar el desarrollo en diferentes computadoras usando GitHub, y para mantener la Raspberry Pi actualizada con el último código.

## 🗺️ Arquitectura del Sistema

```
PC-A  ──┐
         ├──push/pull──▶ GitHub ◀──push/pull──  PC-B
PC-B  ──┘                  │
                           │
                    deploy_to_rpi.bat
                           │
                           ▼
                    Raspberry Pi (192.168.137.164)
                    Corre: rpi_node/server.py (puerto 5000)
```

> ⚠️ **IMPORTANTE**: La RPi **no sincroniza automáticamente con GitHub**. Debes desplegarle el código manualmente usando el script `deploy_to_rpi.bat` cada vez que cambies algo en `rpi_node/`.

---

## 📋 Requisitos Únicos (Setup por PC nueva)

Estas carpetas **NO** se sincronizan por GitHub (están en `.gitignore`). Debes crearlas en cada PC nueva:

1.  **Motor de Slicing**:
    - Asegúrate de tener la carpeta `PrusaSlicer-2.9.3/` en la raíz del proyecto.
    - *Si no está, cópiala manualmente desde un disco externo o descárgala.*

2.  **Entorno de Python (.venv)**:
    ```powershell
    python -m venv .venv
    .\.venv\Scripts\activate
    pip install -r requirements.txt
    ```

3.  **Dependencias de Node (Frontend)**:
    ```powershell
    cmd /c "npm install"
    ```
=======
Este documento sirve como guía para sincronizar el desarrollo en diferentes computadoras usando GitHub, evitando conflictos de entornos y archivos pesados.

## 📋 Requisitos Únicos (Setup por PC)

Estas carpetas **NO** se sincronizan por GitHub (están en `.gitignore`) para mantener el repositorio ligero. Debes asegurarte de que existan en cada computadora:

1.  **Motor de Slicing**:
    - Asegúrate de tener la carpeta `PrusaSlicer-2.9.3/` en la raíz del proyecto. 
    - *Nota: Si no está, cópiala manualmente desde un disco externo o descarga la versión correspondiente.*

2.  **Entorno de Python (.venv)**:
    - Si es la primera vez en esta PC, crea el entorno:
      ```powershell
      python -m venv .venv
      .\.venv\Scripts\activate
      pip install -r requirements.txt
      ```

3.  **Dependencias de Node (Frontend)**:
    - Ejecuta `npm install` para recrear la carpeta `node_modules`.
>>>>>>> df90de924fb8466a8c72de1a66fd686fb38fd1ec

---

## 🔄 Flujo de Trabajo Diario (Pull/Work/Push)

<<<<<<< HEAD
### 1. Al llegar a la PC (Sincronizar)
=======
Sigue estrictamente este orden para evitar errores:

### 1. Al llegar a la PC (Sincronizar)
Antes de nada, trae los cambios de la otra PC:
>>>>>>> df90de924fb8466a8c72de1a66fd686fb38fd1ec
```powershell
git pull origin main
```

### 2. Durante el desarrollo
<<<<<<< HEAD
Si instalas una nueva librería de Python, actualiza el archivo de requisitos:
=======
Trabaja normalmente. Si instalas una nueva librería de Python, actualiza la lista de requisitos:
>>>>>>> df90de924fb8466a8c72de1a66fd686fb38fd1ec
```powershell
pip freeze > requirements.txt
```

<<<<<<< HEAD
### 3. Si modificaste algo en `rpi_node/` → Desplegar a la RPi
```powershell
.\deploy_to_rpi.bat
```
*(Copia automáticamente los archivos a la RPi y reinicia el servicio)*

### 4. Al terminar (Subir cambios a GitHub)
=======
### 3. Al terminar (Subir cambios)
Guarda y sube tu progreso:
>>>>>>> df90de924fb8466a8c72de1a66fd686fb38fd1ec
```powershell
git add .
git commit -m "Descripción de los cambios"
git push origin main
```

---

<<<<<<< HEAD
## 🍓 Gestión de la Raspberry Pi

### Desplegar código nuevo a la RPi
```powershell
.\deploy_to_rpi.bat
```

### Conectarse por SSH a la RPi
```powershell
ssh pi@192.168.137.164
```

### Comandos útiles dentro de la RPi
```bash
# Ver estado del servicio
sudo systemctl status dlp3-rpi.service --no-pager

# Reiniciar el servicio
sudo systemctl restart dlp3-rpi.service

# Ver logs en tiempo real
sudo journalctl -u dlp3-rpi.service -f

# Instalar dependencias manualmente (si hace falta)
/home/pi/dlp_project/rpi_node/venv/bin/pip install -r /home/pi/dlp_project/rpi_node/requirements.txt
```

---

## 🤖 Instrucciones para Antigravity (IA)
*Cuando el usuario trabaja en una PC nueva o después de un `git pull`:*
1.  Verifica si `.venv` existe; si no, créalo e instala `requirements.txt`.
2.  Verifica si `node_modules` existe; si no, ejecuta `cmd /c "npm install"`.
3.  Verifica rutas en `start.bat` — deben ser relativas (`%~dp0`).
4.  Si el usuario reporta errores de conexión con la RPi (puerto 5000), verificar:
    a. Que la RPi esté encendida (`ping 192.168.137.164`)
    b. Que el servicio esté corriendo (`ssh pi@192.168.137.164` → `systemctl status dlp3-rpi.service`)
    c. Que el código de la RPi esté actualizado (ejecutar `deploy_to_rpi.bat`)

=======
## 🤖 Instrucciones para Antigravity (IA)
*Cuando estoy trabajando en una PC nueva o después de un pull:*
1.  Verifica si la carpeta `.venv` existe y tiene las librerías de `requirements.txt`.
2.  Verifica si `node_modules` existe o necesita un `npm install`.
3.  Asegúrate de que las rutas en `start.bat` y scripts de Python sigan siendo relativas al directorio raíz (`%~dp0` o `./`).
>>>>>>> df90de924fb8466a8c72de1a66fd686fb38fd1ec

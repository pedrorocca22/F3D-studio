# 🚀 DLP3 - Multi-PC Setup & Workflow

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
                    Raspberry Pi (192.168.137.148)
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

---

## 🔄 Flujo de Trabajo Diario (Pull/Work/Push)

### 1. Al llegar a la PC (Sincronizar)
```powershell
git pull origin main
```

### 2. Durante el desarrollo
Si instalas una nueva librería de Python, actualiza el archivo de requisitos:
```powershell
pip freeze > requirements.txt
```

### 3. Si modificaste algo en `rpi_node/` → Desplegar a la RPi
```powershell
.\deploy_to_rpi.bat
```
*(Copia automáticamente los archivos a la RPi y reinicia el servicio)*

### 4. Al terminar (Subir cambios a GitHub)
```powershell
git add .
git commit -m "Descripción de los cambios"
git push origin main
```

---

## 🍓 Gestión de la Raspberry Pi

### Desplegar código nuevo a la RPi
```powershell
.\deploy_to_rpi.bat
```

### Conectarse por SSH a la RPi
```powershell
ssh pi@192.168.137.148
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
    a. Que la RPi esté encendida (`ping 192.168.137.148`)
    b. Que el servicio esté corriendo (`ssh pi@192.168.137.148` → `systemctl status dlp3-rpi.service`)
    c. Que el código de la RPi esté actualizado (ejecutar `deploy_to_rpi.bat`)


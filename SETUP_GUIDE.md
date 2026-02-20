# 🚀 DLP3 - Multi-PC Setup & Workflow

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

---

## 🔄 Flujo de Trabajo Diario (Pull/Work/Push)

Sigue estrictamente este orden para evitar errores:

### 1. Al llegar a la PC (Sincronizar)
Antes de nada, trae los cambios de la otra PC:
```powershell
git pull origin main
```

### 2. Durante el desarrollo
Trabaja normalmente. Si instalas una nueva librería de Python, actualiza la lista de requisitos:
```powershell
pip freeze > requirements.txt
```

### 3. Al terminar (Subir cambios)
Guarda y sube tu progreso:
```powershell
git add .
git commit -m "Descripción de los cambios"
git push origin main
```

---

## 🤖 Instrucciones para Antigravity (IA)
*Cuando estoy trabajando en una PC nueva o después de un pull:*
1.  Verifica si la carpeta `.venv` existe y tiene las librerías de `requirements.txt`.
2.  Verifica si `node_modules` existe o necesita un `npm install`.
3.  Asegúrate de que las rutas en `start.bat` y scripts de Python sigan siendo relativas al directorio raíz (`%~dp0` o `./`).

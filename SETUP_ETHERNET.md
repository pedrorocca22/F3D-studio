# Configuración Ethernet Directa — PC ↔ Raspberry Pi 5

Guía paso a paso para conectar tu PC con Windows directamente a la Raspberry Pi 5 
usando un cable Ethernet (sin router, sin WiFi).

```
┌─────────────┐  Cable Ethernet  ┌──────────────────────────┐
│  PC Windows │ ◄──────────────► │     Raspberry Pi 5       │
│ 192.168.10.1│                  │     192.168.10.2         │
│             │                  │                          │
│ server.py   │                  │  USB1: Placa impresora   │
│ frontend    │                  │  SPI:  Proyector DLP     │
└─────────────┘                  └──────────────────────────┘
```

---

## Requisitos

- Cable Ethernet (Cat5e o superior, cualquier cable normal sirve)
- Raspberry Pi 5 con Raspberry Pi OS instalado
- PC con Windows 10/11 y puerto Ethernet (o adaptador USB-Ethernet)

---

## Paso 1: Conectar el cable

Conecta un cable Ethernet directamente entre tu PC y la Raspberry Pi 5.

> **Nota:** No necesitas un cable "crossover". Los puertos Ethernet modernos (Gigabit) 
> detectan y adaptan automáticamente (Auto-MDI/MDI-X).

---

## Paso 2: Configurar IP estática en Windows

1. Abre **Panel de Control** → **Centro de redes y recursos compartidos**
   (o busca "Configuración de red" en el menú Inicio)

2. Click en **Cambiar configuración del adaptador** (menú izquierdo)

3. Busca el adaptador **Ethernet** (puede decir "Red no identificada" o "Cable desconectado")

4. Click derecho → **Propiedades**

5. Selecciona **Protocolo de Internet versión 4 (TCP/IPv4)** → Click **Propiedades**

6. Selecciona **Usar la siguiente dirección IP** y pon:

   | Campo | Valor |
   |-------|-------|
   | Dirección IP | `192.168.10.1` |
   | Máscara de subred | `255.255.255.0` |
   | Puerta de enlace predeterminada | *(dejar vacío)* |

7. Click **Aceptar** → **Aceptar**

> **Alternativa rápida (PowerShell como Administrador):**
> ```powershell
> # Buscar el nombre del adaptador Ethernet
> Get-NetAdapter
>
> # Configurar IP (reemplaza "Ethernet" con el nombre de tu adaptador)
> New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.10.1 -PrefixLength 24
> ```

---

## Paso 3: Configurar IP estática en la Raspberry Pi (Bullseye)

Conecta por SSH usando WiFi primero (o conecta teclado/monitor):

```bash
ssh pi@<ip_wifi_actual>
```

Edita el archivo de configuración de red:

```bash
sudo nano /etc/dhcpcd.conf
```

Añade al final del archivo:
```
interface eth0
static ip_address=192.168.10.2/24
nogateway
```

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X` y reinicia el servicio:

```bash
sudo systemctl restart dhcpcd
```

---

## Paso 4: Verificar la conexión

### Desde Windows (CMD o PowerShell):
```powershell
ping 192.168.10.2
```

### Desde la Raspberry Pi:
```bash
ping 192.168.10.1
```

Deberías ver respuestas como:
```
Reply from 192.168.10.2: bytes=32 time<1ms TTL=64
```

---

## Paso 5: Actualizar config.ini

En tu PC, edita `f:\dlp3-main\config.ini`:

```ini
[Hardware]
rpi_ip = 192.168.10.2
printer_technology = SLA
```

---

## Paso 6: Configurar el servidor en la RPi

### Si ya ejecutaste `setup.sh` previamente:
```bash
# Los archivos ya están en /home/pi/dlp_project/rpi_node/
# El servicio systemd ya está configurado
# Solo reinicia para aplicar la nueva IP:
sudo systemctl restart dlp3-rpi
```

### Si es una RPi nueva:
```bash
# 1. Copiar archivos (desde Windows con WinSCP o SCP):
#    Copiar contenido de rpi_node/ → /home/pi/dlp_project/rpi_node/

# 2. En la RPi:
chmod +x /home/pi/dlp_project/rpi_node/setup.sh
/home/pi/dlp_project/rpi_node/setup.sh
```

---

## Paso 7: Verificar todo el sistema

1. **Backend** (en tu PC):
   ```powershell
   # Doble click en start.bat, o manualmente:
   cd F:\dlp3-main
   python server.py
   ```

2. **Verificar conexión con RPi:**
   Abre el navegador → `http://localhost:8000` 
   O haz una petición al status del RPi:
   ```powershell
   curl http://192.168.10.2:5000/status
   ```

3. **Frontend:**
   Abre `http://localhost:3000`

---

## Solución de problemas

### "ping no responde"
- Verifica que el cable Ethernet está conectado en ambos extremos
- Verifica las IPs configuradas:
  - Windows: `ipconfig` → busca el adaptador Ethernet
  - RPi: `ip addr show eth0`
- Desactiva temporalmente el Firewall de Windows para probar

### "No se puede conectar al servidor RPi"
- Verifica que el servicio está corriendo:
  ```bash
  sudo systemctl status dlp3-rpi
  ```
- Revisa los logs:
  ```bash
  journalctl -u dlp3-rpi -f
  ```
- Verifica que escucha en el puerto correcto:
  ```bash
  ss -tlnp | grep 5000
  ```

### "Conexión muy lenta"
- Verifica velocidad del enlace:
  ```bash
  ethtool eth0 | grep Speed
  ```
  Debería decir `1000Mb/s` (Gigabit). Si dice `100Mb/s`, prueba otro cable.

### Windows no reconoce el adaptador Ethernet
- **Drivers**: Asegúrate de tener los drivers del adaptador Ethernet instalados
- **Cable**: Prueba con otro cable Ethernet
- **Adaptador USB**: Si usas adaptador USB-Ethernet, verifica que está reconocido en Administrador de Dispositivos

---

## Acceso SSH por Ethernet

Una vez configurada la conexión, puedes acceder por SSH:

```powershell
ssh pi@192.168.10.2
```

---

## Mantener WiFi + Ethernet simultáneamente

La RPi 5 puede usar WiFi y Ethernet a la vez. Esto es útil si quieres:
- **Ethernet** → Comunicación directa con tu PC (impresión)
- **WiFi** → Acceso a Internet (actualizaciones, etc.)

No necesitas configuración adicional. El sistema operativo enruta automáticamente 
el tráfico por la interfaz correcta basándose en las IPs de destino.

---

## Resumen de IPs

| Dispositivo | Interfaz | IP |
|---|---|---|
| PC Windows | Ethernet | `192.168.10.1` |
| Raspberry Pi 5 | eth0 | `192.168.10.2` |
| config.ini | rpi_ip | `192.168.10.2` |

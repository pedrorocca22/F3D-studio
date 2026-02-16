"""Deploy updated projector files to RPi Zero 2W and restart service."""
import paramiko
import os

RPI_IP = "192.168.137.164"
RPI_USER = "pi"
RPI_PASS = "pi"
REMOTE_BASE = "/home/pi/dlp_project"

LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

FILES_TO_UPLOAD = [
    ("rpi_node/server.py", f"{REMOTE_BASE}/rpi_node/server.py"),
    ("rpi_node/projector_driver.py", f"{REMOTE_BASE}/rpi_node/projector_driver.py"),
    ("rpi_node/focus_pattern.py", f"{REMOTE_BASE}/rpi_node/focus_pattern.py"),
    ("rpi_node/off.py", f"{REMOTE_BASE}/rpi_node/off.py"),
    ("Controller/src/UV_projector/controller.py", f"{REMOTE_BASE}/Controller/src/UV_projector/controller.py"),
    ("rpi_node/calibracion.png", f"{REMOTE_BASE}/rpi_node/calibracion.png"),
]

def main():
    print(f"Connecting to RPi Zero 2W at {RPI_IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(RPI_IP, username=RPI_USER, password=RPI_PASS, timeout=10)
    print("Connected!")

    sftp = ssh.open_sftp()

    for local_rel, remote_path in FILES_TO_UPLOAD:
        local_path = os.path.join(LOCAL_BASE, local_rel)
        print(f"\n  Uploading: {local_rel}")
        print(f"    Local:  {local_path}")
        print(f"    Remote: {remote_path}")
        
        # Ensure remote directory exists
        remote_dir = os.path.dirname(remote_path)
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            stdin, stdout, stderr = ssh.exec_command(f"mkdir -p {remote_dir}")
            stdout.channel.recv_exit_status()
        
        sftp.put(local_path, remote_path)
        print(f"    OK!")

    sftp.close()

    print("\nRestarting dlp3-rpi service...")
    stdin, stdout, stderr = ssh.exec_command("sudo systemctl restart dlp3-rpi.service")
    exit_code = stdout.channel.recv_exit_status()
    print(f"  Restart exit code: {exit_code}")

    import time
    time.sleep(3)

    print("\nChecking service status...")
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active dlp3-rpi.service")
    status = stdout.read().decode().strip()
    print(f"  Service status: {status}")

    print("\nLast 15 log lines:")
    stdin, stdout, stderr = ssh.exec_command("journalctl -u dlp3-rpi.service -n 15 --no-pager")
    print(stdout.read().decode())

    ssh.close()
    print("Done!")

if __name__ == "__main__":
    main()

import paramiko

RPI_IP = "192.168.137.164"
RPI_USER = "pi"
RPI_PASS = "pi"

def main():
    print(f"Connecting to {RPI_IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(RPI_IP, username=RPI_USER, password=RPI_PASS, timeout=10)
    
    print("\nFetching logs from current boot...")
    stdin, stdout, stderr = ssh.exec_command("journalctl -u dlp3-rpi.service -b --no-pager")
    print(stdout.read().decode())
    
    ssh.close()

if __name__ == "__main__":
    main()

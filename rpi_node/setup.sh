#!/bin/bash
# ============================================
# DLP3 RPi Node - Setup & Install Service
# Run this ONCE on the Raspberry Pi
# ============================================

set -e

echo "=== DLP3 RPi Node Setup ==="

# 1. Install system dependencies
echo "[1/4] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip python3-dev

# 2. Create virtual environment (if not exists)
echo "[2/4] Setting up Python virtual environment..."
cd /home/pi/dlp_project/rpi_node
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 3. Install systemd service
echo "[3/4] Installing systemd service..."
sudo cp dlp3-rpi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dlp3-rpi.service

# 4. Start the service
echo "[4/4] Starting service..."
sudo systemctl start dlp3-rpi.service

echo ""
echo "=== Setup Complete! ==="
echo "Service status:"
sudo systemctl status dlp3-rpi.service --no-pager
echo ""
echo "Useful commands:"
echo "  sudo systemctl status dlp3-rpi   - Check status"
echo "  sudo systemctl restart dlp3-rpi  - Restart"
echo "  sudo systemctl stop dlp3-rpi     - Stop"
echo "  journalctl -u dlp3-rpi -f        - View logs"

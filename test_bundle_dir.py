import sys
from pathlib import Path

if getattr(sys, 'frozen', False):
    print(f"FROZEN: sys._MEIPASS = {getattr(sys, '_MEIPASS', 'N/A')}")
    print(f"FROZEN: sys.executable = {sys.executable}")
    print(f"FROZEN: Path(__file__).parent = {Path(__file__).resolve().parent}")
else:
    print("NOT FROZEN (dev mode)")

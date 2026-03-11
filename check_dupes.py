import sys
import traceback

def check_file(filepath):
    seen = set()
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key = line.split('=')[0].strip()
                    if key in seen:
                        print(f"Duplicate key found at line {i}: '{key}'")
                    seen.add(key)
    except Exception as e:
        traceback.print_exc()

print(f"Checking {sys.argv[1]}...")
check_file(sys.argv[1])

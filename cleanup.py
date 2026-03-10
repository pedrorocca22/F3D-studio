import sys

with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False

for i, line in enumerate(lines):
    # Remove old imports
    if line.startswith('from print_manager import PrintManager'): continue
    if line.startswith('from pattern_engine import PatternEngine'): continue
    if line.startswith("print_manager = PrintManager(DEFAULT_CONFIG_INI)"): continue
    
    # Remove STL SLA transform block (aprox line 164)
    if line.startswith("# ----------------------------") and i < len(lines)-1 and 'STL transform helpers' in lines[i+1]:
        skip = True
    
    # Stop skipping when we hit the Experiments API
    if skip and line.startswith("# Experiments API (History)"):
        skip = False

    # Skip SLA Slicer and Print Routes
    if not skip and line.startswith("# ----------------------------") and i < len(lines)-1 and 'PrusaSlicer CLI' in lines[i+1]:
        skip = True
        
    # Stop skipping when we hit the WiFi AP Config
    if skip and line.startswith("# WiFi AP Configuration Routes"):
        skip = False
        # Add a newline before it
        new_lines.append("\n")
        
    # We also need to remove print_manager traces in Moonraker status or calibrate info
    if not skip:
        # Avoid the single-line comment for DLP print manager
        if line.strip() == "# Initialize DLP3 legacy Print Manager (SLA projector path)":
            continue
        new_lines.append(line)

with open('server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Cleanup script executed successfully.")

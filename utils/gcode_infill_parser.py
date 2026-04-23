import re
import math
from pathlib import Path
from collections import defaultdict

def parse_infill_lines(gcode_path: Path, layer_height_mm: float, max_z: float = None) -> dict:
    layer_data = {}
    current_layer = 0
    current_z = 0.0
    in_infill = False
    
    current_x = None
    current_y = None
    
    # FIX: Expresiones regulares más robustas para evitar fallos por espacios o mayúsculas
    layer_change_re = re.compile(r';\s*LAYER_CHANGE', re.IGNORECASE)
    z_match_re = re.compile(r';\s*Z:([0-9.]+)', re.IGNORECASE)
    type_infill_re = re.compile(r';\s*TYPE:\s*Internal infill', re.IGNORECASE)
    type_other_re = re.compile(r';\s*TYPE:', re.IGNORECASE)
    
    def extract_val(line, axis):
        match = re.search(f'{axis}([0-9.-]+)', line)
        if match:
            return float(match.group(1))
        return None

    total_infill_lines = 0

    try:
        with open(gcode_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                if layer_change_re.search(line):
                    current_layer += 1
                    in_infill = False
                    if current_layer not in layer_data:
                        layer_data[current_layer] = {"z": current_z, "infill_segments": []}
                    continue
                
                z_match = z_match_re.search(line)
                if z_match:
                    current_z = float(z_match.group(1))
                    if current_layer in layer_data:
                        layer_data[current_layer]["z"] = current_z
                    if max_z is not None and current_z > max_z + 1.0:
                        break
                    continue

                if type_infill_re.search(line):
                    in_infill = True
                    continue
                elif type_other_re.search(line):
                    in_infill = False
                    continue

                if line.startswith('G0') or line.startswith('G1'):
                    x = extract_val(line, 'X')
                    y = extract_val(line, 'Y')
                    e = extract_val(line, 'E')
                    
                    next_x = x if x is not None else current_x
                    next_y = y if y is not None else current_y

                    if in_infill and line.startswith('G1') and e is not None and e > 0:
                        if current_x is not None and current_y is not None and next_x is not None and next_y is not None:
                            layer_data[current_layer]["infill_segments"].append((current_x, current_y, next_x, next_y))
                            total_infill_lines += 1
                    
                    current_x = next_x
                    current_y = next_y

        print(f"[DEBUG PARSER] Parseo completado. Capas detectadas: {len(layer_data)}. Total segmentos de infill: {total_infill_lines}")
    except Exception as e:
        print(f"Error parsing infill lines: {e}")
        
    return layer_data

def detect_perfect_squares(segments: list, tolerance_mm: float = 0.1, min_size_mm: float = 0.5) -> list:
    if not segments:
        return []

    angle_groups = defaultdict(list)
    for x0, y0, x1, y1 in segments:
        dist = math.hypot(x1 - x0, y1 - y0)
        if dist < 0.1: continue

        angle = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        if angle > 179.5: angle = 0.0
        bin_angle = int(round(angle)) % 180
        angle_groups[bin_angle].append((x0, y0, x1, y1))
        
    sorted_angles = sorted(angle_groups.keys(), key=lambda k: len(angle_groups[k]), reverse=True)
    
    merged_angles = []
    for a in sorted_angles:
        found = False
        for i, ma in enumerate(merged_angles):
            # FIX: Tolerancia angular aumentada a 3 grados para detectar líneas ligeramente desviadas
            if abs(a - ma) <= 3 or abs(a - ma) >= 177: 
                angle_groups[ma].extend(angle_groups[a])
                found = True
                break
        if not found:
            merged_angles.append(a)
            
    print(f"   [DEBUG PARSER] Ángulos detectados en cuadrícula: {merged_angles[:3]}")

    if len(merged_angles) < 2:
        return [] 
        
    angle1 = merged_angles[0]
    angle2 = merged_angles[1]
    
    # Verificar si son perpendiculares (aprox 90 grados de diferencia)
    diff = abs(angle1 - angle2)
    if not (85 <= diff <= 95):
        print(f"   [DEBUG PARSER] El infill no es Grid ortogonal. Ángulos detectados: {angle1} y {angle2}")
        return []

    lines1 = angle_groups[angle1]
    lines2 = angle_groups[angle2]
    
    def line_intersection(line1, line2):
        x1, y1, x2, y2 = line1
        x3, y3, x4, y4 = line2
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) < 1e-6: return None
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
        if -0.05 <= t <= 1.05 and -0.05 <= u <= 1.05:
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        return None

    intersections = []
    for l1 in lines1:
        for l2 in lines2:
            pt = line_intersection(l1, l2)
            if pt: intersections.append(pt)
            
    if not intersections:
        return []
        
    alpha = math.radians(angle1)
    cos_a = math.cos(-alpha)
    sin_a = math.sin(-alpha)
    
    rotated_pts = []
    for x, y in intersections:
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        rotated_pts.append((rx, ry, x, y))
        
    def snap(val): 
        return round(val / tolerance_mm) * tolerance_mm
    
    unique_rotated = {}
    for rx, ry, ox, oy in rotated_pts:
        sx, sy = snap(rx), snap(ry)
        unique_rotated[(sx, sy)] = (ox, oy)
        
    points = sorted(list(unique_rotated.keys()))
    xs = sorted(list(set(x for x, y in points)))
    ys = sorted(list(set(y for x, y in points)))
    
    squares = []
    
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            rx0 = xs[i]
            rx1 = xs[i+1]
            ry0 = ys[j]
            ry1 = ys[j+1]
            
            w = rx1 - rx0
            h = ry1 - ry0
            
            if w < min_size_mm or h < min_size_mm:
                continue
            
            # FIX: Tolerancia de cuadratura más permisiva
            if abs(w - h) > tolerance_mm * 4: 
                continue 
                
            p1 = (rx0, ry0)
            p2 = (rx1, ry0)
            p3 = (rx0, ry1)
            p4 = (rx1, ry1)
            
            # Búsqueda suave de vértices para evitar errores de coma flotante
            def has_point(target_p):
                for p in unique_rotated.keys():
                    if abs(p[0]-target_p[0]) <= tolerance_mm and abs(p[1]-target_p[1]) <= tolerance_mm:
                        return p
                return None
            
            rp1 = has_point(p1)
            rp2 = has_point(p2)
            rp3 = has_point(p3)
            rp4 = has_point(p4)

            if rp1 and rp2 and rp3 and rp4:
                ox1, oy1 = unique_rotated[rp1]
                ox2, oy2 = unique_rotated[rp2]
                ox3, oy3 = unique_rotated[rp3]
                ox4, oy4 = unique_rotated[rp4]
                
                cx = (ox1 + ox2 + ox3 + ox4) / 4.0
                cy = (oy1 + oy2 + oy3 + oy4) / 4.0
                
                squares.append((cx - w/2, cy - w/2, cx + w/2, cy + w/2))
                
    print(f"   [DEBUG PARSER] Cuadrados (poros) resultantes validados: {len(squares)}")
    return squares

def compute_centroids(squares: list) -> list:
    return [((x_min + x_max) / 2, (y_min + y_max) / 2) for x_min, y_min, x_max, y_max in squares]
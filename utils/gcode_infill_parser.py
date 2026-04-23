import re
import math
from pathlib import Path
from collections import defaultdict

def parse_infill_lines(gcode_path: Path, layer_height_mm: float, max_z: float = None) -> dict:
    """
    Parses a G-code file to extract internal infill segments per layer.

    Returns a dict:
    {
      layer_index: {
        "z": float,
        "infill_segments": [(x0, y0, x1, y1), ...]
      }
    }
    """
    layer_data = {}
    current_layer = 0
    current_z = 0.0
    in_infill = False
    
    # Track position
    current_x = None
    current_y = None
    
    # Regexes
    layer_change_re = re.compile(r';LAYER_CHANGE')
    z_match_re = re.compile(r';Z:([0-9.]+)')
    type_infill_re = re.compile(r';TYPE:Internal infill')
    type_other_re = re.compile(r';TYPE:')
    g1_re = re.compile(r'^G1\s')
    
    def extract_val(line, axis):
        match = re.search(f'{axis}([0-9.-]+)', line)
        if match:
            return float(match.group(1))
        return None

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
                    # Early exit if we passed max_z
                    if max_z is not None and current_z > max_z + 1.0:
                        break
                    continue

                if type_infill_re.search(line):
                    in_infill = True
                    continue
                elif type_other_re.search(line):
                    in_infill = False
                    continue

                # Parse X, Y movements
                if line.startswith('G0') or line.startswith('G1'):
                    x = extract_val(line, 'X')
                    y = extract_val(line, 'Y')
                    e = extract_val(line, 'E')
                    
                    next_x = x if x is not None else current_x
                    next_y = y if y is not None else current_y

                    if in_infill and line.startswith('G1') and e is not None and e > 0:
                        # Extruding move in infill
                        if current_x is not None and current_y is not None and next_x is not None and next_y is not None:
                            layer_data[current_layer]["infill_segments"].append((current_x, current_y, next_x, next_y))
                    
                    current_x = next_x
                    current_y = next_y

    except Exception as e:
        print(f"Error parsing infill lines: {e}")
        
    return layer_data

def detect_perfect_squares(segments: list, tolerance_mm: float = 0.1, min_size_mm: float = 0.5) -> list:
    """
    Detects perfect squares (pores) from a list of grid infill segments, 
    supporting any rotation angle (e.g. 45-degree Grid infill).
    Returns a list of pseudo-bounding boxes: [(cx - w/2, cy - w/2, cx + w/2, cy + w/2), ...]
    so that compute_centroids yields the correct center.
    """
    if not segments:
        return []

    # 1. Group segments by angle (bin to nearest integer degree)
    angle_groups = defaultdict(list)
    for x0, y0, x1, y1 in segments:
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        if angle > 179.5: angle = 0.0
        bin_angle = int(round(angle)) % 180
        angle_groups[bin_angle].append((x0, y0, x1, y1))
        
    # Find the two most dominant angles (for a Grid infill, there should be 2 perpendicular sets)
    sorted_angles = sorted(angle_groups.keys(), key=lambda k: len(angle_groups[k]), reverse=True)
    
    # Merge similar angles that might have been binned slightly off
    merged_angles = []
    for a in sorted_angles:
        found = False
        for i, ma in enumerate(merged_angles):
            if abs(a - ma) <= 2 or abs(a - ma) >= 178:
                angle_groups[ma].extend(angle_groups[a])
                found = True
                break
        if not found:
            merged_angles.append(a)
            
    if len(merged_angles) < 2:
        return [] # Not a cross-hatching grid pattern
        
    angle1 = merged_angles[0]
    angle2 = merged_angles[1]
    
    lines1 = angle_groups[angle1]
    lines2 = angle_groups[angle2]
    
    # 2. Find all intersections between lines1 and lines2
    def line_intersection(line1, line2):
        x1, y1, x2, y2 = line1
        x3, y3, x4, y4 = line2
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) < 1e-6: return None
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
        # Check if intersection is within both segments (with slight tolerance to catch corners)
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
        
    # 3. Rotate intersection points by -angle1 to align them with XY axes
    alpha = math.radians(angle1)
    cos_a = math.cos(-alpha)
    sin_a = math.sin(-alpha)
    
    rotated_pts = []
    for x, y in intersections:
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        rotated_pts.append((rx, ry, x, y))
        
    # Snap to grid to group nearby intersections
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
    
    # 4. Find squares in the rotated grid
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
            if abs(w - h) > tolerance_mm * 2:
                continue # Not a square
                
            p1 = (rx0, ry0)
            p2 = (rx1, ry0)
            p3 = (rx0, ry1)
            p4 = (rx1, ry1)
            
            if p1 in unique_rotated and p2 in unique_rotated and p3 in unique_rotated and p4 in unique_rotated:
                # We found a pore! The centroid is the average of the 4 original points
                ox1, oy1 = unique_rotated[p1]
                ox2, oy2 = unique_rotated[p2]
                ox3, oy3 = unique_rotated[p3]
                ox4, oy4 = unique_rotated[p4]
                
                cx = (ox1 + ox2 + ox3 + ox4) / 4.0
                cy = (oy1 + oy2 + oy3 + oy4) / 4.0
                
                # Return pseudo-bounds so compute_centroids gets the exact center
                squares.append((cx - w/2, cy - w/2, cx + w/2, cy + w/2))
                
    return squares

def compute_centroids(squares: list) -> list:
    """
    Computes the centroid of each square.
    Returns: [(cx, cy), ...]
    """
    return [((x_min + x_max) / 2, (y_min + y_max) / 2) for x_min, y_min, x_max, y_max in squares]

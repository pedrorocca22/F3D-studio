
import cv2
import numpy as np
import os
from pattern_engine import PatternEngine

def test_sponge_pattern():
    print("Testing Sponge Pattern Generation...")
    
    width = 500
    height = 500
    shape = (height, width)
    
    # Test Parameters
    pore_size = 1.0 # mm
    pixel_size = 0.05 # mm/px
    densities = [0.2, 0.5, 0.8]
    
    os.makedirs("test_patterns", exist_ok=True)
    
    for d in densities:
        print(f"Generating Sponge Pattern. Density: {d}, Pore Size: {pore_size}mm")
        
        mask = PatternEngine.generate_pattern_mask(
            shape=shape,
            pattern_type='sponge',
            cell_size_mm=pore_size,
            pixel_size_mm=pixel_size,
            z_index=0,
            density=d
        )
        
        # Visualize
        img = np.zeros(shape, dtype=np.uint8)
        img[mask] = 255 # Bone is White
        
        filename = f"test_patterns/sponge_d{d}_p{pore_size}.png"
        cv2.imwrite(filename, img)
        print(f"Saved: {filename}")

if __name__ == "__main__":
    test_sponge_pattern()

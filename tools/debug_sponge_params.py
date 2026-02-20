
import cv2
import numpy as np
from pattern_engine import PatternEngine

def test_sponge_params():
    print("Testing Sponge Pattern Parameters...")
    
    # Create dummy layer image (Solid White)
    width = 500
    height = 500
    layer_image = np.full((height, width), 255, dtype=np.uint8)
    
    # 1. Test Default Sponge (Black & White)
    mod_default = {
        'type': 'shell_core',
        'core_pattern': 'sponge',
        'shell_thickness': 1.0,
        'sponge_density': 0.5,
        'voronoi_cell_size': 1.0,
        'shell_gray': 0,    # Matrix (Black)
        'core_gray': 255    # Bone (White)
    }
    
    print("\nApplying Default Sponge...")
    res_default = PatternEngine.apply_modifiers(layer_image, [mod_default], 0.05, pixel_size_um=None, layer_index=10)
    unique_default = np.unique(res_default)
    print(f"Default Unique Values: {unique_default}")
    
    # 2. Test Custom Color Sponge (Gray & Light Gray)
    mod_custom = {
        'type': 'shell_core',
        'core_pattern': 'sponge',
        'shell_thickness': 1.0,
        'sponge_density': 0.5,
        'voronoi_cell_size': 3.0, # Larger pores
        'shell_gray': 128,  # Matrix (Gray)
        'core_gray': 200    # Bone (Light Gray)
    }
    
    print("\nApplying Custom Sponge...")
    res_custom = PatternEngine.apply_modifiers(layer_image, [mod_custom], 0.05, pixel_size_um=None, layer_index=10)
    unique_custom = np.unique(res_custom)
    print(f"Custom Unique Values: {unique_custom}")
    
    if 128 in unique_custom and 200 in unique_custom:
        print("SUCCESS: Custom colors applied.")
    else:
        print("FAILURE: Custom colors NOT applied.")
        
    # verify scale difference
    # We can't easily programmatically verify visual scale without complex analysis, 
    # but the log output from pattern_engine (which I added) should show the cell_size received.

if __name__ == "__main__":
    test_sponge_params()

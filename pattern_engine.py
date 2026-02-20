import cv2
import numpy as np
import logging
from PIL import Image

logger = logging.getLogger("PatternEngine")

class PatternEngine:
    # Cache for generated masks: {(shape, pattern_type, cell_size_mm, pixel_size_mm): mask}
    _mask_cache = {}

    @staticmethod
    def generate_pattern_mask(shape, pattern_type, cell_size_mm, pixel_size_mm=0.0555, z_index=0, density=0.5):
        """
        Generates a boolean mask for the requested pattern type.
        Includes z_index to allow 3D variation (pseudo-3D shift).
        """
        height, width = shape
        cell_px = max(1, int(cell_size_mm / pixel_size_mm))
        
        # --- 3D VARIATION LOGIC (INTERPOLATION / MORPHING) ---
        if pattern_type in ['voronoi', 'sponge']:
            try:
                # True 3D Spongy Bone via Noise Interpolation
                period = 20
                
                # Determine which keyframes we are between
                key_idx = z_index // period
                progress = (z_index % period) / float(period)
                
                # Seeds for the two keyframes
                seed_a = 42 + key_idx
                seed_b = 42 + key_idx + 1
                
                # Helper to generate or retrieve GRAYSCALE noise (before threshold) from cache
                def get_noise(s_seed):
                    # Cache key for NOISE: specific seed + params
                    n_key = (shape, 'noise_raw', round(cell_size_mm, 4), round(pixel_size_mm, 6), s_seed)
                    if n_key in PatternEngine._mask_cache:
                        return PatternEngine._mask_cache[n_key]
                    
                    # Generate Noise
                    scale_factor = max(2, int(cell_px))
                    low_h = max(2, height // scale_factor)
                    low_w = max(2, width // scale_factor)
                    
                    # Use a local RandomState to avoid affecting global state
                    rs = np.random.RandomState(s_seed)
                    raw = rs.randint(0, 255, (low_h, low_w), dtype=np.uint8)
                    smooth = cv2.resize(raw, (width, height), interpolation=cv2.INTER_LINEAR)
                    # Gaussian blur for rounder features
                    if pattern_type == 'sponge':
                         smooth = cv2.GaussianBlur(smooth, (3, 3), 0)
                    
                    PatternEngine._mask_cache[n_key] = smooth
                    return smooth

                # Get the two noise fields
                noise_a = get_noise(seed_a)
                noise_b = get_noise(seed_b)
                
                # Interpolate (Blend)
                blended = cv2.addWeighted(noise_a, 1.0 - progress, noise_b, progress, 0)
                
                # Threshold
                threshold_val = 110
                if pattern_type == 'sponge':
                     # Density 1.0 -> Threshold 0 (All White)
                     # Density 0.0 -> Threshold 255 (All Black)
                     threshold_val = int(255 * (1.0 - density))
                
                final_mask = blended > threshold_val
                return final_mask

            except Exception as e:
                print(f"[ERROR] PatternEngine 3D Generation Failed: {e}", flush=True)
                # Fallback to 2D logic below if 3D fails
                pass

        # --- 2D FALLBACK / STATIC PATTERNS ---
        # Create a cache key based on inputs (EXCLUDING z_index for base pattern)
        key = (shape, pattern_type, round(cell_size_mm, 4), round(pixel_size_mm, 6), round(density, 4))
        
        if key in PatternEngine._mask_cache:
            return PatternEngine._mask_cache[key]

        mask = np.zeros(shape, dtype=bool)
        
        if pattern_type == 'grid':
            y_grid, x_grid = np.ogrid[:height, :width]
            mask = (x_grid % cell_px == 0) | (y_grid % cell_px == 0)
            
        elif pattern_type == 'checkerboard':
            y_grid, x_grid = np.ogrid[:height, :width]
            mask = ((x_grid // cell_px) + (y_grid // cell_px)) % 2 == 0
            
        elif pattern_type == 'lines':
                y_grid, x_grid = np.ogrid[:height, :width]
                mask = (x_grid % cell_px < (cell_px // 2))

        elif pattern_type == 'dots':
            y_grid, x_grid = np.ogrid[:height, :width]
            mask = (x_grid % cell_px == 0) & (y_grid % cell_px == 0)
            temp_mask = np.zeros(shape, dtype=np.uint8)
            temp_mask[mask] = 255
            kernel_size = max(1, cell_px // 4)
            kernel = np.ones((kernel_size, kernel_size), np.uint8)
            temp_mask = cv2.dilate(temp_mask, kernel, iterations=1)
            mask = temp_mask > 0

        elif pattern_type == 'voronoi':
            # FALLBACK STATIC VORONOI
            scale_factor = max(2, int(cell_px)) 
            low_h = max(2, height // scale_factor)
            low_w = max(2, width // scale_factor)
            
            rs = np.random.RandomState(42)
            noise = rs.randint(0, 255, (low_h, low_w), dtype=np.uint8)
            noise_smooth = cv2.resize(noise, (width, height), interpolation=cv2.INTER_LINEAR)
            mask = noise_smooth > 110

        elif pattern_type == 'sponge':
            # FALLBACK STATIC SPONGE
            scale_factor = max(2, int(cell_px)) 
            low_h = max(2, height // scale_factor)
            low_w = max(2, width // scale_factor)
            
            rs = np.random.RandomState(42)
            noise = rs.randint(0, 255, (low_h, low_w), dtype=np.uint8)
            noise = cv2.GaussianBlur(noise, (3, 3), 0)
            noise_smooth = cv2.resize(noise, (width, height), interpolation=cv2.INTER_LINEAR)
            
            threshold = int(255 * (1.0 - density))
            mask = noise_smooth > threshold

        else:
            mask = np.ones(shape, dtype=bool)
        
        # Save to Cache
        PatternEngine._mask_cache[key] = mask
        return mask

    @staticmethod
    def apply_modifiers(layer_image, modifiers, pixel_size_mm=0.0555, pixel_size_um=None, layer_index=0):
        """
        Applies shell/core logic and patterns to a layer image.
        Supports pixel_size in mm (default) or um (legacy call).
        """
        # Handle unit conversion if called with um
        if pixel_size_um is not None:
            pixel_size_mm = pixel_size_um / 1000.0

        print(f"[DEBUG] PatternEngine.apply_modifiers called. Mods: {modifiers}")

        # Convert PIL Image to numpy array if needed
        is_pil = False
        if not isinstance(layer_image, np.ndarray):
             is_pil = True
             layer_image = np.array(layer_image)

        if not modifiers:
            return Image.fromarray(layer_image) if is_pil else layer_image
        
        # Ensure binary base (0 or 255)
        # Check if image is effectively empty
        if np.max(layer_image) < 10:
             return Image.fromarray(layer_image) if is_pil else layer_image

        _, binary_base = cv2.threshold(layer_image, 127, 255, cv2.THRESH_BINARY)
        
        # FIX: Ensure final_image is uint8 to support Grayscale (not just 0/1 bool)
        final_image = np.zeros(layer_image.shape, dtype=np.uint8)
        
        # Process the first valid Shell/Core modifier found
        mod = modifiers[0] 
        
        # FIX: Relax type check. If it has 'core_pattern', assume it's a fill pattern.
        # This handles cases where 'type' might be missing or 'volume' but we still want to apply pattern logic 
        # (though volume usually implies 3D, here we treat as layer-wise pattern).
        is_pattern_mod = (mod.get('type') == 'shell_core') or ('core_pattern' in mod)

        if is_pattern_mod:
            shell_thickness_mm = float(mod.get('shell_thickness', 1.0))
            shell_gray = int(mod.get('shell_gray', 255))
            core_gray = int(mod.get('core_gray', 100))
            
            print(f"[DEBUG] Layer {layer_index}: Applying Pattern. ShellGray={shell_gray}, CoreGray={core_gray}", flush=True)

            pattern_type = mod.get('pattern', 'solid') # or 'core_pattern'
            if 'core_pattern' in mod: pattern_type = mod['core_pattern']
            
            cell_size = float(mod.get('cell_size', 1.0))
            if 'voronoi_cell_size' in mod: cell_size = float(mod['voronoi_cell_size'])
            
            density = float(mod.get('sponge_density', 0.5))
            
            print(f"[DEBUG] Sponge Config - CellSize: {cell_size}, Density: {density}, Pattern: {pattern_type}", flush=True)

            # 1. Generate Shell vs Core Masks
            kernel_size = int(shell_thickness_mm / pixel_size_mm)
            if kernel_size < 1: kernel_size = 1
            
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size*2+1, kernel_size*2+1))
            
            # Core is the erosion of the full solid
            core_mask_img = cv2.erode(binary_base, kernel, iterations=1)
            
            # Shell is Full - Core
            shell_mask_img = cv2.subtract(binary_base, core_mask_img)
            
            # 2. Generate Pattern for Core
            pattern_mask = PatternEngine.generate_pattern_mask(layer_image.shape, pattern_type, cell_size, pixel_size_mm, z_index=layer_index, density=density)
            
            # 3. Compose Final Image
            # A. Fill Shell (Perimeter)
            final_image[shell_mask_img > 0] = shell_gray
            
            # B. Fill Core
            core_pixels = (core_mask_img > 0)
            
            # Pattern Foreground -> Core Gray (e.g. Bone)
            pattern_pixels = pattern_mask & core_pixels
            final_image[pattern_pixels] = core_gray
            
            # Pattern Background -> Shell Gray (e.g. Matrix/Pore)
            # This respects the user's "Matrix Color" choice for the void space.
            # If they want voids, they should set Shell Gray to 0.
            background_pixels = (~pattern_mask) & core_pixels
            final_image[background_pixels] = shell_gray
            
            # DEBUG: Check output values
            unique_vals = np.unique(final_image)
            print(f"[DEBUG] Layer {layer_index}: Output Unique Values: {unique_vals}. Shape: {final_image.shape}. Dtype: {final_image.dtype}", flush=True)
            
        else:
            return Image.fromarray(layer_image) if is_pil else layer_image

        return Image.fromarray(final_image) if is_pil else final_image

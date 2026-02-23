import cv2
import numpy as np
import logging
from PIL import Image

logger = logging.getLogger("PatternEngine")

class PatternEngine:
    # Cache for generated masks: {cache_key: mask}
    _mask_cache = {}

    @staticmethod
    def generate_pattern_mask(shape, pattern_type, cell_size_mm, pixel_size_mm=0.0555, z_index=0, density=0.5, randomize_z=False):
        """
        Generates a boolean mask for the 3D core patterns.
        Supported patterns: 'sponge', 'vascular', 'lattice', 'linear', 'noise'.
        """
        height, width = shape
        cell_px = max(1, int(cell_size_mm / pixel_size_mm))
        
        # --- LATTICE / GRID PATTERN ---
        if pattern_type == 'lattice':
            key = (shape, 'lattice', round(cell_size_mm, 4), round(pixel_size_mm, 6), round(density, 4))
            if key in PatternEngine._mask_cache:
                return PatternEngine._mask_cache[key]
                
            # Density controls wall thickness. 
            # density=1.0 -> solid, density=0.0 -> empty
            # wall_thickness = cell_px * density
            wall_thickness_px = max(1, int(cell_px * density))
            
            # Create a base empty grid mask
            mask = np.zeros(shape, dtype=bool)
            
            # Draw vertical walls
            for x in range(0, width, cell_px):
                mask[:, x:x+wall_thickness_px] = True
                
            # Draw horizontal walls
            for y in range(0, height, cell_px):
                mask[y:y+wall_thickness_px, :] = True
                
            PatternEngine._mask_cache[key] = mask
            return mask
            
        # --- LINEAR / GROOVES PATTERN ---
        if pattern_type == 'linear':
            key = (shape, 'linear', round(cell_size_mm, 4), round(pixel_size_mm, 6), round(density, 4), z_index if randomize_z else 0)
            if key in PatternEngine._mask_cache:
                return PatternEngine._mask_cache[key]
                
            wall_thickness_px = max(1, int(cell_px * density))
            mask = np.zeros(shape, dtype=bool)
            
            if randomize_z:
                rs = np.random.RandomState(42 + z_index)
                offset = rs.randint(0, cell_px)
            else:
                offset = 0
            
            # Draw vertical walls (channels along Y) accounting for offset
            for x in range(-cell_px, width + cell_px, cell_px):
                start = x + offset
                end = start + wall_thickness_px
                start = max(0, min(width, start))
                end = max(0, min(width, end))
                if start < end:
                    mask[:, start:end] = True
                
            PatternEngine._mask_cache[key] = mask
            return mask

        # --- PURE STATIC NOISE PATTERN ---
        if pattern_type == 'noise':
            seed = 42 + z_index if randomize_z else 42
            key = (shape, 'noise_pure', round(density, 4), seed)
            if key in PatternEngine._mask_cache:
                return PatternEngine._mask_cache[key]
            
            # Generamos ruido estocástico puro (pixel a pixel)
            # Density marca cuántos píxeles serán True (hueso)
            rs = np.random.RandomState(seed)
            raw = rs.random(shape)
            mask = raw < density
            
            PatternEngine._mask_cache[key] = mask
            return mask


        # --- 3D SPONGY BONE via Noise Interpolation ---
        try:
            period = 20

            # Determine which keyframes we are between
            key_idx = z_index // period
            progress = (z_index % period) / float(period)

            # Seeds for the two keyframes
            seed_a = 42 + key_idx
            seed_b = 42 + key_idx + 1

            def get_noise(s_seed):
                """Generate or retrieve blurred noise from cache."""
                n_key = (shape, 'noise_raw', round(cell_size_mm, 4), round(pixel_size_mm, 6), s_seed)
                if n_key in PatternEngine._mask_cache:
                    return PatternEngine._mask_cache[n_key]

                scale_factor = max(2, int(cell_px))
                low_h = max(2, height // scale_factor)
                low_w = max(2, width // scale_factor)

                rs = np.random.RandomState(s_seed)
                raw = rs.randint(0, 255, (low_h, low_w), dtype=np.uint8)
                smooth = cv2.resize(raw, (width, height), interpolation=cv2.INTER_LINEAR)
                smooth = cv2.GaussianBlur(smooth, (3, 3), 0)

                PatternEngine._mask_cache[n_key] = smooth
                return smooth

            noise_a = get_noise(seed_a)
            noise_b = get_noise(seed_b)

            # Blend between keyframes
            blended = cv2.addWeighted(noise_a, 1.0 - progress, noise_b, progress, 0)

            if pattern_type == 'vascular':
                # Ridged Noise: Fold the noise at 128 to create thin interconnected valleys (veins)
                dist = np.abs(blended.astype(np.int16) - 128)
                dist_normalized = dist / 127.0
                
                # We want the valleys (veins) to be False (void), ridges (tissue) to be True (solid).
                # Density parameter controls the width of the vein threshold.
                vein_width = density * 0.8  # Max 80% vein width
                return dist_normalized > vein_width
            else:
                # Default Sponge: Standard thresholding
                # Density 1.0 -> threshold 0 (all solid), Density 0.0 -> threshold 255 (all void)
                threshold_val = int(255 * (1.0 - density))
                return blended > threshold_val

        except Exception as e:
            print(f"[ERROR] PatternEngine 3D generation failed: {e}", flush=True)

        # --- 2D STATIC FALLBACK ---
        key = (shape, 'sponge', round(cell_size_mm, 4), round(pixel_size_mm, 6), round(density, 4))
        if key in PatternEngine._mask_cache:
            return PatternEngine._mask_cache[key]

        scale_factor = max(2, int(cell_px))
        low_h = max(2, height // scale_factor)
        low_w = max(2, width // scale_factor)

        rs = np.random.RandomState(42)
        noise = rs.randint(0, 255, (low_h, low_w), dtype=np.uint8)
        noise = cv2.GaussianBlur(noise, (3, 3), 0)
        noise_smooth = cv2.resize(noise, (width, height), interpolation=cv2.INTER_LINEAR)

        if pattern_type == 'vascular':
            dist = np.abs(noise_smooth.astype(np.int16) - 128)
            dist_normalized = dist / 127.0
            vein_width = density * 0.8
            mask = dist_normalized > vein_width
        else:
            threshold = int(255 * (1.0 - density))
            mask = noise_smooth > threshold

        PatternEngine._mask_cache[key] = mask
        return mask

    @staticmethod
    def apply_modifiers(layer_image, modifiers, pixel_size_mm=0.0555, pixel_size_um=None, layer_index=0):
        """
        Applies shell/core sponge pattern logic to a layer image.
        Supports pixel_size in mm (default) or um (legacy call).
        """
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

        # Skip effectively empty images
        if np.max(layer_image) < 10:
            return Image.fromarray(layer_image) if is_pil else layer_image

        _, binary_base = cv2.threshold(layer_image, 127, 255, cv2.THRESH_BINARY)
        final_image = np.zeros(layer_image.shape, dtype=np.uint8)

        mod = modifiers[0]
        is_pattern_mod = (mod.get('type') == 'shell_core') or ('core_pattern' in mod)

        if is_pattern_mod:
            shell_thickness_mm = float(mod.get('shell_thickness', 1.0))
            shell_gray = int(mod.get('shell_gray', 0))
            core_gray = int(mod.get('core_gray', 255))
            cell_size = float(mod.get('voronoi_cell_size', mod.get('cell_size', 1.0)))
            density = float(mod.get('sponge_density', 0.5))
            core_pattern = mod.get('core_pattern', 'sponge')
            randomize_z = bool(mod.get('randomize_z', False))

            print(f"[DEBUG] Layer {layer_index}: {core_pattern} — CellSize={cell_size}mm, Density={density}, RandomizeZ={randomize_z}, ShellGray={shell_gray}, CoreGray={core_gray}", flush=True)

            # 1. Erode to get core region
            kernel_size = max(1, int(shell_thickness_mm / pixel_size_mm))
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size * 2 + 1, kernel_size * 2 + 1))
            core_mask_img = cv2.erode(binary_base, kernel, iterations=1)
            shell_mask_img = cv2.subtract(binary_base, core_mask_img)

            # 2. Generate mask (vascular or sponge)
            pattern_mask = PatternEngine.generate_pattern_mask(
                layer_image.shape, core_pattern, cell_size, pixel_size_mm,
                z_index=layer_index, density=density, randomize_z=randomize_z
            )

            # 3. Compose: shell (perimeter) + core (sponge)
            final_image[shell_mask_img > 0] = shell_gray
            core_pixels = core_mask_img > 0
            final_image[pattern_mask & core_pixels] = core_gray       # bone
            final_image[(~pattern_mask) & core_pixels] = shell_gray   # void/matrix

            unique_vals = np.unique(final_image)
            print(f"[DEBUG] Layer {layer_index}: Output unique values: {unique_vals}", flush=True)

        else:
            return Image.fromarray(layer_image) if is_pil else layer_image

        return Image.fromarray(final_image) if is_pil else final_image

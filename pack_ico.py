import struct
import os

# Tamaños en orden: de pequeño a grande
sizes = [16, 32, 48, 64, 128, 256]
frames = []

for s in sizes:
    path = f'public/frame_{s}.png'
    with open(path, 'rb') as f:
        data = f.read()
    frames.append({'width': s, 'height': s, 'data': data})

# Construir archivo ICO
ico_data = bytearray()

# HEADER ICO: Reserved(2) + Type(2) + Count(2)
ico_data.extend(struct.pack('<HHH', 0, 1, len(frames)))

# Calcular offset donde empiezan los datos de imagen
# Header = 6 bytes
# Directory = 16 bytes * num_frames
header_size = 6 + 16 * len(frames)

data_offset = header_size

# DIRECTORY (16 bytes por frame)
for frame in frames:
    w = frame['width']
    h = frame['height']
    data_len = len(frame['data'])
    # Width/Height: 0 means 256 for ICO format
    ico_w = w if w < 256 else 0
    ico_h = h if h < 256 else 0
    ico_data.extend(struct.pack('<BBBBHHII',
        ico_w,      # Width
        ico_h,      # Height
        0,          # Colors (0 = >256)
        0,          # Reserved
        1,          # Planes
        32,         # Bit count (32bpp for RGBA)
        data_len,   # Size in bytes
        data_offset # Offset to data
    ))
    data_offset += data_len

# DATOS DE IMAGEN (PNG raw)
for frame in frames:
    ico_data.extend(frame['data'])

# Guardar
with open('public/f3d_icon.ico', 'wb') as f:
    f.write(ico_data)

print(f'ICO generado: {len(ico_data)} bytes con {len(frames)} frames')

# Limpiar frames temporales
for s in sizes:
    try:
        os.remove(f'public/frame_{s}.png')
    except:
        pass
print('Frames temporales eliminados')

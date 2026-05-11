import imageio.v3 as iio
import numpy as np

try:
    # Intentar leer todas las imagenes del ICO
    imgs = iio.imread('public/f3d_icon.ico', index=None)
    if imgs is None:
        imgs = [iio.imread('public/f3d_icon.ico')]
    elif not isinstance(imgs, list):
        imgs = [imgs]
    print(f'Frames leidos por imageio: {len(imgs)}')
    for i, img in enumerate(imgs):
        print(f'  Frame {i}: shape={img.shape}')
except Exception as e:
    print(f'Error con imageio: {e}')

# Verificar con struct directamente
import struct
with open('public/f3d_icon.ico', 'rb') as f:
    data = f.read()

reserved, icon_type, count = struct.unpack('<HHH', data[:6])
print(f'\nHeader ICO: reserved={reserved}, type={icon_type}, count={count}')

offset = 6
for i in range(count):
    w, h, colors, reserved2, planes, bpp, size, img_offset = struct.unpack('<BBBBHHII', data[offset:offset+16])
    print(f'  Entry {i}: {w if w else 256}x{h if h else 256}, bpp={bpp}, size={size}, offset={img_offset}')
    offset += 16

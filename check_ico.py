from PIL import Image
img = Image.open('public/f3d_icon.ico')
print('Formato:', img.format)
print('Tamaños en el ICO:')
try:
    i = 0
    while True:
        print(f'  Frame {i}: {img.size} mode={img.mode}')
        i += 1
        img.seek(i)
except EOFError:
    pass

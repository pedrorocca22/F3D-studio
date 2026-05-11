from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('icon_frames', exist_ok=True)

# Icono GRANDE: F3D negro sobre blanco (para escritorio)
size_big = 256
img_big = Image.new('RGBA', (size_big, size_big), (255, 255, 255, 255))
draw = ImageDraw.Draw(img_big)

try:
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 110)
except:
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 110)
    except:
        font = ImageFont.load_default()

text = 'F3D'
bbox = draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
x = (size_big - text_w) // 2
y = (size_big - text_h) // 2 - 10
draw.text((x, y), text, fill=(0, 0, 0, 255), font=font)

# Icono PEQUEÑO: COMPLETAMENTE TRANSPARENTE (alpha=0) para barra de titulo
for s in [16, 32]:
    Image.new('RGBA', (s, s), (255, 255, 255, 0)).save(f'icon_frames/{s}.png')

# Guardar frames grandes
img_big.save('icon_frames/256.png')
img_big.resize((128, 128), Image.LANCZOS).save('icon_frames/128.png')
img_big.resize((64, 64), Image.LANCZOS).save('icon_frames/64.png')
img_big.resize((48, 48), Image.LANCZOS).save('icon_frames/48.png')

print("Frames generados")

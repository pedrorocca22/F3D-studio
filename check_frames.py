from PIL import Image
img = Image.open('public/f3d_icon.ico')
for i in [0, 1, 5]:
    img.seek(i)
    img.save(f'public/frame_check_{img.size[0]}.png')
print('Frames extraidos')

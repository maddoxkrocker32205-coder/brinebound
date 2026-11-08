#!/usr/bin/env python3
"""Draw the home-screen icons in web/ (a pixel-art sloop at sunset), at 512, 192 and 180 px. Needs Pillow."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
N = 32
img = Image.new('RGB', (N, N))
px = img.load()
lerp = lambda a, b, t: tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
hexc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
dusk, rose, gold = hexc('#26294a'), hexc('#c0566a'), hexc('#f6b45e')
deep, sea, glint = hexc('#0f3a4c'), hexc('#1d6a7c'), hexc('#7fc3c9')
H = 21  # horizon row
for y in range(N):
    for x in range(N):
        if y < H:
            t = y / (H - 1)
            px[x, y] = lerp(dusk, rose, t / 0.55) if t < 0.55 else lerp(rose, gold, (t - 0.55) / 0.45)
        else:
            px[x, y] = lerp(sea, deep, (y - H) / (N - 1 - H))
d = ImageDraw.Draw(img)
sun = Image.new('L', (N, N)); ImageDraw.Draw(sun).ellipse((20, 14, 30, 24), fill=255)
for y in range(H):                                                 # the sun, half set behind the horizon
    for x in range(N):
        if sun.getpixel((x, y)): px[x, y] = hexc('#ffe7a6')
for y in range(H + 1, N):
    for x in range(N):
        if (x * 5 + y * 3) % 13 == 0 and y % 2 == 1: px[x, y] = glint
for y, x0, x1 in ((H + 1, 21, 29), (H + 3, 22, 28), (H + 5, 23, 27), (H + 7, 24, 26)):   # its road on the water
    for x in range(x0, x1): px[x, y] = hexc('#f4c578') if y < H + 4 else hexc('#c99a62')
hull, wood, sail, shade = hexc('#3b2417'), hexc('#5a3823'), hexc('#f3e6c4'), hexc('#d9c79c')
d.polygon([(5, 21), (22, 21), (20, 25), (8, 25)], fill=hull)       # hull
d.line((6, 22, 21, 22), fill=wood)
d.line((13, 4, 13, 21), fill=hexc('#2a1a10'))                      # mast
d.rectangle((8, 8, 18, 15), fill=sail); d.line((8, 15, 18, 15), fill=shade); d.line((18, 8, 18, 15), fill=shade)
d.rectangle((10, 5, 16, 7), fill=sail); d.line((10, 7, 16, 7), fill=shade)
d.polygon([(14, 16), (20, 20), (14, 20)], fill=sail)               # jib
px[14, 3] = px[15, 3] = hexc('#c8423a'); px[14, 4] = hexc('#c8423a')  # pennant
os.makedirs(os.path.join(ROOT, 'web'), exist_ok=True)
for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    img.resize((size, size), Image.NEAREST).save(os.path.join(ROOT, 'web', name), optimize=True)
    print('web/' + name)

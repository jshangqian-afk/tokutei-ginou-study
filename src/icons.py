import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # リポジトリ直下
import glob

FONTS = glob.glob('/usr/share/fonts/**/*NotoSansCJK*', recursive=True) + \
        glob.glob('/usr/share/fonts/**/*NotoSansJP*', recursive=True) + \
        glob.glob('/usr/share/fonts/**/*.ttc', recursive=True) + \
        glob.glob('/usr/share/fonts/**/*.otf', recursive=True)
FONTS.sort(key=lambda p: (0 if 'Bold' in p else 1, p))
print('font:', FONTS[0])

def make(size, path, maskable=False):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    r = int(size*0.22) if not maskable else 0
    if maskable:
        d.rectangle([0,0,size,size], fill=(0,160,233,255))
    else:
        d.rounded_rectangle([0,0,size-1,size-1], radius=r, fill=(0,160,233,255))
    scale = 0.46 if maskable else 0.56
    fs = int(size*scale)
    f = None
    for cand in FONTS:
        try:
            f = ImageFont.truetype(cand, fs); break
        except Exception:
            continue
    txt = "食"
    if f is None:
        f = ImageFont.load_default(); txt = "SS"
    bb = d.textbbox((0,0), txt, font=f)
    d.text(((size-(bb[2]-bb[0]))/2 - bb[0], (size-(bb[3]-bb[1]))/2 - bb[1]), txt, font=f, fill=(255,255,255,255))
    img.save(path)
    print('wrote', os.path.basename(path))

make(192, os.path.join(OUT, 'icon-192.png'))
make(512, os.path.join(OUT, 'icon-512.png'))
make(512, os.path.join(OUT, 'icon-maskable-512.png'), maskable=True)
make(180, os.path.join(OUT, 'apple-touch-icon.png'))

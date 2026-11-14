"""Builds /home/claude/game/style/style-A2.html (self-contained) from a2_engine.js + character PNGs.
Usage: python3 build_a2.py <assets_png_dir> <crops_dir> <out_html>"""
import sys, os, io, base64
from PIL import Image, ImageFilter, ImageEnhance
PNG, CROPS, OUT = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
# name -> (path, max height px). Clean redraws from assets/png; rough crops only where no redraw exists yet.
SRC = {
    'fish_folded': (f'{PNG}/fish_folded.png', 560), 'fish_unfolded': (f'{PNG}/fish_unfolded.png', 480),
    'juicebox': (f'{PNG}/juicebox.png', 190), 'beaver': (f'{PNG}/beaver.png', 190),
    'orangeowl': (f'{PNG}/orangeowl.png', 330), 'firecat': (f'{PNG}/firecat.png', 190),
    'bat': (f'{CROPS}/bat.png', 80), 'ghost': (f'{CROPS}/ghost.png', 150),
}
LINEART = {'bat', 'ghost'}
def enc(name, path, h):
    im = Image.open(path).convert('RGBA'); bb = im.getbbox(); im = im.crop(bb)
    if im.height > h: im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    if name in LINEART:
        a = im.split()[3]; rgb = ImageEnhance.Contrast(im.convert('RGB')).enhance(1.8).filter(ImageFilter.MinFilter(3)); im = rgb.convert('RGBA'); im.putalpha(a)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
assets = ',\n'.join(f'  {k}: "{enc(k, p, h)}"' for k, (p, h) in SRC.items())
engine = open(os.path.join(HERE, 'a2_engine.js')).read()
tpl = open(os.path.join(HERE, 'a2_template.html')).read()
html = tpl.replace('/*ASSETS*/', 'const ASSETS = {\n' + assets + '\n};').replace('/*ENGINE*/', engine)
open(OUT, 'w').write(html); print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')

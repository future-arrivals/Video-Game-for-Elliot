"""Ball: Elliot's red, white and blue folding ball (IMG_3534 folded, IMG_3535 unfolded).

Hand-placed points joined by Catmull-Rom cubic beziers (same method as tools/monster2/kit.py), no tracing.
Authoring units are pixels of the 1400 px wide, upright (EXIF-rotated) folded photo; SC scales them to sprite
units (folded ball ~400 long side). Inside creatures are placed in 1400 px unfolded-photo pixels and mapped onto
the folded ball's scale with U().

Writes (paths relative to the project folder):
  Art/Characters/svg/ball_folded.svg, ball_unfolded.svg
  Art/Characters/png/ball_folded.png, ball_unfolded.png   (1024 px long side, transparent)
  Art/Characters/manifests/manifest_ball.json
  Art/Characters/compare_ball.png                         (his photos beside the redraws)
Run:  python3 Source/ball/ball.py            (needs Python 3 + PIL, macOS sips, and node + Chrome for render.mjs)
"""
import math, os, re, json, subprocess, sys, tempfile

# ---- the one line to change for a navy-outline variant: OUT = '#22307f' -------------------------------
OUT = '#1a1a1a'

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.environ.get('PROJECT_DIR', os.path.normpath(os.path.join(HERE, '..', '..')))
ART = os.path.join(PROJECT, 'Art', 'Characters')
TMP = os.environ.get('BALL_TMP') or tempfile.mkdtemp(prefix='ball_')

# colours sampled from his photos, lifted ~12% (photos are under-exposed)
PAPER = '#fbfaf6'
RED = '#d8463c'
BAND = '#2f4cb2'       # the blue band
EYE = '#2537a3'        # solid blue eyes
NOSE = '#23338f'       # nose-and-mouth scribble
BLUE_LINE = '#2b40a8'  # his blue marker lines inside (feathers)
LTBLUE = '#93d5de'
PINK = '#e8709c'
ORANGE = '#e57b3e'
GREEN = '#33903f'
YELLOW = '#d8ec5c'
BLACK = '#1a1a1a'      # his black marks (not outlines)

SC = 0.68              # photo px -> sprite units
K = 1.30               # unfolded-photo px -> folded-photo px (the two photos are at different zoom)
HR = 643.0             # hinge (the crease) x in folded px; right hinge in the unfolded sprite
UL, UR = 378.0, 972.0  # left / right hinge x in the unfolded photo
D = round((UR - UL) * K)   # 772: how far part-left sits from its folded place when open
HL = HR - D            # left hinge x in the unfolded sprite


def U(x, y):
    "unfolded-photo px -> folded/sprite authoring px"
    return (HL + (x - UL) * K, 261 + (y - 283) * K)


def UP(P):
    return [U(*p[:2]) + tuple(p[2:]) for p in P]


def f(v):
    s = '%.1f' % v
    return s[:-2] if s.endswith('.0') else s


def _pts(P, dx=0):
    return [((float(p[0]) + dx) * SC, float(p[1]) * SC, len(p) > 2 and p[2] == 'c') for p in P]


def path(P, closed=True, t=0.5, dx=0):
    P = _pts(P, dx); n = len(P)
    get = (lambda i: P[i % n]) if closed else (lambda i: P[max(0, min(n - 1, i))])
    d = 'M%s %s' % (f(P[0][0]), f(P[0][1]))
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        if p1[2] and p2[2]:
            d += ' L%s %s' % (f(p2[0]), f(p2[1])); continue
        c1 = (p1[0], p1[1]) if p1[2] else (p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3)
        c2 = (p2[0], p2[1]) if p2[2] else (p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3)
        d += ' C%s %s %s %s %s %s' % (f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1]))
    return d + ('Z' if closed else '')


def shape(P, fill, sw=9, stroke=OUT, dx=0):
    s = ' stroke="%s" stroke-width="%s"' % (stroke, sw) if stroke else ''
    return '<path d="%s" fill="%s"%s/>' % (path(P, dx=dx), fill, s)


def line(P, sw=9, stroke=OUT, dx=0):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>' % (path(P, False, dx=dx), stroke, sw)


def tube(P, w, fill, sw=6, stroke=OUT):
    "a thick marker band along an open centre line, with an outline (outline stroke under a fill stroke)"
    d = path(P, False)
    return ('<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>'
            '<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>') % (d, stroke, f(w * SC + 2 * sw), d, fill, f(w * SC))


def ellipse(cx, cy, rx, ry, fill, sw=9, rot=0, stroke=OUT, n=8, wob=0.0):
    pts = []; r = math.radians(rot)
    for i in range(n):
        a = 2 * math.pi * i / n; w = 1 + wob * math.sin(3 * a + 1.3)
        x, y = rx * w * math.cos(a), ry * w * math.sin(a)
        pts.append((cx + x * math.cos(r) - y * math.sin(r), cy + x * math.sin(r) + y * math.cos(r)))
    return shape(pts, fill, sw, stroke=stroke)


def g(id_, body, tr=''):
    return '<g id="%s"%s>%s</g>' % (id_, (' transform="%s"' % tr) if tr else '', body)


def doc(body, vb):
    x, y, w, h = vb
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%s" height="%s">\n'
            '<g stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n') % (f(x), f(y), f(w), f(h), f(w), f(h), body)


# ======================================================================================= the ball halves
# outer outline, folded photo px, clockwise from the top of the crease
OUT_R = [(HR, 261), (734, 266), (791, 277), (836, 292), (886, 321), (924, 353), (953, 400), (972, 458),
         (978, 516), (974, 574), (962, 630), (946, 686), (923, 735), (892, 769), (847, 789), (791, 800),
         (734, 804), (HR, 801)]
OUT_L = [(HR, 801), (602, 797), (556, 784), (509, 760), (466, 731), (433, 697), (414, 650), (406, 598),
         (404, 540), (406, 492), (415, 446), (432, 400), (457, 359), (494, 322), (540, 293), (587, 275), (HR, 261)]
# red band edge (left) and blue band top edges
RED_EDGE_L = [(HR, 374), (602, 388), (556, 412), (509, 438), (472, 463), (432, 497), (404, 528)]
BAND_TOP_L = [(406, 584), (463, 615), (509, 640), (556, 666), (602, 692), (HR, 706)]
BAND_TOP_R = [(HR, 724), (690, 722), (735, 709), (780, 692), (840, 662), (880, 624), (917, 588), (950, 565), (975, 562)]


def seg(P, a, b):
    "points of P from the one nearest a to the one nearest b (inclusive)"
    ia = min(range(len(P)), key=lambda i: (P[i][0] - a[0]) ** 2 + (P[i][1] - a[1]) ** 2)
    ib = min(range(len(P)), key=lambda i: (P[i][0] - b[0]) ** 2 + (P[i][1] - b[1]) ** 2)
    return P[ia:ib + 1]


def half_left(dx=0):
    E = 1.5  # fills run a hair past the hinge so the two halves meet without a seam
    base = shape([(HR + E, 801, 'c')] + OUT_L[1:-1] + [(HR + E, 261, 'c')], PAPER, stroke=None, dx=dx)
    red = shape([(HR + E, 374, 'c'), (HR + E, 261, 'c')] + OUT_L[-2:8:-1] + [(404, 528)] + RED_EDGE_L[-2:0:-1] + [(HR, 374, 'c')],
                RED, stroke=None, dx=dx)
    band = shape([(HR + E, 706, 'c'), (HR + E, 801, 'c')] + OUT_L[1:8] + [(406, 584)] + BAND_TOP_L[1:-1] + [(HR, 706, 'c')],
                 BAND, stroke=None, dx=dx)
    body = g('cap-left', base + red + band)
    body += g('lines-left', line(RED_EDGE_L + [(392, 545)], 8, dx=dx) + line(BAND_TOP_L, 8, dx=dx))
    body += g('outline-left', line(OUT_L, 9, dx=dx))
    return body


def half_right():
    E = 1.5
    base = shape([(HR - E, 261, 'c')] + OUT_R[1:-1] + [(HR - E, 801, 'c')], PAPER, stroke=None)
    # red: from the crease along the top outline to the X, down the diagonal, back along the upper eye's top
    red = shape([(HR - E, 261, 'c'), (734, 266), (791, 277), (836, 292), (886, 321), (920, 352, 'c'), (853, 437, 'c'),
                 (842, 400), (812, 366), (776, 342), (740, 345), (712, 362), (680, 373), (HR - E, 376, 'c')], RED, stroke=None)
    band = shape([(HR - E, 724, 'c')] + BAND_TOP_R[1:] + OUT_R[9:-1] + [(HR - E, 801, 'c')], BAND, stroke=None)
    body = g('cap-right', base + red + band)
    lines = line([(HR, 376), (680, 373), (712, 360)], 8)                    # bottom edge of the red band
    lines += line([(826, 306), (862, 356), (901, 405)], 6)                  # the dark X in the red corner
    lines += line([(918, 356), (885, 397), (852, 437)], 6)
    lines += line(BAND_TOP_R, 8)
    lines += line([(906, 368), (930, 400), (946, 440), (952, 478)], 6)      # his second (inner) rim line
    lines += line([(963, 560), (957, 616), (940, 672), (912, 718), (870, 752), (812, 776), (760, 786)], 6)
    lines += line([(850, 432), (877, 452), (905, 478)], 6)                  # little struts round the button
    lines += line([(899, 412), (918, 440), (930, 470)], 6)
    lines += line([(881, 662), (906, 688), (936, 714)], 6)                  # the tick across the band
    body += g('lines-right', lines)
    body += g('button', ellipse(940, 516, 36, 41, PAPER, 7, n=10)
              + line([(915, 498), (909, 512), (917, 522)], 5))
    body += g('eye-top', shape([(713, 404), (722, 366), (750, 343), (785, 337), (820, 348), (845, 378), (853, 415),
                                (836, 446), (800, 460), (760, 457), (728, 438)], EYE, 7))
    body += g('eye-bottom', shape([(725, 676), (738, 636), (776, 606), (820, 598), (862, 610), (884, 640), (882, 684),
                                   (862, 718), (822, 739), (774, 740), (742, 718)], EYE, 7))
    nose = shape([(661, 489), (664, 474), (677, 468), (690, 476), (692, 494), (684, 509), (669, 510)], NOSE, 0, stroke=None)
    nose += shape([(662, 534), (676, 520), (700, 503), (718, 482), (726, 470), (738, 482), (748, 510), (766, 534), (778, 548),
                   (752, 554), (712, 553), (676, 548)], PAPER, 6, stroke=NOSE)
    nose += shape([(680, 532), (700, 518), (722, 498), (734, 494), (744, 516), (756, 538), (724, 542), (696, 541)], NOSE, 0, stroke=None)
    nose += shape([(690, 560), (706, 552), (730, 556), (744, 574), (740, 598), (722, 608), (700, 602), (689, 582)], NOSE, 0, stroke=None)
    nose += ellipse(663, 535, 9, 8, NOSE, 0, stroke=None)
    body += g('nose-mouth', nose)
    body += g('outline-right', line(OUT_R, 9))
    return body


# ================================================================================= inside (unfolded only)
def inside():
    out = []
    # paper behind everything between the caps (no outline: the feathers make the top edge)
    back = UP([(UL - 2, 286, 'c'), (450, 318), (533, 344), (560, 330), (610, 340), (690, 330), (776, 383), (UR + 2, 292, 'c'),
               (UR + 2, 690, 'c'), (UL - 2, 690, 'c')])
    out.append(g('paper-inside', shape(back, PAPER, stroke=None)))

    # long green creature with yellow spikes and a clawed foot, hanging under the band
    c = UP([(735, 690), (712, 735), (700, 790), (722, 828), (762, 838), (818, 812), (870, 806), (915, 828), (948, 858), (968, 886)])
    gl = tube(c, 52, GREEN)
    spikes = ''
    cl = [(712, 735), (700, 790), (722, 828), (762, 838), (818, 812), (870, 806), (915, 828), (948, 858)]
    for i in range(len(cl) - 1):
        (x0, y0), (x1, y1) = cl[i], cl[i + 1]
        L = math.hypot(x1 - x0, y1 - y0); nx, ny = (y1 - y0) / L, -(x1 - x0) / L   # inner (concave) side
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        n = max(1, round(L / 26))
        for j in range(n):
            t = (j + .5) / n; x, y = x0 + (x1 - x0) * t + nx * 16, y0 + (y1 - y0) * t + ny * 16
            b1 = (x - ux * 10, y - uy * 10, 'c'); b2 = (x + ux * 10, y + uy * 10, 'c'); tip = (x + nx * 22, y + ny * 22, 'c')
            spikes += shape(UP([b1, tip, b2]), YELLOW, 4)
    leg = UP([(936, 690), (938, 740), (960, 760), (1010, 768), (1036, 790), (1040, 830), (1034, 852)])
    claws = shape(UP([(1018, 856, 'c'), (1022, 884, 'c'), (1032, 862, 'c'), (1042, 886, 'c'), (1050, 856, 'c')]), YELLOW, 5)
    out.append(g('creature-green-long', gl + spikes + tube(leg, 40, GREEN) + claws))

    # red shape with black marks, behind the right feathers
    red = shape(UP([(694, 470), (720, 456), (790, 440), (850, 438), (910, 452), (955, 500), (972, 580), (972, 648, 'c'),
                    (690, 648, 'c'), (684, 580), (688, 520)]), RED, 7)
    red += line(UP([(760, 584), (722, 580), (704, 598), (708, 622), (752, 630)]), 14, BLACK)
    red += line(UP([(720, 515), (790, 535), (860, 552)]), 5, BLACK)
    out.append(g('shape-red', red))

    # pink long-necked creature; orange head with eyes and teeth
    pink = shape(UP([(603, 340), (632, 382), (667, 424), (705, 482), (712, 540), (694, 600), (670, 645, 'c'), (430, 645, 'c'),
                     (424, 580), (432, 520), (458, 490), (500, 474), (540, 466), (574, 444), (592, 404), (590, 360), (574, 322),
                     (548, 300), (512, 292), (476, 292), (446, 276), (452, 220), (474, 170), (500, 118), (522, 87), (554, 73),
                     (592, 70), (612, 58), (630, 63), (634, 80), (655, 90), (652, 108), (628, 102), (598, 95), (566, 96),
                     (545, 112), (528, 145), (519, 188), (528, 232), (560, 268), (590, 300)]), PINK, 7)
    head = shape(UP([(538, 196), (606, 181), (616, 203), (641, 258), (662, 267), (684, 256), (690, 202), (708, 192),
                     (750, 185), (794, 191), (820, 213), (831, 240), (819, 262), (766, 281), (684, 292), (619, 299),
                     (596, 293), (576, 251), (554, 214)]), ORANGE, 7)
    mouth = shape(UP([(618, 205), (640, 196), (668, 196), (687, 204), (686, 236), (674, 256), (652, 258), (634, 240)]), BLUE_LINE, 5)
    for (x, y) in [(637, 210), (655, 207), (672, 210), (648, 250), (666, 249)]:
        mouth += ellipse(*U(x, y), 5.5, 5.5, PAPER, 0, stroke=None, n=6)
    eyes = ''
    for (x, y) in [(740, 190), (746, 257)]:
        ex, ey = U(x, y); eyes += ellipse(ex, ey, 15, 15, PAPER, 5, n=8) + ellipse(ex + 1, ey + 1, 6, 6, BLUE_LINE, 0, stroke=None, n=6)
    out.append(g('creature-pink', g('pink-body', pink) + g('pink-head', head + mouth + eyes)))

    # feathers: white with a light-blue stripe and his blue lines
    def feather(base1, tip, base2, stripe=True):
        s = shape(UP([base1 + ('c',), tip + ('c',), base2 + ('c',)]), PAPER, 6, stroke=BLUE_LINE)
        if stripe:
            mx, my = (base1[0] * .55 + base2[0] * .45), (base1[1] * .55 + base2[1] * .45)
            s += line(UP([(mx * .92 + tip[0] * .08, my * .92 + tip[1] * .08), (mx * .3 + tip[0] * .7, my * .3 + tip[1] * .7)]), 6, LTBLUE)
        return s
    fl = ''
    fl += feather((380, 286), (534, 342), (388, 316))
    fl += feather((384, 318), (537, 408), (392, 352))
    fl += feather((388, 356), (512, 478), (396, 396))
    fl += feather((392, 400), (478, 512), (386, 446))
    fl += feather((390, 455), (440, 560), (384, 512), False)
    fl += feather((388, 520), (462, 606), (383, 572))
    fl += feather((386, 584), (432, 640), (382, 636), False)
    out.append(g('feathers-left', fl))
    fr = ''
    fr += feather((UR, 290), (776, 386), (UR - 4, 394))
    fr += feather((UR - 4, 404), (757, 450), (UR - 8, 444))
    fr += feather((UR - 6, 478), (750, 512), (UR - 10, 520))
    fr += feather((UR - 8, 572), (763, 556), (UR - 6, 610))
    out.append(g('feathers-right', fr))

    # green curl near the top (a small snake)
    curl = UP([(700, 326), (720, 314), (756, 318), (775, 340), (762, 366), (726, 390), (712, 416), (726, 437), (752, 452), (778, 462)])
    hx, hy = U(694, 330)
    cg = tube(curl, 25, GREEN) + ellipse(hx, hy, 15, 12, GREEN, 6, rot=-20) + ellipse(hx - 6, hy + 8, 3.5, 3.5, YELLOW, 0, stroke=None, n=6)
    out.append(g('creature-green-curl', cg))

    # the blue band along the bottom, joining the two caps' bands
    top = UP([(UL, 626), (420, 636), (500, 645), (600, 642), (700, 646), (800, 648), (900, 646), (UR, 642)])
    top[0] = (HL, 706); top[-1] = (HR, 724)
    bot = UP([(UR, 697), (850, 700), (700, 702), (550, 700), (450, 699), (UL, 697)])
    bot[0] = (HR, 801); bot[-1] = (HL, 801)
    band = shape([(HL - 1.5, 706, 'c')] + top[1:-1] + [(HR + 1.5, 724, 'c'), (HR + 1.5, 801, 'c')] + bot[1:-1] + [(HL - 1.5, 801, 'c')], BAND, stroke=None)
    band += line(top, 8) + line(bot, 9)
    out.append(g('band-inside', band))
    return ''.join(out)


# ========================================================================================= build
def bounds(body, sw_pad=6):
    nums = []
    for d in re.findall(r' d="([^"]+)"', body):
        v = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
        nums += list(zip(v[0::2], v[1::2]))
    xs, ys = [p[0] for p in nums], [p[1] for p in nums]
    return min(xs) - sw_pad, min(ys) - sw_pad, max(xs) + sw_pad, max(ys) + sw_pad


def tight_vb(body):
    x0, y0, x1, y1 = bounds(body)
    return (math.floor(x0 - 12), math.floor(y0 - 12), math.ceil(x1 - x0 + 24), math.ceil(y1 - y0 + 24))


def run_render(jobs):
    jf = os.path.join(TMP, 'jobs.json'); json.dump(jobs, open(jf, 'w'))
    subprocess.run(['node', os.path.join(HERE, 'render.mjs'), jf], check=True, env=dict(os.environ, PROJECT_DIR=PROJECT))


def size_for(vb, long=1024):
    w, h = vb[2], vb[3]
    return (long, round(long * h / w)) if w >= h else (round(long * w / h), long)


def build():
    left_open = half_left(dx=-D)
    left_closed = half_left()
    right = half_right()
    unf = g('part-inside', inside()) + g('part-left', left_open) + g('part-right', right)
    fol = g('part-left', left_open, 'translate(%s,0)' % f(D * SC)) + g('part-right', right)
    vb_u = tight_vb(g('x', inside()) + left_open + right)
    vb_f = tight_vb(left_closed + right)
    files = {}
    for name, body, vb in [('ball_unfolded', unf, vb_u), ('ball_folded', fol, vb_f)]:
        svg = os.path.join(ART, 'svg', name + '.svg'); open(svg, 'w').write(doc(body, vb))
        files[name] = (svg, vb)
    jobs = []
    for name, (svg, vb) in files.items():
        w, h = size_for(vb)
        jobs.append(dict(svg=svg, out=os.path.join(ART, 'png', name + '.png'), w=w, h=h, bg='none'))
    run_render(jobs)
    return files


def manifest(files):
    def ids(svg): return re.findall(r'id="([^"]+)"', open(svg).read())
    tx = round(D * SC, 1)
    m = {'spec': {'stroke': '%s round caps/joins (one constant OUT in ball.py; set it to a navy such as #22307f for a blue-outline variant); '
                            '9 main outlines, 8 band and red-band edges, 6-7 eyes, button and small details; his blue (#2b40a8 / #23338f) kept for the nose-and-mouth and the feather lines' % OUT,
                  'units': 'photo px of the 1400 px folded photo x %.2f (folded long side ~400); inside creatures from the unfolded photo x %.2f to match' % (SC, K),
                  'method': 'hand-placed points joined by Catmull-Rom cubic beziers (Source/ball/ball.py); no tracing'},
         'sprites': {}}
    what = 'red, white and blue ball with a sideways face (two solid blue eyes, blue nose-and-mouth, a white button); opens sideways to show his friends inside'
    for n, form in [('ball_unfolded', 'unfolded'), ('ball_folded', 'folded')]:
        svg, vb = files[n]
        m['sprites'][n] = {'svg': 'svg/%s.svg' % n, 'png': 'png/%s.png' % n, 'character': what, 'form': form,
                           'viewBox': list(map(float, vb)), 'size': [float(vb[2]), float(vb[3])], 'part_ids': ids(svg)}
    m['sprites']['ball_unfolded']['hinge'] = {
        'left_hinge_line': [[round(HL * SC, 1), round(261 * SC, 1)], [round(HL * SC, 1), round(801 * SC, 1)]],
        'right_hinge_line': [[round(HR * SC, 1), round(261 * SC, 1)], [round(HR * SC, 1), round(801 * SC, 1)]],
        'close': 'translate(%s,0) on #part-left, hide #part-inside' % f(tx),
        'translate_x': tx,
        'how': 'Unfolded = part-inside + part-left + part-right at rest. To close, slide part-left right by translate_x '
               '(its hinge line lands exactly on the right hinge line, the crease) and hide part-inside. ball_folded.svg is exactly that state.',
        'notes': 'The paper opens sideways, so both hinge lines are vertical. The halves have no outline along the hinge (the ball is one '
                 'unbroken shape across the crease, as he drew it). part-inside holds paper-inside, creature-green-long (hangs below the band), '
                 'shape-red, creature-pink (pink-body, pink-head), feathers-left, feathers-right, creature-green-curl and band-inside (the blue band '
                 'that joins the two caps\' bands). In his folded photo a bit of the green creature\'s clawed foot pokes out under the crease; '
                 'that is left out of the folded sprite.'}
    m['sprites']['ball_folded']['hinge'] = {'part_left_transform': 'translate(%s,0)' % f(tx)}
    json.dump(m, open(os.path.join(ART, 'manifests', 'manifest_ball.json'), 'w'), indent=1)


def photo(name):
    "upright JPEG of his HEIC photo"
    from PIL import Image, ImageOps
    src = os.path.join(PROJECT, 'Original Hand Drawn Characters', name + '.HEIC')
    jpg = os.path.join(TMP, name + '.jpg')
    if not os.path.exists(jpg):
        subprocess.run(['sips', '-s', 'format', 'jpeg', src, '--out', jpg], check=True, capture_output=True)
    return ImageOps.exif_transpose(Image.open(jpg)).convert('RGB')


def compare(files):
    from PIL import Image, ImageDraw
    rows = []
    jobs = []
    spec = [('ball_folded', 'IMG_3534', (360, 230, 1010, 830), 620), ('ball_unfolded', 'IMG_3535', (110, 20, 1290, 930), 760)]
    for name, img, box, H in spec:
        ph = photo(img); k = ph.width / 1400
        cr = ph.crop(tuple(int(v * k) for v in box)); cr = cr.resize((round(cr.width * H / cr.height), H), Image.LANCZOS)
        svg, vb = files[name]
        w = round(vb[2] * H / vb[3]); out = os.path.join(TMP, name + '_cmp.png')
        jobs.append(dict(svg=svg, out=out, w=w, h=H, bg='#ffffff'))
        rows.append((name, cr, out))
    run_render(jobs)
    blocks = []
    for name, cr, out in rows:
        rd = Image.open(out).convert('RGB')
        im = Image.new('RGB', (cr.width + rd.width + 30, cr.height + 30), 'white')
        im.paste(cr, (0, 30)); im.paste(rd, (cr.width + 30, 30))
        ImageDraw.Draw(im).text((4, 8), name + '  (photo | redraw)', fill='black'); blocks.append(im)
    W = max(b.width for b in blocks)
    sheet = Image.new('RGB', (W, sum(b.height + 20 for b in blocks)), (235, 235, 235)); y = 0
    for b in blocks:
        sheet.paste(b, (0, y)); y += b.height + 20
    sheet.save(os.path.join(ART, 'compare_ball.png'))
    return sheet.size


if __name__ == '__main__':
    files = build()
    manifest(files)
    if '--no-compare' not in sys.argv:
        print('compare', compare(files))
    print({k: v[1] for k, v in files.items()})

"""
portrait.py — Đội hình chân dung Chủ tịch Hồ Chí Minh từ ảnh tư liệu khoảng năm 1946 (public domain,
Wikimedia Commons; bản trong dự án: Frontend/images/sanh/bac_ho_1946.jpg).

Không tự vẽ một khuôn mặt ngẫu nhiên — mọi đường nét đều can từ ảnh thật:
  1. Thiết kế vector thủ công (designs/05_chan_dung.svg): các nét can theo toạ độ pixel của ảnh
     (đường bao đầu–tai–vai, mắt, mày, mũi, ria, miệng, nếp má, chòm râu, lọn tóc, cổ áo).
     -> lấy mẫu "contour" dày, LED trắng ấm/vàng, ưu tiên cao (hiện ra trước khi chuyển cảnh).
  2. Bản đồ mật độ = nền + độ lớn gradient ảnh (phát hiện cạnh) + vùng đặc trưng (mắt, mũi, miệng, râu)
     -> Poisson-disk bán kính biến thiên: vùng mắt/miệng dày hơn hẳn vùng áo.
  3. Phân bố LED theo độ sáng: drone phần tô có độ sáng theo ảnh (positive, gamma) nhưng thấp hơn nét
     để nét nhận diện luôn nổi bật; màu nội suy hổ phách -> trắng ấm.
  4. Độ nổi 2.5D: vùng sáng nhô về phía khán giả tối đa 2,2 m (thấy rõ khi camera di chuyển).
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from dronekit import Cand, gid
from svgflat import load_svg, parse_color, point_in_polys, resample

SRC = "Frontend/images/sanh/bac_ho_1946.jpg"
DESIGN = "scripts/drone-show/designs/05_chan_dung.svg"
IMG_W, IMG_H = 960, 1350

SILHOUETTE = [  # mặt nạ chủ thể (đầu + tóc + tai + cổ + vai), cùng số liệu với đường bao trong SVG
    (168, 420), (160, 345), (178, 268), (225, 196), (292, 138), (372, 102), (462, 86), (552, 94), (640, 124),
    (712, 176), (764, 244), (796, 318), (808, 410), (800, 470), (812, 520), (802, 590), (792, 652), (772, 704),
    (746, 726), (726, 768), (700, 832), (664, 900), (648, 972), (700, 1004), (800, 1046), (900, 1094),
    (960, 1124), (960, 1350), (0, 1350), (0, 1210), (70, 1130), (150, 1060), (196, 990), (232, 930),
    (252, 860), (252, 790), (246, 722), (214, 712), (192, 668), (180, 600), (176, 530), (186, 490),
]
FACE = [(252, 430), (330, 360), (470, 330), (610, 350), (720, 410), (748, 520), (740, 640), (712, 760),
        (660, 860), (600, 930), (500, 960), (400, 930), (320, 860), (268, 760), (250, 620)]
BEARD = [(318, 880), (420, 955), (548, 958), (606, 1000), (586, 1120), (520, 1240), (468, 1290), (420, 1180),
         (360, 1040), (300, 930)]
FEATURES = [  # (cx, cy, rx, ry, trọng số mật độ)
    (376, 516, 78, 34, 3.0), (612, 520, 78, 34, 3.0),
    (372, 462, 92, 26, 1.6), (612, 466, 92, 26, 1.6),
    (492, 660, 70, 82, 1.7), (494, 812, 112, 34, 2.2), (488, 765, 150, 40, 1.6),
]

_cache = {}


def _maps(scale=0.5):
    if scale in _cache:
        return _cache[scale]
    im = Image.open(SRC).convert("L")
    w, h = int(IMG_W * scale), int(IMG_H * scale)
    im = im.resize((w, h), Image.LANCZOS)
    g = np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
    gy, gx = np.gradient(np.asarray(im.filter(ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255.0)
    grad = np.hypot(gx, gy)

    def poly_mask(poly):
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).polygon([(x * scale, y * scale) for x, y in poly], fill=255)
        return np.asarray(m) > 0
    feat = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    for cx, cy, rx, ry, wgt in FEATURES:
        e = ((xx - cx * scale) / (rx * scale)) ** 2 + ((yy - cy * scale) / (ry * scale)) ** 2
        feat = np.maximum(feat, wgt * np.exp(-np.maximum(e - 0.6, 0) * 1.5) * (e < 2.2))
    _cache[scale] = dict(g=g, grad=grad, mask=poly_mask(SILHOUETTE), face=poly_mask(FACE), beard=poly_mask(BEARD),
                         feat=feat, w=w, h=h, s=scale, yy=yy)
    return _cache[scale]


def make_portrait(height_m=92.0):
    """make(s): toạ độ mét, gốc tại tâm khung, y lên."""
    M = _maps()
    k = height_m / IMG_H
    sc, W, H = M["s"], M["w"], M["h"]
    cxm, cym = IMG_W / 2, IMG_H / 2 + 20

    def to_m(pts):
        pts = np.asarray(pts, dtype=float)
        return np.c_[(pts[:, 0] - cxm) * k, -(pts[:, 1] - cym) * k]

    def sample_map(arr, xm, ym):
        ix = np.clip(((xm / k + cxm) * sc).astype(int), 0, W - 1)
        iy = np.clip(((-ym / k + cym) * sc).astype(int), 0, H - 1)
        return arr[iy, ix]

    g, grad, mask, face, beard, feat = (M[x] for x in ("g", "grad", "mask", "face", "beard", "feat"))
    lo, hi = np.percentile(g[mask], 3), np.percentile(g[mask], 97)
    tone = np.clip((g - lo) / (hi - lo), 0, 1)
    wmap = 0.9 + 3.2 * np.clip(grad / 0.12, 0, 1) + feat
    wmap = np.where(face, wmap * 1.35, wmap)
    wmap = np.where(beard, wmap * 1.25, wmap)
    shirt = mask & ~face & ~beard & (M["yy"] > 900 * sc)
    wmap = np.where(shirt, wmap * 0.3, wmap)
    hairzone = mask & ~face & (M["yy"] < 520 * sc)
    wmap = np.where(hairzone, wmap * 1.25, wmap)
    hair_f = hairzone.astype(np.float32)

    # nét thiết kế (px ảnh -> mét)
    strokes = []
    for sh in load_svg(DESIGN)[0]:
        col = parse_color(sh.get("data-color")) or parse_color(sh.get("stroke")) or (1, 0.9, 0.75)
        grp = gid(sh.get("data-group", "pt_outline"))
        for poly, closed in sh.polys:
            strokes.append(dict(poly=to_m(poly), closed=closed, col=col, grp=grp,
                                bri=sh.fnum("data-bright", 0.9), sp=sh.fnum("data-sp", 1.0),
                                prio=sh.fnum("data-prio", 0.8), fill=sh.mode in ("fill", "both")))
    sil = [(to_m(SILHOUETTE + SILHOUETTE[:1]), True)]
    allp = sil[0][0]
    gx, gy = np.meshgrid(np.arange(allp[:, 0].min(), allp[:, 0].max(), 0.4),
                         np.arange(allp[:, 1].min(), allp[:, 1].max(), 0.4))
    dense = np.c_[gx.ravel(), gy.ravel()] + np.random.default_rng(5).uniform(-0.18, 0.18, (gx.size, 2))
    dense = dense[point_in_polys(dense, sil)]
    G_fill, G_hair = gid("pt_fill"), gid("pt_hair")
    hair_y = -(330 - cym) * k

    def led(t):
        t = np.clip(t, 0, 1)[:, None]
        return np.array([1.0, 0.56, 0.18])[None] * (1 - t) + np.array([1.0, 0.92, 0.78])[None] * t

    def make(s):
        out = []
        for st in strokes:
            sp = s * st["sp"]
            if st["fill"]:            # đồng tử: chấm sáng nhỏ
                c0 = st["poly"].mean(0)[None]
                out.append(Cand.make(c0, st["col"], 1.0, st["grp"], st["prio"], 0, sp * 0.8))
                continue
            pts, _ = resample(st["poly"], sp, st["closed"])
            out.append(Cand.make(pts, st["col"], st["bri"], st["grp"], st["prio"], 0, sp * 0.8))
        t = sample_map(tone, dense[:, 0], dense[:, 1])
        wv = sample_map(wmap, dense[:, 0], dense[:, 1])
        rr = s * 1.25 / np.sqrt(np.maximum(0.25, wv))
        bri = 0.07 + 0.68 * t ** 1.15
        hz = sample_map(hair_f, dense[:, 0], dense[:, 1])[:, None]
        col = led(t) * (1 - hz) + np.array([0.86, 0.9, 1.0])[None] * hz      # tóc bạc: trắng lạnh
        grp = np.where(hz[:, 0] > 0.5, G_hair, G_fill)
        out.append(Cand.make(dense, col, bri, grp, 0.3 + 0.1 * np.clip(wv / 4, 0, 1), 1, rr * 0.86))
        c = Cand.cat(out)
        c.pos[:, 2] = 2.2 * sample_map(tone, c.pos[:, 0], c.pos[:, 1])
        return c
    return make

"""
dronekit.py — lõi lấy mẫu đội hình drone dùng chung cho mọi cảnh.

Một đội hình được mô tả bằng hàm make(s) -> Cand (tập ứng viên với khoảng cách cơ sở s mét).
solve_exact() dò nhị phân s để đội hình có ĐÚNG N drone, rồi lọc xanh (blue-noise) để giữ khoảng
cách tối thiểu, tránh dồn cụm ở góc nhọn, và cắt bớt điểm tô (fill) thừa ở chỗ dày nhất.
"""
import math

import numpy as np

from svgflat import load_svg, parse_color, resample, point_in_polys, dist_to_polys

GROUPS = []          # bảng tên nhóm toàn cục -> id (uint8)


def gid(name):
    if name not in GROUPS:
        GROUPS.append(name)
    return GROUPS.index(name)


class Cand:
    """Tập ứng viên (mảng song song)."""
    FIELDS = ("pos", "col", "bri", "grp", "prio", "role", "rmin", "prm")

    def __init__(self, n=0):
        self.pos = np.zeros((n, 3)); self.col = np.zeros((n, 3)); self.bri = np.ones(n)
        self.grp = np.zeros(n, dtype=int); self.prio = np.zeros(n); self.role = np.zeros(n, dtype=int)
        self.rmin = np.ones(n); self.prm = np.zeros((n, 4))

    def __len__(self):
        return len(self.pos)

    @staticmethod
    def make(pos, col, bri=1.0, grp=0, prio=0.5, role=0, rmin=1.0, prm=None):
        n = len(pos)
        c = Cand(n)
        pos = np.asarray(pos, dtype=float)
        if pos.shape[1] == 2:
            pos = np.c_[pos, np.zeros(n)]
        c.pos = pos
        c.col = np.broadcast_to(np.asarray(col, dtype=float), (n, 3)).copy()
        c.bri = np.broadcast_to(np.asarray(bri, dtype=float), (n,)).copy()
        c.grp = np.broadcast_to(np.asarray(grp, dtype=int), (n,)).copy()
        c.prio = np.broadcast_to(np.asarray(prio, dtype=float), (n,)).copy()
        c.role = np.broadcast_to(np.asarray(role, dtype=int), (n,)).copy()
        c.rmin = np.broadcast_to(np.asarray(rmin, dtype=float), (n,)).copy()
        c.prm = np.zeros((n, 4)) if prm is None else np.asarray(prm, dtype=float).reshape(n, 4)
        return c

    @staticmethod
    def cat(items):
        items = [c for c in items if c is not None and len(c)]
        out = Cand(0)
        if not items:
            return out
        for f in Cand.FIELDS:
            setattr(out, f, np.concatenate([getattr(c, f) for c in items]))
        return out

    def take(self, idx):
        out = Cand(0)
        for f in Cand.FIELDS:
            setattr(out, f, getattr(self, f)[idx])
        return out


# --------------------------------------------------------------------------- lấy mẫu vùng tô
def hex_fill(polys, spacing, jitter=0.12, seed=1, margin=0.0):
    pts_all = np.vstack([p for p, _ in polys])
    x0, y0 = pts_all.min(0) - spacing
    x1, y1 = pts_all.max(0) + spacing
    dy = spacing * math.sqrt(3) / 2
    ys = np.arange(y0, y1, dy)
    xs = np.arange(x0, x1, spacing)
    gx, gy = np.meshgrid(xs, ys)
    gx = gx + (np.arange(len(ys))[:, None] % 2) * spacing / 2
    p = np.c_[gx.ravel(), gy.ravel()]
    rng = np.random.default_rng(seed)
    p = p + rng.uniform(-jitter, jitter, p.shape) * spacing
    p = p[point_in_polys(p, polys)]
    if margin > 0 and len(p):
        p = p[dist_to_polys(p, polys) >= margin]
    return p


def poisson_fill(polys, radius_fn, rmin, seed=1, k=18, density=None):
    """Bridson Poisson-disk với bán kính thay đổi theo vị trí (radius_fn(x,y) >= rmin)."""
    pts_all = np.vstack([p for p, _ in polys])
    lo, hi = pts_all.min(0), pts_all.max(0)
    rng = np.random.default_rng(seed)
    cell = rmin / math.sqrt(2)
    W, H = int((hi[0] - lo[0]) / cell) + 1, int((hi[1] - lo[1]) / cell) + 1
    grid = {}
    pts, radii, active = [], [], []

    def fits(p, r):
        gx, gy = int((p[0] - lo[0]) / cell), int((p[1] - lo[1]) / cell)
        reach = int(math.ceil(max(r, rmin * 3) / cell)) + 1
        for ix in range(gx - reach, gx + reach + 1):
            for iy in range(gy - reach, gy + reach + 1):
                for j in grid.get((ix, iy), ()):
                    q = pts[j]
                    if (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < (max(r, radii[j]) * 0.92) ** 2:
                        return False
        return True

    def add(p, r):
        pts.append(p); radii.append(r); active.append(len(pts) - 1)
        grid.setdefault((int((p[0] - lo[0]) / cell), int((p[1] - lo[1]) / cell)), []).append(len(pts) - 1)

    # nhiều hạt giống để phủ cả các vùng tách rời
    seeds = rng.uniform(lo, hi, (4000, 2))
    seeds = seeds[point_in_polys(seeds, polys)]
    for s in seeds[:: max(1, len(seeds) // 60)]:
        r = radius_fn(s[0], s[1])
        if np.isfinite(r) and fits(s, r):
            add(s, r)
            while active:
                ai = active[int(rng.integers(len(active)))]
                p0, r0 = pts[ai], radii[ai]
                ok = False
                for _ in range(k):
                    a = rng.uniform(0, 2 * math.pi)
                    d = rng.uniform(r0, 2 * r0)
                    p = np.array([p0[0] + d * math.cos(a), p0[1] + d * math.sin(a)])
                    if not (lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1]):
                        continue
                    if not point_in_polys(p[None], polys)[0]:
                        continue
                    r = radius_fn(p[0], p[1])
                    if not np.isfinite(r):
                        continue
                    if fits(p, r):
                        add(p, r); ok = True
                        break
                if not ok:
                    active.remove(ai)
    return np.array(pts).reshape(-1, 2)


# --------------------------------------------------------------------------- lọc xanh
def blue_filter(c, factor=0.9, zw=0.0):
    """Chấp nhận tham lam theo thứ tự (nét trước, tô sau) nếu đủ xa các điểm đã nhận.
    Khoảng cách đo trên hình chiếu xy (góc nhìn chính); zw > 0 cộng thêm chênh lệch độ sâu (đội hình 3D)."""
    # role 0 (nét) trước, theo prio giảm dần; điểm tô xét theo thứ tự ngẫu nhiên cố định (tránh hoa văn lưới)
    rnd = np.random.default_rng(7).random(len(c))
    key = np.where(c.role == 0, -c.prio, rnd)
    order = np.lexsort((key, c.role))
    cell = max(1e-3, float(np.max(c.rmin)))
    grid = {}
    keep = []
    P = c.pos[:, :2]
    Z = c.pos[:, 2] * zw
    R = c.rmin
    for i in order:
        x, y = P[i]
        gx, gy = int(math.floor(x / cell)), int(math.floor(y / cell))
        ok = True
        for ix in (gx - 1, gx, gx + 1):
            if not ok:
                break
            for iy in (gy - 1, gy, gy + 1):
                for j in grid.get((ix, iy), ()):
                    lim = 0.5 * (R[i] + R[j]) * factor
                    if (P[j, 0] - x) ** 2 + (P[j, 1] - y) ** 2 + (Z[j] - Z[i]) ** 2 < lim * lim:
                        ok = False
                        break
                if not ok:
                    break
        if ok:
            keep.append(i)
            grid.setdefault((gx, gy), []).append(i)
    return c.take(np.array(sorted(keep), dtype=int))


def trim_to(c, N, seed=3):
    """Bỏ bớt điểm thừa: ưu tiên bỏ điểm tô ở nơi dày nhất (khoảng cách láng giềng nhỏ nhất)."""
    from scipy.spatial import cKDTree
    extra = len(c) - N
    if extra <= 0:
        return c
    alive = np.ones(len(c), dtype=bool)
    tree = cKDTree(c.pos[:, :2])
    dd, ii = tree.query(c.pos[:, :2], k=2)
    nn = dd[:, 1]
    # điểm được bỏ trước: role tô, prio thấp, láng giềng gần
    score = nn / np.maximum(c.rmin, 1e-6) + (1 - c.role) * 10 + c.prio * 0.5
    rng = np.random.default_rng(seed)
    score = score + rng.uniform(0, 1e-3, len(score))
    for i in np.argsort(score)[:extra]:
        alive[i] = False
    return c.take(np.nonzero(alive)[0])


def solve_exact(make, N, s0=1.6, iters=14, label="", zw=0.0):
    """Tìm khoảng cách cơ sở s để số điểm sau lọc >= N (sát N), rồi cắt về đúng N.
    Số điểm ~ 1/s^2 nên cập nhật s <- s*sqrt(n/N) hội tụ nhanh; giữ nghiệm tốt nhất có n >= N."""
    best = None
    lo, hi = None, None          # lo: s cho n>=N, hi: s cho n<N
    s = s0
    for _ in range(iters):
        c = blue_filter(make(s), zw=zw)
        n = len(c)
        if n >= N:
            if best is None or n < len(best[1]):
                best = (s, c)
            lo = s if lo is None else max(lo, s)
        else:
            hi = s if hi is None else min(hi, s)
        if best and len(best[1]) - N <= max(2, int(N * 0.006)):
            break
        guess = s * math.sqrt(max(n, 1) / N) * (1.0 if n >= N else 0.995)
        if lo is not None and hi is not None:
            guess = min(max(guess, lo + (hi - lo) * 0.1), hi - (hi - lo) * 0.1)
        s = guess
    if best is None:
        raise RuntimeError(f"{label}: không đạt đủ {N} điểm")
    s, c = best
    extra = len(c) - N
    c = trim_to(c, N)
    print(f"  · {label:<12} N={N:<5} s={s:.3f} m (cắt {extra})")
    return c, s


# --------------------------------------------------------------------------- từ SVG
def svg_maker(path, defaults=None, flip_y=True, fill_factor=1.3, extra=None):
    """Tạo hàm make(s) từ một file SVG thiết kế."""
    shapes, _ = load_svg(path)
    defaults = defaults or {}
    pre = []
    for sh in shapes:
        colS = parse_color(sh.get("data-color")) or parse_color(sh.get("stroke")) or (1, 0.85, 0.5)
        colF = parse_color(sh.get("data-color")) or parse_color(sh.get("fill")) or colS
        pre.append(dict(
            sh=sh, colS=colS, colF=colF,
            bri=sh.fnum("data-bright", defaults.get("bri", 1.0)),
            z=sh.fnum("data-z", 0.0), sp=sh.fnum("data-sp", 1.0), fsp=sh.fnum("data-fsp", 1.0),
            prio=sh.fnum("data-prio", 0.6), grp=gid(sh.get("data-group", defaults.get("group", "main"))),
            p0=sh.fnum("data-p0", 0.0), p1=sh.fnum("data-p1", 0.0),
            dark=sh.get("data-dark") == "1"))
    fill_cache = {}

    def make(s):
        out = []
        for k, d in enumerate(pre):
            sh = d["sh"]
            bri = 0.0 if d["dark"] else d["bri"]
            if sh.mode in ("stroke", "both"):
                for poly, closed in sh.polys:
                    pts, _ = resample(poly, s * d["sp"], closed)
                    out.append(Cand.make(pts, d["colS"], bri, d["grp"], d["prio"], 0, s * d["sp"] * 0.8,
                                         np.tile([d["p0"], d["p1"], 0, 0], (len(pts), 1))))
                    out[-1].pos[:, 2] = d["z"]
            if sh.mode in ("fill", "both"):
                sp = s * fill_factor * d["fsp"]
                key = (k, round(sp, 4))
                if key not in fill_cache:
                    margin = s * 0.55 if sh.mode == "both" else 0.0
                    fill_cache[key] = hex_fill(sh.polys, sp, seed=k + 1, margin=margin)
                pts = fill_cache[key]
                if len(pts):
                    out.append(Cand.make(pts, d["colF"], bri * 0.92, d["grp"], d["prio"] * 0.5, 1, sp * 0.86,
                                         np.tile([d["p0"], d["p1"], 0, 0], (len(pts), 1))))
                    out[-1].pos[:, 2] = d["z"]
        c = Cand.cat(out + ([extra(s)] if extra else []))
        if flip_y:
            c.pos[:, 1] *= -1
        return c
    return make


# --------------------------------------------------------------------------- preview
def preview(c, path, size=(1200, 860), view=(-75, 75, -55, 55), title=None, glow=True):
    """Ảnh xem trước: mỗi drone là một điểm sáng (lõi + quầng) trên nền trời đêm."""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = size
    x0, x1, y0, y1 = view
    img = np.zeros((H, W, 3), dtype=np.float32)
    px = (c.pos[:, 0] - x0) / (x1 - x0) * W
    py = (1 - (c.pos[:, 1] - y0) / (y1 - y0)) * H
    lit = c.bri > 0.01
    rr = np.arange(-4, 5)
    kx, ky = np.meshgrid(rr, rr)
    ker = np.exp(-(kx ** 2 + ky ** 2) / 2.2) * 1.5
    for x, y, col, b in zip(px[lit], py[lit], c.col[lit], c.bri[lit]):
        ix, iy = int(round(x)), int(round(y))
        if 4 <= ix < W - 4 and 4 <= iy < H - 4:
            img[iy - 4:iy + 5, ix - 4:ix + 5] += ker[..., None] * np.asarray(col)[None, None] * b
    base = np.clip(img, 0, 1)
    im = Image.fromarray((base * 255).astype(np.uint8))
    if glow:
        g = im.filter(ImageFilter.GaussianBlur(7))
        im = Image.fromarray(np.clip(np.asarray(im, dtype=np.float32) + np.asarray(g, dtype=np.float32) * 1.4, 0, 255)
                             .astype(np.uint8))
    bg = np.zeros((H, W, 3), dtype=np.float32)
    bg[..., 0] = 4; bg[..., 1] = 7; bg[..., 2] = 18
    im = Image.fromarray(np.clip(np.asarray(im, dtype=np.float32) + bg, 0, 255).astype(np.uint8))
    if title:
        d = ImageDraw.Draw(im)
        d.text((14, 12), title, fill=(200, 200, 210))
    im.save(path, quality=88) if str(path).lower().endswith(".jpg") else im.save(path)

"""
svgflat.py — đọc thiết kế vector (SVG) của Drone Show và chuyển thành các đường gấp khúc (polyline).

Chỉ phụ thuộc thư viện chuẩn + numpy. Hỗ trợ tập con SVG dùng trong các thiết kế:
  <g>, <path> (M L H V C S Q T A Z, tương đối/tuyệt đối), <polyline>, <polygon>, <line>,
  <rect>, <circle>, <ellipse>, <text data-font="stroke"> (font nét đơn tự vẽ, có dấu tiếng Việt).
  transform: translate / scale / rotate / matrix / skewX / skewY.

Thuộc tính ngữ nghĩa cho drone (kế thừa từ <g> cha):
  data-group   tên nhóm chuyển động (vd "scroll", "tank_hull")
  data-mode    "stroke" | "fill" | "both"  (mặc định suy ra từ stroke / fill)
  data-color   màu LED (mặc định = màu stroke hoặc fill)
  data-bright  độ sáng 0..1
  data-z       độ sâu (m, dương = về phía khán giả)
  data-sp      hệ số khoảng cách điểm (<1 = dày hơn, dùng cho chi tiết nhận diện)
  data-fsp     hệ số khoảng cách riêng cho phần tô
  data-prio    ưu tiên 0..1 khi hình thành (1 = đường nét chính, xuất hiện trước)
Toạ độ thiết kế: đơn vị mét, gốc ở tâm đội hình, trục y SVG hướng xuống (sẽ lật khi xuất).
"""
import math
import re
import xml.etree.ElementTree as ET

import numpy as np

SVGNS = "{http://www.w3.org/2000/svg}"

# --------------------------------------------------------------------------- màu
NAMED = {"none": None, "black": "#000000", "white": "#ffffff", "red": "#ff0000", "yellow": "#ffff00",
         "gold": "#ffd700"}


def parse_color(v):
    if v is None:
        return None
    v = v.strip().lower()
    if v in NAMED:
        v = NAMED[v]
        if v is None:
            return None
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)
    m = re.match(r"rgb\(([^)]*)\)", v)
    if m:
        p = [float(x) for x in m.group(1).split(",")]
        return (p[0] / 255.0, p[1] / 255.0, p[2] / 255.0)
    return None


# --------------------------------------------------------------------------- transform
def mat_mul(a, b):
    return a @ b


def parse_transform(s):
    m = np.eye(3)
    if not s:
        return m
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", s):
        a = [float(x) for x in re.split(r"[\s,]+", args.strip()) if x]
        t = np.eye(3)
        if name == "translate":
            t[0, 2] = a[0]
            t[1, 2] = a[1] if len(a) > 1 else 0.0
        elif name == "scale":
            t[0, 0] = a[0]
            t[1, 1] = a[1] if len(a) > 1 else a[0]
        elif name == "rotate":
            r = math.radians(a[0])
            c, s_ = math.cos(r), math.sin(r)
            rot = np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.0]])
            if len(a) == 3:
                tr = np.eye(3); tr[0, 2], tr[1, 2] = a[1], a[2]
                tb = np.eye(3); tb[0, 2], tb[1, 2] = -a[1], -a[2]
                t = tr @ rot @ tb
            else:
                t = rot
        elif name == "matrix":
            t = np.array([[a[0], a[2], a[4]], [a[1], a[3], a[5]], [0, 0, 1.0]])
        elif name == "skewX":
            t[0, 1] = math.tan(math.radians(a[0]))
        elif name == "skewY":
            t[1, 0] = math.tan(math.radians(a[0]))
        m = m @ t
    return m


def apply(m, pts):
    pts = np.asarray(pts, dtype=float)
    if len(pts) == 0:
        return pts.reshape(0, 2)
    h = np.c_[pts, np.ones(len(pts))]
    return (h @ m.T)[:, :2]


# --------------------------------------------------------------------------- path parser
TOK = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)")


def _cubic(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def _quad(p0, p1, p2, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def _arc(p0, rx, ry, phi, large, sweep, p1, tol):
    """SVG arc (endpoint form) -> polyline (bỏ điểm đầu)."""
    if rx == 0 or ry == 0:
        return np.array([p1])
    phi = math.radians(phi)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1 = cp * dx + sp * dy
    y1 = -sp * dx + cp * dy
    rx, ry = abs(rx), abs(ry)
    lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if lam > 1:
        rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        co = -co
    cx1, cy1 = co * rx * y1 / ry, -co * ry * x1 / rx
    cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2
    cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(4, int(abs(dt) * max(rx, ry) / tol))
    ts = t1 + dt * np.linspace(0, 1, n + 1)[1:]
    xs = cx + rx * np.cos(ts) * cp - ry * np.sin(ts) * sp
    ys = cy + rx * np.cos(ts) * sp + ry * np.sin(ts) * cp
    return np.c_[xs, ys]


def parse_path(d, tol=0.05):
    """Trả về list các (polyline Nx2, closed:bool)."""
    toks = [(a, float(b) if b else None) for a, b in TOK.findall(d)]
    toks = [t[0] if t[0] else t[1] for t in toks]
    out, cur, start = [], None, None
    pts = []
    cmd = None
    i = 0
    last_ctrl = None
    pos = np.zeros(2)

    def num():
        nonlocal i
        v = toks[i]; i += 1
        return v

    def seg_n(*ps):
        L = sum(np.linalg.norm(ps[k + 1] - ps[k]) for k in range(len(ps) - 1))
        return max(4, int(L / tol / 4))

    def flush(closed=False):
        nonlocal pts
        if len(pts) > 1:
            out.append((np.array(pts), closed))
        pts = []

    while i < len(toks):
        if isinstance(toks[i], str):
            cmd = toks[i]; i += 1
        elif cmd is None:
            raise ValueError("path bắt đầu bằng số: " + d[:40])
        c = cmd
        rel = c.islower()
        C = c.upper()
        if C == "Z":
            if pts:
                if np.linalg.norm(np.array(pts[-1]) - start) > 1e-9:
                    pts.append(tuple(start))
                flush(True)
            pos = start.copy()
            last_ctrl = None
            if i < len(toks) and not isinstance(toks[i], str):
                cmd = "L" if not rel else "l"
            continue
        if C == "M":
            flush(False)
            p = np.array([num(), num()]) + (pos if rel else 0)
            pos = p; start = p.copy(); pts = [tuple(p)]
            cmd = "l" if rel else "L"
            last_ctrl = None
            continue
        if C == "L":
            p = np.array([num(), num()]) + (pos if rel else 0)
            pts.append(tuple(p)); pos = p; last_ctrl = None
        elif C == "H":
            x = num() + (pos[0] if rel else 0)
            p = np.array([x, pos[1]]); pts.append(tuple(p)); pos = p; last_ctrl = None
        elif C == "V":
            y = num() + (pos[1] if rel else 0)
            p = np.array([pos[0], y]); pts.append(tuple(p)); pos = p; last_ctrl = None
        elif C in "CS":
            if C == "C":
                c1 = np.array([num(), num()]) + (pos if rel else 0)
            elif last_ctrl is not None and last_ctrl[1] == "c":
                c1 = 2 * pos - last_ctrl[0]
            else:
                c1 = pos.copy()
            c2 = np.array([num(), num()]) + (pos if rel else 0)
            p = np.array([num(), num()]) + (pos if rel else 0)
            for q in _cubic(pos, c1, c2, p, seg_n(pos, c1, c2, p)):
                pts.append(tuple(q))
            last_ctrl = (c2, "c"); pos = p
        elif C in "QT":
            if C == "Q":
                c1 = np.array([num(), num()]) + (pos if rel else 0)
            else:
                c1 = 2 * pos - last_ctrl[0] if last_ctrl is not None and last_ctrl[1] == "q" else pos.copy()
            p = np.array([num(), num()]) + (pos if rel else 0)
            for q in _quad(pos, c1, p, seg_n(pos, c1, p)):
                pts.append(tuple(q))
            last_ctrl = (c1, "q"); pos = p
        elif C == "A":
            rx, ry, phi, la, sw = num(), num(), num(), num(), num()
            p = np.array([num(), num()]) + (pos if rel else 0)
            for q in _arc(pos, rx, ry, phi, int(la), int(sw), p, tol):
                pts.append(tuple(q))
            pos = p; last_ctrl = None
        else:
            raise ValueError("lệnh path không hỗ trợ: " + c)
    flush(False)
    return out


# --------------------------------------------------------------------------- font nét đơn
def _oval(cx, cy, rx, ry, a0=0, a1=360, n=24):
    ts = np.radians(np.linspace(a0, a1, n))
    return [(cx + rx * math.cos(t), cy + ry * math.sin(t)) for t in ts]


# Ô chữ rộng 4, cao 6 (y hướng lên). Dấu đặt trên y=6.6.
GLYPHS = {
    "0": [_oval(2, 3, 2, 3, 0, 360, 28)],
    "1": [[(0.8, 4.6), (2.3, 6), (2.3, 0)], [(1.0, 0), (3.6, 0)]],
    "2": [[(0.1, 4.6)] + _oval(2, 4.1, 1.9, 1.9, 160, -40, 12)[1:] + [(0.0, 0.0), (4.0, 0.0)]],
    "3": [_oval(2, 4.5, 1.7, 1.5, 150, -90, 12), _oval(2, 1.6, 1.9, 1.6, 90, -150, 12)],
    "4": [[(3.0, 0), (3.0, 6), (0, 1.7), (4.0, 1.7)]],
    "5": [[(3.8, 6), (0.5, 6), (0.2, 3.4)] + _oval(1.9, 1.9, 2.0, 1.9, 130, -150, 14)[1:]],
    "6": [_oval(2, 1.9, 1.9, 1.9, 0, 360, 20), [(0.1, 2.0), (0.6, 4.5), (2.0, 6.0), (3.4, 5.6)]],
    "7": [[(0, 6), (4, 6), (1.4, 0)]],
    "8": [_oval(2, 4.5, 1.6, 1.5, 0, 360, 18), _oval(2, 1.6, 1.9, 1.6, 0, 360, 20)],
    "9": [_oval(2, 4.1, 1.9, 1.9, 0, 360, 20), [(3.9, 4.0), (3.4, 1.5), (2.0, 0.0), (0.6, 0.4)]],
    "A": [[(0, 0), (2, 6), (4, 0)], [(0.75, 2.2), (3.25, 2.2)]],
    "C": [_oval(2, 3, 2, 3, 48, 312, 20)],
    "E": [[(3.8, 6), (0, 6), (0, 0), (3.8, 0)], [(0, 3.05), (3.0, 3.05)]],
    "G": [_oval(2, 3, 2, 3, 45, 335, 20) + [(4.0, 2.6), (2.3, 2.6)]],
    "H": [[(0, 0), (0, 6)], [(4, 0), (4, 6)], [(0, 3), (4, 3)]],
    "I": [[(2, 0), (2, 6)], [(1.0, 6), (3.0, 6)], [(1.0, 0), (3.0, 0)]],
    "N": [[(0, 0), (0, 6), (4, 0), (4, 6)]],
    "Q": [_oval(2, 3, 2, 3, 0, 360, 28), [(2.5, 1.3), (4.4, -0.6)]],
    "T": [[(0, 6), (4, 6)], [(2, 6), (2, 0)]],
    "U": [[(0, 6), (0, 2)] + _oval(2, 2, 2, 2, 180, 360, 12)[1:] + [(4, 6)]],
    "Y": [[(0, 6), (2, 3), (4, 6)], [(2, 3), (2, 0)]],
    "-": [[(0.6, 3), (3.4, 3)]],
}
MARKS = {
    "circumflex": [[(0.9, 6.8), (2.0, 7.9), (3.1, 6.8)]],
    "acute_hi": [[(3.3, 7.7), (4.3, 9.0)]],     # sắc đặt bên phải dấu mũ (Ế)
    "breve": [_oval(2, 7.7, 1.1, 0.9, 180, 360, 9)],
    "acute_top": [[(2.1, 8.9), (3.1, 10.1)]],  # sắc đặt trên dấu trăng (Ắ)
}
COMPOSED = {"Ế": ("E", ["circumflex", "acute_hi"]), "Ắ": ("A", ["breve", "acute_top"]),
            "Ê": ("E", ["circumflex"]), "Ă": ("A", ["breve"])}
ADV, SPACE = 5.3, 3.4


def text_polylines(text, x, y, size, anchor="middle", tracking=0.0):
    """Trả về polyline (toạ độ SVG, y xuống) cho chuỗi; size = chiều cao chữ hoa."""
    k = size / 6.0
    glyphs = []
    width = 0.0
    for ch in text:
        if ch == " ":
            width += SPACE + tracking
            glyphs.append(None)
            continue
        base, marks = COMPOSED.get(ch, (ch, []))
        if base not in GLYPHS:
            raise KeyError("font chưa có ký tự " + repr(ch))
        strokes = [list(s) for s in GLYPHS[base]]
        for m in marks:
            strokes += [list(s) for s in MARKS[m]]
        glyphs.append((width, strokes))
        width += ADV + tracking
    width -= 1.3 + tracking
    x0 = x - (width * k / 2 if anchor == "middle" else (width * k if anchor == "end" else 0))
    out = []
    for g in glyphs:
        if g is None:
            continue
        ox, strokes = g
        for s in strokes:
            out.append((np.array([(x0 + (ox + px) * k, y - py * k) for px, py in s]), False))
    return out


# --------------------------------------------------------------------------- shapes
def ellipse_poly(cx, cy, rx, ry, tol):
    n = max(12, int(2 * math.pi * max(rx, ry) / tol / 3))
    ts = np.linspace(0, 2 * math.pi, n + 1)
    return np.c_[cx + rx * np.cos(ts), cy + ry * np.sin(ts)]


def num_list(s):
    return [float(v) for v in re.split(r"[\s,]+", s.strip()) if v]


INHERIT = ["data-group", "data-mode", "data-color", "data-bright", "data-z", "data-sp", "data-fsp", "data-prio",
           "fill", "stroke", "data-font", "data-dark", "data-p0", "data-p1", "data-smooth", "data-origin"]


def catmull_rom(p, closed=False, per=10):
    """Làm mượt polyline vẽ tay bằng spline Catmull-Rom (đi qua mọi điểm điều khiển)."""
    p = np.asarray(p, dtype=float)
    if len(p) < 3:
        return p
    if closed:
        if np.linalg.norm(p[0] - p[-1]) < 1e-9:
            p = p[:-1]
        P = np.vstack([p[-1:], p, p[:2]])
        segs = len(p)
    else:
        P = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
        segs = len(p) - 1
    out = []
    t = np.linspace(0, 1, per, endpoint=False)[:, None]
    for i in range(segs):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[segs + 1][None] if not closed else P[1][None])
    return np.vstack(out)


class Shape:
    """Một phần tử thiết kế sau khi làm phẳng."""
    __slots__ = ("polys", "attrs", "mode", "id")

    def __init__(self, polys, attrs, mode, id_):
        self.polys, self.attrs, self.mode, self.id = polys, attrs, mode, id_

    def get(self, k, d=None):
        return self.attrs.get(k, d)

    def fnum(self, k, d):
        v = self.attrs.get(k)
        return float(v) if v not in (None, "") else d


def load_svg(path, tol=0.05):
    tree = ET.parse(path)
    root = tree.getroot()
    shapes = []

    def walk(el, m, attrs):
        tag = el.tag.replace(SVGNS, "")
        a = dict(attrs)
        for k in INHERIT:
            if k in el.attrib:
                a[k] = el.attrib[k]
        style = el.attrib.get("style", "")
        for kv in style.split(";"):
            if ":" in kv:
                k, v = kv.split(":", 1)
                if k.strip() in ("fill", "stroke"):
                    a[k.strip()] = v.strip()
        m2 = m @ parse_transform(el.attrib.get("transform"))
        if el.attrib.get("data-skip") == "1" or tag in ("defs", "image", "title", "desc", "metadata", "style"):
            return
        polys = None
        if tag == "path":
            polys = parse_path(el.attrib["d"], tol)
        elif tag in ("polyline", "polygon"):
            p = np.array(num_list(el.attrib["points"])).reshape(-1, 2)
            if a.get("data-smooth") == "1":
                p = catmull_rom(p, closed=(tag == "polygon"))
            if tag == "polygon":
                p = np.vstack([p, p[:1]])
            polys = [(p, tag == "polygon")]
        elif tag == "line":
            g = lambda k: float(el.attrib.get(k, 0))
            polys = [(np.array([[g("x1"), g("y1")], [g("x2"), g("y2")]]), False)]
        elif tag == "rect":
            x, y = float(el.attrib.get("x", 0)), float(el.attrib.get("y", 0))
            w, h = float(el.attrib["width"]), float(el.attrib["height"])
            polys = [(np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]), True)]
        elif tag == "circle":
            r = float(el.attrib["r"])
            polys = [(ellipse_poly(float(el.attrib.get("cx", 0)), float(el.attrib.get("cy", 0)), r, r, tol), True)]
        elif tag == "ellipse":
            polys = [(ellipse_poly(float(el.attrib.get("cx", 0)), float(el.attrib.get("cy", 0)),
                                   float(el.attrib["rx"]), float(el.attrib["ry"]), tol), True)]
        elif tag == "text":
            if a.get("data-font") == "stroke":
                fs = float(el.attrib.get("font-size", 6))
                polys = text_polylines((el.text or "").strip(), float(el.attrib.get("x", 0)),
                                       float(el.attrib.get("y", 0)), fs * 0.72,
                                       el.attrib.get("text-anchor", "start"),
                                       float(el.attrib.get("data-tracking", 0)))
                a["fill"] = "none"
                if "stroke" not in a or a["stroke"] in (None, "none"):
                    a["stroke"] = el.attrib.get("fill", a.get("data-color", "#ffd34d"))
            else:
                return
        if polys is not None:
            polys = [(apply(m2, p), c) for p, c in polys]
            fill = parse_color(a.get("fill", "#000"))
            stroke = parse_color(a.get("stroke", "none"))
            mode = a.get("data-mode")
            if not mode:
                mode = "both" if (fill and stroke) else ("fill" if fill else "stroke")
            shapes.append(Shape(polys, a, mode, el.attrib.get("id", "")))
        for ch in el:
            walk(ch, m2, a)

    vb = root.attrib.get("viewBox")
    walk(root, np.eye(3), {})
    return shapes, vb


def resample(poly, spacing, closed):
    """Lấy mẫu đều theo chiều dài cung. Đường kín: chia đều cả vòng."""
    d = np.linalg.norm(np.diff(poly, axis=0), axis=1)
    L = float(d.sum())
    if L < 1e-9:
        return poly[:1].copy(), np.zeros(1)
    cum = np.r_[0, np.cumsum(d)]
    if closed:
        n = max(3, int(round(L / spacing)))
        s = np.linspace(0, L, n, endpoint=False)
    else:
        n = max(1, int(round(L / spacing)))
        s = np.linspace(0, L, n + 1)
    x = np.interp(s, cum, poly[:, 0])
    y = np.interp(s, cum, poly[:, 1])
    return np.c_[x, y], s / L


def point_in_polys(pts, polys):
    """Quy tắc even-odd trên mọi vòng kín của phần tử (hỗ trợ lỗ thủng)."""
    inside = np.zeros(len(pts), dtype=bool)
    px, py = pts[:, 0][:, None], pts[:, 1][:, None]
    for poly, _ in polys:
        a = poly[:-1]
        b = poly[1:]
        if np.linalg.norm(poly[0] - poly[-1]) > 1e-6:
            a = np.vstack([a, poly[-1:]]); b = np.vstack([b, poly[:1]])
        ax, ay, bx, by = a[:, 0][None], a[:, 1][None], b[:, 0][None], b[:, 1][None]
        cond = (ay > py) != (by > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = ax + (py - ay) * (bx - ax) / (by - ay)
        cross = cond & (px < xint)
        inside ^= (cross.sum(axis=1) % 2 == 1)
    return inside


def dist_to_polys(pts, polys):
    best = np.full(len(pts), np.inf)
    for poly, _ in polys:
        a, b = poly[:-1], poly[1:]
        ab = b - a
        L2 = np.maximum((ab ** 2).sum(1), 1e-12)
        for k0 in range(0, len(a), 256):
            A, AB, l2 = a[k0:k0 + 256], ab[k0:k0 + 256], L2[k0:k0 + 256]
            ap = pts[:, None, :] - A[None]
            t = np.clip((ap * AB[None]).sum(2) / l2[None], 0, 1)
            q = A[None] + t[..., None] * AB[None]
            d = np.sqrt(((pts[:, None, :] - q) ** 2).sum(2)).min(1)
            best = np.minimum(best, d)
    return best

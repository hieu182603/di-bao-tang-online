"""
scenes.py — Định nghĩa 7 cảnh (keyframe đội hình) và quy tắc ghép drone giữa các cảnh.

Hệ toạ độ sân khấu (stage-local): mét, gốc tại tâm đội hình (cao STAGE_HC so với mặt đất),
x sang phải, y lên, z hướng về phía khán giả. Engine đặt gốc này tại (0, 88, -100) trong thế giới.
"""
import math
import os

import numpy as np

import dronekit as dk
from dronekit import Cand, gid
from svgflat import resample, text_polylines

D = "scripts/drone-show/designs/"
EXTRAS = {}


# =========================================================================== CẢNH 0: bãi cất cánh
def ground_grid(N, hc):
    """4 bãi cất cánh trên mặt đất phía sau bảo tàng (trái xa, trái, phải, phải xa) — drone bay lên thành
    các dải sáng từ nhiều hướng rồi hội tụ. p0 = chỉ số bãi (0..3)."""
    pads = [-78.0, -26.0, 26.0, 78.0]
    per = [N // 4 + (1 if k < N % 4 else 0) for k in range(4)]
    out = []
    for k, (cx, n) in enumerate(zip(pads, per)):
        cols = int(math.ceil(math.sqrt(n)))
        idx = np.arange(n)
        x = cx + ((idx % cols) - (cols - 1) / 2) * 1.5
        z = -16 + ((idx // cols) - (n // cols) / 2) * 1.5
        c = Cand.make(np.c_[x, np.full(n, -hc + 0.25), z], (1.0, 0.75, 0.3), 0.0, gid("ground"), 0.5, 0, 1.0)
        c.prm[:, 0] = k
        out.append(c)
    return Cand.cat(out)


# =========================================================================== CẢNH 1: Vua Lý Thái Tổ
def scroll_text(s):
    """Cột chữ Hán cách điệu trên cuộn chiếu (đọc từ phải sang trái), cột tiêu đề và ấn đỏ."""
    out = []
    g = gid("scroll_text")
    xs = np.arange(37.6, -38.5, -3.1)
    for k, x in enumerate(xs):
        nchar = 4 if k % 5 != 3 else 3
        for j in range(nchar):
            y0 = 3.2 + j * 2.4
            seg = np.array([[x, y0], [x, y0 + 1.3]])
            pts, _ = resample(seg, s * 0.75, False)
            out.append(Cand.make(pts, (1.0, 0.27, 0.16), 0.9, g, 0.4, 0, s * 0.75 * 0.8))
    # cột tiêu đề (lớn, vàng) — "Thiên đô chiếu"
    for j in range(3):
        y0 = 3.0 + j * 3.4
        seg = np.array([[41.4, y0], [41.4, y0 + 2.4]])
        pts, _ = resample(seg, s * 0.6, False)
        out.append(Cand.make(pts, (1.0, 0.82, 0.35), 1.0, g, 0.45, 0, s * 0.6 * 0.8))
    # ấn son đỏ
    sq = np.array([[-42.6, 9.4], [-39.8, 9.4], [-39.8, 12.2], [-42.6, 12.2], [-42.6, 9.4]])
    pts, _ = resample(sq, s * 0.6, True)
    out.append(Cand.make(pts, (1.0, 0.18, 0.12), 1.0, g, 0.45, 0, s * 0.6 * 0.8))
    c = Cand.cat(out)
    c.pos[:, 2] = 5.2
    return c                    # toạ độ SVG (y xuống) — svg_maker lật đồng loạt


def king(N):
    mk = dk.svg_maker(D + "01_ly_thai_to.svg", extra=scroll_text)
    c, s = dk.solve_exact(mk, N, label="king")
    return c, {"view": (-62, 62, -52, 52)}


# =========================================================================== CẢNH 2: Rồng thời Lý
DRAGON_CTRL = [(30 + 0.85 * (x - 30), y) for x, y in [
    (30, 18), (26.5, 10), (26.4, 2), (22, -5), (15, -8.5), (9, -3), (5, 4), (-1, 8), (-7, 3), (-11, -4), (-17, -8),
    (-23, -3), (-27, 4), (-33, 7.5), (-39, 2), (-43, -4), (-49, -6), (-55, -2), (-60, 3), (-66, 4), (-71, 1)]]
HEAD_SCALE, LEG_SCALE = 1.55, 1.2
LEG_U = [(0.15, 2.4), (0.21, -2.4), (0.55, 2.0), (0.61, -2.0)]   # (vị trí gắn trên thân, độ sâu z)


def dragon_spine(shift=(0.0, 0.0), n=257):
    from svgflat import catmull_rom
    ctrl = np.array(DRAGON_CTRL, dtype=float) + np.array(shift)
    p = catmull_rom(ctrl, per=40)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    u = np.linspace(0, 1, n)
    x = np.interp(u * d[-1], d, p[:, 0]); y = np.interp(u * d[-1], d, p[:, 1])
    z = 4.0 * np.sin(2 * np.pi * 1.5 * u)
    return np.c_[x, y, z], d[-1]


def dragon_radius(u):
    return 0.4 + 2.5 * (1 - np.asarray(u)) ** 0.8


def spine_frame(S, u):
    """Điểm, tiếp tuyến T (đầu -> đuôi) và pháp tuyến lưng D (trong mặt xy) tại tham số u."""
    # Cùng công thức với engine (drone-show.js: dragonFrame): tiếp tuyến mẫu Tk = S[k+1]-S[k-1] (chặn biên),
    # nội suy tuyến tính giữa hai mẫu rồi chuẩn hoá trong mặt xy.
    n = len(S) - 1
    k = np.arange(n + 1)
    Tk = S[np.minimum(k + 1, n)] - S[np.maximum(k - 1, 0)]
    f = np.clip(np.asarray(u, dtype=float), 0, 1) * n
    i = np.clip(f.astype(int), 0, n - 1)
    a = (f - i)[:, None]
    P = S[i] * (1 - a) + S[i + 1] * a
    T = Tk[i] * (1 - a) + Tk[i + 1] * a
    T[:, 2] = 0
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    D = np.c_[T[:, 1], -T[:, 0], np.zeros(len(T))]
    return P, T, D


def dragon(N):
    from svgflat import load_svg, parse_color
    shapes, _ = load_svg(D + "02_rong_ly.svg")
    parts = []
    for sh in shapes:
        ox, oy = [float(v) for v in sh.get("data-origin", "0,0").split(",")]
        col = parse_color(sh.get("data-color")) or parse_color(sh.get("stroke")) or (1, 0.8, 0.3)
        for poly, closed in sh.polys:
            g = sh.get("data-group")
            k = LEG_SCALE if g == "dr_leg" else (1.0 if g == "dr_tail" else HEAD_SCALE)
            parts.append(dict(g=g, poly=np.c_[poly[:, 0] - ox, -(poly[:, 1] - oy)] * k, closed=closed,
                              col=col, sp=sh.fnum("data-sp", 1.0), prio=sh.fnum("data-prio", 0.7),
                              bri=sh.fnum("data-bright", 1.0), fill=sh.mode in ("fill", "both")))
    S0, L = dragon_spine()
    # căn giữa khung hình theo hộp bao (thân + đầu + bờm)
    allx = np.r_[S0[:, 0], S0[0, 0] + 24 * HEAD_SCALE, S0[0, 0] - 16 * HEAD_SCALE]
    ally = np.r_[S0[:, 1] - 3, S0[0, 1] + 14.6 * HEAD_SCALE]
    shift = (-(allx.min() + allx.max()) / 2, -(ally.min() + ally.max()) / 2)
    S, L = dragon_spine(shift)
    EXTRAS["dragon"] = {"spine": np.round(S, 3).tolist(), "length": round(float(L), 3),
                        "legs": [[u, z] for u, z in LEG_U]}
    G = {k: gid(k) for k in ("dr_body", "dr_scale", "dr_fin", "dr_leg", "dr_tail", "dr_head", "dr_pearl",
                             "dr_mane", "dr_whisker")}
    GOLD, AMBER, RED = (1.0, 0.76, 0.29), (1.0, 0.6, 0.2), (1.0, 0.42, 0.16)
    uu = np.linspace(0, 1, 3000)

    def on_spine(u, t_off, d_off, z_off):
        P, T, Dd = spine_frame(S, u)
        return P + T * np.asarray(t_off)[:, None] + Dd * np.asarray(d_off)[:, None] + np.c_[0 * u, 0 * u, z_off]

    def make(s):
        out = []
        # 1) đường viền thân (lưng & bụng)
        for side in (1, -1):
            r = dragon_radius(uu)
            line = on_spine(uu, 0 * uu, side * r, 0 * uu)
            pts, frac = resample(line[:, :2], s * 0.85, False)
            cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(line[:, :2], axis=0), axis=1))]
            u_pts = np.interp(frac * cum[-1], cum, uu)
            r2 = dragon_radius(u_pts)
            c = Cand.make(on_spine(u_pts, 0 * u_pts, side * r2, 0 * u_pts), GOLD, 1.0, G["dr_body"], 0.85, 0, s * 0.85 * 0.8)
            c.prm = np.c_[u_pts, 0 * u_pts, side * r2, 0 * u_pts]
            out.append(c)
        # 2) vảy: lưới trên mặt ống 3D (hàng so le), sáng dịu
        step = s * 1.12
        n_u = int(L / step)
        for k in range(n_u):
            u0 = (k + 0.5) / n_u
            r = float(dragon_radius(u0))
            rows = max(1, int(round(2 * r * 0.78 / (s * 1.05))))
            for j in range(rows):
                th = (-1 + (2 * j + 1) / rows) * 1.05          # -60°..60°
                uj = u0 + ((j % 2) * 0.5 / n_u)
                if uj > 0.985:
                    continue
                b = r * math.sin(th) * 0.86
                z = r * math.cos(th)
                c = Cand.make(on_spine(np.array([uj]), [0], [b], [z]), AMBER, 0.55, G["dr_scale"], 0.45, 1, step * 0.82)
                c.prm = np.array([[uj, 0, b, z]])
                out.append(c)
        # 3) vây lưng: các gai lửa nhỏ
        for uf in np.arange(0.06, 0.93, 3.2 / L):
            r = float(dragon_radius(uf))
            h = 1.5 * (1 - 0.5 * uf)
            for (du, dh) in ((0.0, h), (0.45 * 3.2 / L, h * 0.45)):
                c = Cand.make(on_spine(np.array([uf + du]), [0], [r + dh], [0]), RED, 0.9, G["dr_fin"], 0.6, 0, s * 0.7)
                c.prm = np.array([[uf + du, 0, r + dh, 0]])
                out.append(c)
        # 4) chân, đuôi, đầu, bờm, râu, ngọc
        for pt in parts:
            pts, _ = resample(pt["poly"], s * pt["sp"], pt["closed"])
            if pt["fill"] and pt["g"] == "dr_pearl":
                pts = np.vstack([pts, pt["poly"].mean(0)[None]])
            if pt["g"] == "dr_leg":
                for (ul, zl) in LEG_U:
                    r = float(dragon_radius(ul))
                    toff, doff = -pts[:, 0], -(r + (-pts[:, 1]))     # x: về phía đầu = -T ; y-svg xuống = -D
                    c = Cand.make(on_spine(np.full(len(pts), ul), toff, doff, np.full(len(pts), zl)), pt["col"],
                                  pt["bri"], G["dr_leg"], pt["prio"], 0, s * pt["sp"] * 0.8)
                    c.prm = np.c_[np.full(len(pts), ul), toff, doff, np.full(len(pts), zl)]
                    out.append(c)
                continue
            if pt["g"] == "dr_tail":
                toff, doff = pts[:, 0], pts[:, 1]
                c = Cand.make(on_spine(np.ones(len(pts)), toff, doff, 0 * toff), pt["col"], pt["bri"], G["dr_tail"],
                              pt["prio"], 0, s * pt["sp"] * 0.8)
                c.prm = np.c_[np.ones(len(pts)), toff, doff, 0 * toff]
                out.append(c)
                continue
            z = {"dr_pearl": 2.0, "dr_whisker": 1.2, "dr_mane": -1.0}.get(pt["g"], 0.6)
            P = np.c_[S[0, 0] + pts[:, 0], S[0, 1] + pts[:, 1], np.full(len(pts), S[0, 2] + z)]
            c = Cand.make(P, pt["col"], pt["bri"], G[pt["g"]], pt["prio"], 0, s * pt["sp"] * 0.8)
            c.prm = np.c_[np.full(len(pts), -1.0), pts[:, 0], pts[:, 1], np.full(len(pts), z)]
            out.append(c)
        return Cand.cat(out)

    c, s = dk.solve_exact(make, N, s0=1.0, label="dragon", zw=0.6)
    # căn giữa theo hộp bao thật và thu về rộng 118 m (mọi độ dài — spline, bán kính, offset — cùng tỉ lệ)
    lo, hi = c.pos.min(0), c.pos.max(0)
    ctr = np.r_[(lo[:2] + hi[:2]) / 2, 0.0]
    k = min(1.0, 118.0 / (hi[0] - lo[0]))
    c.pos = (c.pos - ctr) * k
    c.prm[:, 1:] *= k
    S2 = (S - ctr) * k
    EXTRAS["dragon"].update({"spine": np.round(S2, 3).tolist(), "length": round(float(L * k), 3), "scale": k})
    return c, {"view": (-62, 62, -40, 40), "params": True,
               "rules": [{"from": ["scroll_paper", "scroll_text", "scroll_roll_l", "scroll_roll_r"],
                          "to": ["dr_body", "dr_scale", "dr_fin"], "penalty": 6000}]}


# =========================================================================== CẢNH 3: Điện Biên Phủ
DB_FLAG_ORIGIN, DB_FLAG_ROT, DB_FLAG_W, DB_FLAG_H = (-3.2, -37.8), 8.8, 40.0, 28.0
DB_PIVOT = (-8.5, -3.6)            # tay dưới của chiến sĩ (toạ độ SVG)


def dien_bien(N):
    c, s = dk.solve_exact(dk.svg_maker(D + "03_dien_bien_phu.svg"), N, s0=1.1, label="dienbien")
    flag = np.isin(c.grp, [gid("db_flag"), gid("db_flag_star"), gid("db_flag_text")])
    # toạ độ cục bộ của lá cờ (u dọc chiều bay, v dọc cán) cho sóng 3D
    px, py = c.pos[:, 0] - DB_FLAG_ORIGIN[0], -c.pos[:, 1] - DB_FLAG_ORIGIN[1]
    a = math.radians(-DB_FLAG_ROT)
    lx = px * math.cos(a) - py * math.sin(a)
    ly = px * math.sin(a) + py * math.cos(a)
    c.prm[:, 0] = np.where(flag, np.clip(lx / DB_FLAG_W, 0, 1), 0)
    c.prm[:, 1] = np.where(flag, np.clip(ly / DB_FLAG_H, 0, 1), 0)
    EXTRAS["dienbien"] = {"pivot": [DB_PIVOT[0], -DB_PIVOT[1]],
                          "flagOrigin": [DB_FLAG_ORIGIN[0], -DB_FLAG_ORIGIN[1]], "flagRot": -DB_FLAG_ROT,
                          "flagW": DB_FLAG_W, "flagH": DB_FLAG_H}
    return c, {"view": (-62, 62, -48, 48), "params": True,
               "rules": [{"from": ["dr_body", "dr_scale", "dr_fin"], "to": ["db_mtn_far", "db_mtn_mid", "db_mtn_near"],
                          "penalty": 3000}]}


# =========================================================================== CẢNH 4: Dinh Độc Lập + xe tăng 390
TANK_K = 4.8                                  # tỉ lệ so với kích thước thật (Type 59: thân 6,04 m)
TANK_START = (-54.0, -30.0, 22.0)             # tâm xe lúc bắt đầu, trên "mặt sân" y = -30, chạy ngang trước hàng rào
TANK_GATE = (0.0, -30.0, 12.0)                # tâm cổng chính
# Quỹ đạo: thẳng sang phải tới x=-9 -> ôm cua 90° bán kính 9 m (tâm -9, 13) -> thẳng qua cổng tới z=-10
TANK_PATH = {"x0": -54.0, "z0": 22.0, "xTurn": -9.0, "r": 9.0, "zEnd": -10.0}
WHEELS = [2.05, 0.95, 0.1, -0.75, -1.6]       # tâm 5 bánh chịu lực (x, m thật) — khe hở giữa bánh 1 và 2
WHEEL_R, WHEEL_Y = 0.415, 0.415


def track_loop(n=160):
    """Biên dạng vòng xích (mặt cắt x-y, m thật): chạy dưới, vòng qua bánh dẫn hướng (trước) và bánh chủ động (sau)."""
    pts = []
    pts += [(x, 0.0) for x in np.linspace(-2.35, 2.45, 30)]
    c, r = (2.85, 0.6), 0.36
    for a in np.linspace(-1.95, 1.5, 14):
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    top = np.linspace(2.85, -2.85, 34)
    pts += [(x, 0.92 - 0.06 * math.cos(math.pi * (x / 2.85)) ** 2 * 0) for x in top]
    c, r = (-2.85, 0.58), 0.34
    for a in np.linspace(1.6, 4.5, 14):
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    p = np.array(pts)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([p, p[:1]]), axis=0), axis=1))]
    s = np.linspace(0, d[-1], n, endpoint=False)
    q = np.vstack([p, p[:1]])
    return np.c_[np.interp(s, d, q[:, 0]), np.interp(s, d, q[:, 1])], float(d[-1])


def tank_parts():
    """Các đường khung 3D của xe tăng (toạ độ cục bộ, m thật; x tiến, y lên, z sang phải = phía khán giả)."""
    P = []  # (group, Nx3, closed, color, sp, prio, bri)
    G, W, Y = (0.45, 1.0, 0.5), (0.9, 0.95, 1.0), (1.0, 0.86, 0.3)

    def add(g, pts, closed=False, col=G, sp=1.0, prio=0.8, bri=1.0):
        P.append((g, np.asarray(pts, dtype=float), closed, col, sp, prio, bri))
    zd, zf = 1.36, 1.64
    for sz in (-1, 1):
        far = sz < 0
        b = 0.3 if far else 1.0
        add("tank_hull", [(-3.0, 1.55, sz * zd), (2.2, 1.55, sz * zd), (3.05, 0.78, sz * zd), (2.75, 0.5, sz * zd)], bri=b)
        add("tank_hull", [(-3.1, 1.08, sz * zf), (3.0, 1.08, sz * zf), (3.25, 0.86, sz * zf)], bri=0.85 * b)
        add("tank_hull", [(-3.0, 1.55, sz * zd), (-3.0, 0.8, sz * zd)], bri=b)
    add("tank_hull", [(2.2, 1.55, -zd), (2.2, 1.55, zd)])
    add("tank_hull", [(3.05, 0.78, -zd), (3.05, 0.78, zd)])
    add("tank_hull", [(-3.0, 1.55, -zd), (-3.0, 1.55, zd)], bri=0.8)
    add("tank_hull", [(-3.0, 0.8, -zd), (-3.0, 0.8, zd)], bri=0.6)
    # thùng dầu phụ trên chắn bùn phải (đặc trưng T-54/Type 59)
    for x0 in (-2.4, -1.2):
        add("tank_hull", [(x0, 1.08, 1.5), (x0 + 0.95, 1.08, 1.5), (x0 + 0.95, 1.42, 1.5), (x0, 1.42, 1.5)], True, sp=0.8, bri=0.7)
    # tháp pháo vòm
    tc = (0.75, 1.55)
    for h in (0.0, 0.45, 0.8):
        r = 1.15 * math.sqrt(1 - h * h)
        ring = [(tc[0] + r * math.cos(t), tc[1] + 0.85 * h, r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 48)]
        add("tank_turret", ring, True, sp=0.9 if h == 0 else 1.0, bri=1.0 if h == 0 else 0.8)
    # một đường kinh tuyến trước–sau (dáng vòm "chảo rán" nhìn từ cạnh) thay cho cả bó kinh tuyến gây rối
    mer = [(tc[0] + 1.15 * math.cos(a), tc[1] + 0.85 * math.sin(a), 0.0) for a in np.linspace(0, math.pi, 16)]
    add("tank_turret", mer, sp=0.9, bri=0.85)
    for (cz, cx) in ((-0.45, 0.35), (0.5, 0.35)):
        ring = [(cx + 0.32 * math.cos(t), 2.36, cz + 0.32 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 16)]
        add("tank_turret", ring, True, col=W, sp=0.7, bri=0.85)
    # nòng pháo 100 mm: thân nòng, bộ hút khói, loa nòng
    add("tank_gun", [(1.75, 1.95, 0.0), (6.35, 1.95, 0.0)], col=W, sp=0.75)
    add("tank_gun", [(1.75, 2.08, 0.0), (5.6, 2.03, 0.0)], col=W, sp=0.9, bri=0.6)
    for (x, r) in ((5.75, 0.19), (6.35, 0.13)):
        ring = [(x, 1.95 + r * math.cos(t), r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 12)]
        add("tank_gun", ring, True, col=W, sp=0.45)
    # bánh chịu lực (mặt ngoài, phía khán giả) + nan để thấy quay
    for x in WHEELS:
        ring = [(x + WHEEL_R * math.cos(t), WHEEL_Y + WHEEL_R * math.sin(t), zf) for t in np.linspace(0, 2 * math.pi, 24)]
        add("tank_wheel", ring, True, col=W, sp=0.6, prio=0.7)
        for a0 in (0.3, 0.3 + math.pi / 2):
            spoke = [(x + 0.32 * math.cos(a0), WHEEL_Y + 0.32 * math.sin(a0), zf),
                     (x - 0.32 * math.cos(a0), WHEEL_Y - 0.32 * math.sin(a0), zf)]
            add("tank_wheel", spoke, col=(1.0, 0.8, 0.4), sp=0.5, prio=0.6, bri=0.9)
    return P


def tank_number():
    """Số hiệu 390 trên hông phải tháp pháo (phóng to so với thật để đọc được bằng drone)."""
    out = []
    for poly, _ in text_polylines("390", 0.55, 0.0, 0.72, "middle"):
        out.append(np.c_[poly[:, 0], 1.62 - poly[:, 1], np.full(len(poly), 1.2)])   # hông tháp pháo, mặt phẳng z=1.2
    return out


def palace_tank(N):
    loop, loopL = track_loop()
    yaw = 0.0                                  # tư thế nghỉ: hướng +x, hông phải (có số 390) quay về khán giả
    cy, sy = math.cos(yaw), math.sin(yaw)
    EXTRAS["tank"] = {"k": TANK_K, "start": list(TANK_START), "gate": list(TANK_GATE), "yaw": yaw, "path": TANK_PATH,
                      "loop": np.round(loop, 4).tolist(), "loopLen": loopL, "wheels": WHEELS,
                      "wheelR": WHEEL_R, "wheelY": WHEEL_Y, "gateZ": 12.0}
    gcode = {"tank_hull": 0, "tank_turret": 0, "tank_gun": 0, "tank_num": 0}
    parts = tank_parts()

    def to_stage(L):
        L = np.asarray(L) * TANK_K
        x = TANK_START[0] + L[:, 0] * cy + L[:, 2] * sy
        z = TANK_START[2] - L[:, 0] * sy + L[:, 2] * cy
        return np.c_[x, TANK_START[1] + L[:, 1], z]

    def tank_cands(s):
        out = []
        for g, pts, closed, col, sp, prio, bri in parts:
            seg = pts * TANK_K
            q, frac = resample3(seg, s * sp, closed)
            loc = q / TANK_K
            c = Cand.make(to_stage(loc), col, bri, gid(g), prio, 0, s * sp * 0.8)
            c.prm = np.c_[np.zeros(len(loc)), loc]
            if g == "tank_wheel":
                wi = np.argmin(np.abs(np.array(WHEELS)[None, :] - loc[:, :1]), axis=1)
                c.prm[:, 0] = 1 + wi                       # p0 = 1..5: chỉ số bánh để quay
            out.append(c)
        # xích: hai vòng (gần sáng, xa mờ) — p0 = 10 + tham số vòng (0..1) để điểm chạy dọc xích
        for sz, b in ((1.64, 1.0), (-1.64, 0.3)):
            n = max(8, int(loopL * TANK_K / (s * 0.75)))
            u = np.arange(n) / n
            idx = (u * len(loop)).astype(int)
            loc = np.c_[loop[idx, 0], loop[idx, 1], np.full(n, sz)]
            c = Cand.make(to_stage(loc), (0.85, 0.88, 1.0), b, gid("tank_track"), 0.75, 0, s * 0.75 * 0.8)
            c.prm = np.c_[10 + u, loc]
            out.append(c)
        if N >= 1200:
            for poly in tank_number():
                q, _ = resample3(poly * TANK_K, s * 0.5, False)
                loc = q / TANK_K
                c = Cand.make(to_stage(loc), (1.0, 0.92, 0.55), 1.0, gid("tank_num"), 0.7, 0, s * 0.5 * 0.8)
                c.prm = np.c_[np.zeros(len(loc)), loc]
                out.append(c)
        c = Cand.cat(out)
        c.pos[:, 1] *= -1        # svg_maker lật y sau cùng -> trả về theo quy ước SVG
        return c

    mk = dk.svg_maker(D + "04_dinh_doc_lap.svg", extra=tank_cands)

    def make(s):
        c = mk(s)
        return c
    c, s = dk.solve_exact(make, N, s0=1.1, label="palace+tank", zw=1.0)
    gl, gr = gid("gate_l"), gid("gate_r")
    side = np.where(c.grp == gl, -1.0, np.where(c.grp == gr, 1.0, 0.0))
    gate = side != 0
    c.prm[gate, 0] = side[gate] * 7.2          # p0 = toạ độ x bản lề
    return c, {"view": (-62, 62, -44, 44), "params": True,
               "rules": [{"from": ["db_mtn_far", "db_mtn_mid", "db_mtn_near", "db_bunker"],
                          "to": ["pal_struct", "pal_curtain", "fence", "pal_ground"], "penalty": 2500}]}


def resample3(poly, spacing, closed):
    d = np.linalg.norm(np.diff(poly, axis=0), axis=1)
    if closed:
        d = np.r_[d, np.linalg.norm(poly[0] - poly[-1])]
        poly = np.vstack([poly, poly[:1]])
    cum = np.r_[0, np.cumsum(d)]
    L = cum[-1]
    if L < 1e-9:
        return poly[:1], np.zeros(1)
    n = max(2 if not closed else 3, int(round(L / spacing)) + (0 if closed else 1))
    s = np.linspace(0, L, n, endpoint=not closed)
    return np.c_[[np.interp(s, cum, poly[:, k]) for k in range(3)]].T, s / L


# =========================================================================== CẢNH 6: trống đồng + chim Lạc
BIRD_POS = (6.0, 12.0, 12.0)       # tâm chim Lạc lớn (stage), bay phía trước mặt trống


def drum(N):
    c, s = dk.solve_exact(dk.svg_maker(D + "06_trong_dong.svg"), N, s0=1.0, label="drum")
    r = np.hypot(c.pos[:, 0], c.pos[:, 1])
    c.prm[:, 0] = r
    c.prm[:, 1] = np.arctan2(c.pos[:, 1], c.pos[:, 0])
    return c, {"view": (-48, 48, -48, 48), "params": True}


def drum_bird(drum_c, N):
    """Keyframe 'drum_bird' dựng theo đúng thứ tự drone của keyframe trống: phần lớn drone giữ nguyên chỗ
    trên mặt trống; vành chim bay + các vành ngoài cùng tách ra ghép thành chim Lạc lớn."""
    from scipy.optimize import linear_sum_assignment
    B = int(round(N * 0.40))
    mk = dk.svg_maker(D + "06_chim_lac.svg")
    bird, s = dk.solve_exact(mk, B, s0=0.9, label="lac_bird")
    pb = bird.pos.copy()
    pb[:, :2] -= (pb[:, :2].min(0) + pb[:, :2].max(0)) / 2
    pb += np.array(BIRD_POS)
    bird.pos = pb
    # p0,p1 = toạ độ cục bộ (dọc thân, ngang thân) cho vỗ cánh
    bird.prm[:, 0] = pb[:, 0] - BIRD_POS[0]
    bird.prm[:, 1] = pb[:, 1] - BIRD_POS[1]
    r = np.hypot(drum_c.pos[:, 0], drum_c.pos[:, 1])
    is_b = drum_c.grp == gid("drum_bird")
    order = np.lexsort((-r, ~is_b))
    leave = order[:B]
    cost = ((drum_c.pos[leave][:, None, :] - bird.pos[None, :, :]) ** 2).sum(-1)
    ri, ci = linear_sum_assignment(cost)
    out = drum_c.take(np.arange(N))
    for f in Cand.FIELDS:
        getattr(out, f)[leave[ri]] = getattr(bird, f)[ci]
    EXTRAS["bird"] = {"center": list(BIRD_POS)}
    return out, {"view": (-48, 48, -48, 48), "params": True, "derived": True}


# =========================================================================== CẢNH 5, 7
def portrait_kf(N):
    c, s = dk.solve_exact(__import__("portrait").make_portrait(), N, label="portrait")
    return c, {"view": (-40, 40, -48, 48)}


def flag_vn(N):
    c, s = dk.solve_exact(dk.svg_maker(D + "07_quoc_ky.svg"), N, label="flag")
    # p0,p1 = toạ độ chuẩn hoá (u: 0 ở cán cờ -> 1 ở đuôi cờ; v: 0 trên -> 1 dưới) cho sóng 3D
    c.prm[:, 0] = (c.pos[:, 0] + 48) / 96
    c.prm[:, 1] = (32 - c.pos[:, 1]) / 64
    return c, {"view": (-60, 60, -42, 42), "params": True}


def build_all(N, hc):
    kfs = []
    kfs.append(("ground", ground_grid(N, hc), {"view": (-75, 75, -100, 20), "params": True}))
    c, m = king(N); kfs.append(("king", c, m))
    c, m = dragon(N); kfs.append(("dragon", c, m))
    c, m = dien_bien(N); kfs.append(("dienbien", c, m))
    c, m = palace_tank(N); kfs.append(("palace", c, m))
    c, m = portrait_kf(N); kfs.append(("portrait", c, m))
    c, m = drum(N); kfs.append(("drum", c, m))
    kfs.append(("drum_bird", None, {"derive": "drum_bird"}))
    c, m = flag_vn(N); kfs.append(("flag", c, m))
    return kfs


# =========================================================================== GHÉP ĐỘI HÌNH
def assign_chain(kfs):
    """Ghép drone giữa các keyframe liên tiếp bằng thuật toán Hungarian (scipy linear_sum_assignment,
    chi phí = bình phương khoảng cách 3D + phạt theo quy tắc nhóm). Keyframe sau được sắp lại thứ tự
    sao cho phần tử i luôn là cùng một drone (ID ổn định)."""
    from scipy.optimize import linear_sum_assignment
    out = [kfs[0]]
    prev = kfs[0][1]
    for kid, c, meta in kfs[1:]:
        if meta.get("derive") == "drum_bird":   # dựng theo đúng thứ tự drone của keyframe trước
            c, meta = drum_bird(prev, len(prev))
            out.append((kid, c, meta)); prev = c; continue
        A, B = prev.pos, c.pos
        cost = ((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)
        for rule in meta.get("rules", []):
            src = np.isin(prev.grp, [gid(g) for g in rule["from"]])
            dst = np.isin(c.grp, [gid(g) for g in rule["to"]])
            cost += rule.get("penalty", 4e4) * (src[:, None] ^ dst[None, :])
        r, col = linear_sum_assignment(cost)
        perm = np.empty(len(r), dtype=int)
        perm[r] = col
        c2 = c.take(perm)
        d = np.sqrt(((A - c2.pos) ** 2).sum(1))
        print(f"  · ghép -> {kid:<10} quãng bay TB {d.mean():6.1f} m, max {d.max():6.1f} m")
        out.append((kid, c2, meta))
        prev = c2
    return out


def export_tank_svg(path=D + "04_xe_tang_390.svg"):
    """Bản vẽ hình chiếu cạnh (phía khán giả) của mô hình khung 3D xe tăng 390 — tài liệu thiết kế."""
    k = 10.0
    lines = []
    for g, pts, closed, col, sp, prio, bri in tank_parts():
        if bri < 0.5:
            continue                                    # bỏ các đường phía xa
        q = np.vstack([pts, pts[:1]]) if closed else pts
        c = "#%02x%02x%02x" % tuple(int(v * 255) for v in col)
        lines.append(f'    <polyline points="{" ".join(f"{x * k:.1f},{-y * k:.1f}" for x, y, _ in q)}" stroke="{c}" data-group="{g}"/>')
    loop, _ = track_loop()
    lines.append(f'    <polygon points="{" ".join(f"{x * k:.1f},{-y * k:.1f}" for x, y in loop)}" stroke="#d8e0ff" data-group="tank_track"/>')
    for poly in tank_number():
        lines.append(f'    <polyline points="{" ".join(f"{x * k:.1f},{-y * k:.1f}" for x, y, _ in poly)}" stroke="#ffeb8c" data-group="tank_num"/>')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -30 115 40" width="1150" height="400">\n'
           '  <title>Cảnh 4 — Xe tăng 390 (Type 59): hình chiếu cạnh của mô hình khung 3D</title>\n'
           '  <desc>Sinh tự động từ scenes.tank_parts() (đơn vị 1/10 m, kích thước thật Type 59/T-54: thân 6,04 m, '
           'rộng 3,27 m, cao 2,59 m; 5 bánh chịu lực, khe hở giữa bánh 1–2; tháp pháo vòm; pháo 100 mm có bộ hút khói; '
           'thùng dầu phụ trên chắn bùn phải). Trong show, mô hình phóng ×4,8 và là đội hình 3D thật: xích chạy vòng, '
           'bánh quay, xe ôm cua 90° rồi húc qua cổng. Số hiệu 390 phóng to so với thật để đọc được bằng drone.</desc>\n'
           '  <rect x="-40" y="-30" width="115" height="40" fill="#050814"/>\n  <g fill="none" stroke-width="0.6">\n'
           + "\n".join(lines) + "\n  </g>\n</svg>\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)

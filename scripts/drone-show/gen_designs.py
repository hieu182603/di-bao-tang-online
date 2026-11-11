"""
gen_designs.py — Sinh các file thiết kế SVG có nhiều chi tiết lặp lại (đo đạc chính xác bằng code):
  designs/04_dinh_doc_lap.svg   mặt tiền Dinh Độc Lập + cổng chính + hàng rào (cách điệu)
  designs/04_xe_tang_390.svg    hình chiếu cạnh xe tăng 390 (tài liệu; đội hình dùng mô hình 3D trong scenes.py)
  designs/06_trong_dong.svg     mặt trống đồng (theo trống Ngọc Lũ, cách điệu) + vành chim Lạc
  designs/06_chim_lac.svg       chim Lạc dang cánh
Chạy: python scripts/drone-show/gen_designs.py
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DES = os.path.join(HERE, "designs")


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def pts(p):
    return " ".join(f"{f(x)},{f(y)}" for x, y in p)


def svg(view, title, desc, body):
    x, y, w, h = view
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{int(w * 10)}" height="{int(h * 10)}">\n'
            f'  <title>{title}</title>\n  <desc>{desc}</desc>\n'
            f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#050814" data-skip="1"/>\n{body}\n</svg>\n')


# =========================================================================== DINH ĐỘC LẬP
def palace():
    L = []
    a = L.append
    a('  <g fill="none" stroke-width="0.35">')
    # --- khối nhà (z = -14)
    a('    <g data-group="pal_struct" data-z="-14" stroke="#e8f0ff" data-prio="0.9" data-sp="0.95">')
    a(f'      <polyline points="{pts([(-50, -22), (50, -22)])}"/>')                     # mái đua (canopy)
    a(f'      <polyline points="{pts([(-50, -23.6), (50, -23.6)])}"/>')
    a(f'      <polyline points="{pts([(-50, -23.6), (-50, -22)])}"/><polyline points="{pts([(50, -23.6), (50, -22)])}"/>')
    a(f'      <polyline points="{pts([(-46, -22), (-46, 11.5)])}"/><polyline points="{pts([(46, -22), (46, 11.5)])}"/>')
    for y in (-12.5, -2.5):                                                             # sàn tầng
        a(f'      <polyline points="{pts([(-47.5, y), (47.5, y)])}" data-bright="0.85"/>')
    a(f'      <polyline points="{pts([(-48, 11.5), (48, 11.5), (48, 14), (-48, 14), (-48, 11.5)])}"/>')   # bệ
    a(f'      <polyline points="{pts([(-11, -23.6), (-11, -27), (11, -27), (11, -23.6)])}"/>')            # khối sân thượng
    a('    </g>')
    # --- rèm hoa đá: các thanh đứng có đốt (mành trúc cách điệu), hai tầng
    a('    <g data-group="pal_curtain" data-z="-13" stroke="#cfe0ff" data-prio="0.7" data-sp="0.9" data-bright="0.8">')
    xs = [x for x in [-43.7 + 2.3 * i for i in range(39)] if abs(x) > 9.6]
    for (y0, y1) in ((-21.4, -13.1), (-11.9, -3.1)):
        for x in xs:
            # mỗi thanh = 3 đốt
            hseg = (y1 - y0) / 3
            for k in range(3):
                a(f'      <polyline points="{pts([(x, y0 + k * hseg + 0.35), (x, y0 + (k + 1) * hseg - 0.35)])}"/>')
    a('    </g>')
    # --- khoang giữa: kính + khung
    a('    <g data-group="pal_struct" data-z="-12" stroke="#ffe7b0" data-prio="0.75" data-sp="0.9" data-bright="0.85">')
    a(f'      <polyline points="{pts([(-9, -22), (-9, -2.5)])}"/><polyline points="{pts([(9, -22), (9, -2.5)])}"/>')
    for y in (-18, -16, -8.5, -6.5):
        a(f'      <polyline points="{pts([(-9, y), (9, y)])}" data-bright="0.55"/>')
    a('    </g>')
    # --- tầng trệt: cột + sảnh, mái hiên lối vào
    a('    <g data-group="pal_struct" data-z="-14" stroke="#e8f0ff" data-prio="0.65" data-sp="1.0" data-bright="0.75">')
    for x in [-40, -32, -24, -16, 16, 24, 32, 40]:
        a(f'      <polyline points="{pts([(x, -2.5), (x, 11.5)])}"/>')
    a(f'      <polyline points="{pts([(-12, 1.5), (12, 1.5)])}" stroke="#ffe7b0" data-bright="0.95"/>')
    a(f'      <polyline points="{pts([(-12, 1.5), (-12, 11.5)])}"/><polyline points="{pts([(12, 1.5), (12, 11.5)])}"/>')
    a('    </g>')
    # --- bậc thềm + hai hồ sen bán nguyệt
    a('    <g data-group="pal_ground" data-z="-6" stroke="#ffd36a" data-prio="0.6" data-sp="0.95" data-bright="0.8">')
    for k, y in enumerate((15, 16.6, 18.2)):
        w = 9 + k * 1.2
        a(f'      <polyline points="{pts([(-w, y), (w, y)])}"/>')
    for sx in (-1, 1):
        arc = [(sx * 19 + 5 * math.cos(t), 15.5 + 4 * math.sin(t)) for t in [i * math.pi / 14 for i in range(15)]]
        a(f'      <polyline points="{pts(arc)}" stroke="#7fd4ff"/>')
    a('    </g>')
    # --- cột cờ trên nóc + lá cờ Mặt trận (hiện lúc cuối cảnh)
    a('    <g data-group="pal_pole" data-z="-14" stroke="#ffd36a" data-prio="0.6" data-sp="0.7">')
    a(f'      <polyline points="{pts([(0, -27), (0, -38)])}"/>')
    a('    </g>')
    a('    <g data-group="pal_flag_r" data-z="-14" data-prio="0.3">')
    a(f'      <polygon points="{pts([(0.4, -38), (9.4, -38), (9.4, -35), (0.4, -35)])}" fill="#ff2c1c" stroke="#ff2c1c" data-sp="0.7" data-fsp="0.75"/>')
    a('    </g>')
    a('    <g data-group="pal_flag_b" data-z="-14" data-prio="0.3">')
    a(f'      <polygon points="{pts([(0.4, -35), (9.4, -35), (9.4, -32), (0.4, -32)])}" fill="#2a7dff" stroke="#2a7dff" data-sp="0.7" data-fsp="0.75"/>')
    a('    </g>')
    star = []
    for k in range(10):
        r = 1.35 if k % 2 == 0 else 0.52
        t = math.radians(-90 + 36 * k)
        star.append((4.9 + r * math.cos(t), -35 + r * math.sin(t)))
    a(f'    <g data-group="pal_flag_s" data-z="-13.6" data-prio="0.3"><polygon points="{pts(star)}" stroke="#ffd61e" fill="none" data-sp="0.45"/></g>')
    # --- cổng chính + hàng rào (z = +12)
    a('    <g data-group="gate_post" data-z="12" stroke="#fff0d0" data-prio="0.85" data-sp="0.75">')
    for sx in (-1, 1):
        x0, x1 = sx * 7.2, sx * 8.8
        a(f'      <polyline points="{pts([(x0, 30), (x0, 21), (x1, 21), (x1, 30)])}"/>')
        a(f'      <polyline points="{pts([(x0 - 0.3 * sx, 21), (sx * 8.0, 19.8), (x1 + 0.3 * sx, 21)])}"/>')
    a('    </g>')
    a('    <g data-group="fence" data-z="12" stroke="#c8d6f0" data-prio="0.6" data-sp="1.0" data-bright="0.75">')
    for sx in (-1, 1):
        a(f'      <polyline points="{pts([(sx * 8.8, 25.2), (sx * 52, 25.2)])}"/>')
        a(f'      <polyline points="{pts([(sx * 8.8, 29.8), (sx * 52, 29.8)])}"/>')
        for k in range(1, 20):
            x = sx * (8.8 + 2.25 * k)
            top = 23.6 if k % 5 == 0 else 25.2
            a(f'      <polyline points="{pts([(x, top), (x, 29.8)])}"/>')
    a('    </g>')
    for side, grp in ((-1, "gate_l"), (1, "gate_r")):
        hx = side * 7.2
        a(f'    <g data-group="{grp}" data-z="12" stroke="#ffd36a" data-prio="0.8" data-sp="0.8" data-p0="{hx}">')
        xin = side * 0.2
        a(f'      <polyline points="{pts([(hx, 23.2), (xin, 23.2), (xin, 30), (hx, 30)])}"/>')
        a(f'      <polyline points="{pts([(hx, 26.6), (xin, 26.6)])}" data-bright="0.7"/>')
        for k in range(1, 6):
            x = hx + (xin - hx) * k / 6
            a(f'      <polyline points="{pts([(x, 23.2), (x, 30)])}" data-bright="0.65"/>')
        arc = [(hx + (xin - hx) * (i / 10), 23.2 - 1.2 * math.sin(math.pi * i / 10)) for i in range(11)]
        a(f'      <polyline points="{pts(arc)}"/>')
        a('    </g>')
    a('  </g>')
    return svg((-60, -42, 120, 80), "Cảnh 4 — Dinh Độc Lập, cổng chính (30/4/1975)",
               "Cách điệu mặt tiền Dinh Độc Lập (KTS Ngô Viết Thụ, 1962–1966): mái đua dài, hai tầng 'rèm hoa đá' "
               "cách điệu đốt mành trúc, khoang kính giữa, tầng trệt có cột, sảnh có mái hiên, bậc thềm, hai hồ sen "
               "bán nguyệt, khối sân thượng với cột cờ. Phía trước (z=+12): cổng chính hai cánh + hàng rào song sắt. "
               "Hai cánh cổng là nhóm riêng (gate_l / gate_r, data-p0 = toạ độ bản lề) để engine quay mở trong 3D. "
               "Lá cờ trên nóc được engine giữ tắt đèn cho tới cuối cảnh (76–78 s). Không sao chép ảnh hay thiết kế drone có sẵn.",
               "\n".join(L))


# =========================================================================== TRỐNG ĐỒNG + CHIM LẠC
def bird_shape(scale=1.0, cx=0.0, cy=0.0, rot=0.0):
    """Chim Lạc bay (nhìn từ trên xuống thân/cánh, đầu nhìn nghiêng — đúng lối khắc trên trống):
    mỏ dài, mào, cổ dài, cánh dang, đuôi dài. Trả về các polyline toạ độ cục bộ (đầu hướng +x)."""
    P = [
        [(-6.0, 0.0), (-3.0, 0.4), (0.0, 0.5), (2.6, 0.3), (4.2, 0.0), (5.0, -0.5), (5.6, -0.4), (9.6, 0.2)],   # thân + cổ + mỏ dài
        [(4.4, -0.6), (4.0, -1.8), (4.8, -1.6)],                                                               # mào
        [(0.6, 0.3), (-0.6, 3.2), (-2.8, 5.4), (-4.4, 6.0)],                                                  # cánh trên
        [(0.6, -0.1), (-0.6, -3.0), (-2.8, -5.2), (-4.4, -5.8)],                                              # cánh dưới
        [(-6.0, 0.0), (-8.6, 1.2), (-10.4, 2.4)], [(-6.0, 0.0), (-8.8, -0.4), (-10.8, -0.8)],                  # đuôi dài
    ]
    c, s = math.cos(rot), math.sin(rot)
    return [[(cx + scale * (x * c - y * s), cy + scale * (x * s + y * c)) for x, y in p] for p in P]


def drum():
    L = []
    a = L.append
    a('  <g fill="none" stroke-width="0.3">')
    # Ngôi sao 14 cánh ở tâm (tô dày, sáng nhất) + tam giác (lông công cách điệu) xen giữa các cánh
    star = []
    for k in range(28):
        r = 10.4 if k % 2 == 0 else 4.3
        t = math.radians(90 + k * 360 / 28)
        star.append((r * math.cos(t), -r * math.sin(t)))
    a(f'    <g data-group="drum_star" stroke="#ffe08a" data-prio="1" data-sp="0.5"><polygon points="{pts(star)}" fill="#ffd36a" data-fsp="0.62"/></g>')
    a('    <g data-group="drum_star" stroke="#ff9a2a" data-prio="0.8" data-sp="0.6" data-bright="0.8">')
    for k in range(14):
        t = math.radians(90 + (k + 0.5) * 360 / 14)
        tri = [(5.8 * math.cos(t - 0.1), -5.8 * math.sin(t - 0.1)), (9.6 * math.cos(t), -9.6 * math.sin(t)),
               (5.8 * math.cos(t + 0.1), -5.8 * math.sin(t + 0.1))]
        a(f'      <polyline points="{pts(tri)}"/>')
    a('    </g>')

    def ring(r, grp, col, sp=0.85, bri=0.85, prio=0.7):
        circ = [(r * math.cos(t), r * math.sin(t)) for t in [i * 2 * math.pi / 120 for i in range(121)]]
        a(f'    <g data-group="{grp}" stroke="{col}" data-sp="{sp}" data-bright="{bri}" data-prio="{prio}"><polyline points="{pts(circ)}"/></g>')

    # Các dải hoa văn đồng tâm (rút gọn từ trống Ngọc Lũ, có khoảng tối xen giữa để mắt phân biệt từng dải)
    ring(12.2, "drum_ring", "#ffc34a")
    a('    <g data-group="drum_ring" stroke="#ffb03a" data-sp="0.6" data-bright="0.85" data-prio="0.65">')   # vòng tròn tiếp tuyến
    for k in range(18):
        t = 2 * math.pi * k / 18
        a(f'      <circle cx="{f(14.6 * math.cos(t))}" cy="{f(14.6 * math.sin(t))}" r="1.55"/>')
    a('    </g>')
    ring(17.0, "drum_ring", "#ffc34a")
    # dải người hoá trang lông chim (diễu hành ngược chiều kim đồng hồ)
    a('    <g data-group="drum_fig" stroke="#fff0d0" data-sp="0.55" data-bright="0.85" data-prio="0.5">')
    for k in range(14):
        t = 2 * math.pi * k / 14
        cx, cy = 21.2 * math.cos(t), 21.2 * math.sin(t)
        ux, uy = math.cos(t), math.sin(t)
        vx, vy = -uy, ux
        P = lambda du, dv: (cx + du * ux + dv * vx, cy + du * uy + dv * vy)
        a(f'      <polyline points="{pts([P(-2.2, 0.4), P(-0.6, 0), P(1.0, 0.2)])}"/>')                 # thân + chân
        a(f'      <polyline points="{pts([P(-2.2, -0.9), P(-0.6, 0)])}"/>')
        a(f'      <polyline points="{pts([P(1.0, 0.2), P(2.6, -1.4), P(3.2, -2.6)])}"/>')                # mũ lông chim xoè
        a(f'      <polyline points="{pts([P(1.0, 0.2), P(2.9, 0.0)])}"/>')
        a(f'      <polyline points="{pts([P(0.2, 0.1), P(0.9, 1.6)])}"/>')                              # tay
    a('    </g>')
    ring(25.2, "drum_ring", "#ffc34a")
    a('    <g data-group="drum_ring" stroke="#ffe08a" data-sp="0.5" data-bright="0.75" data-prio="0.45">')   # hàng chấm
    for k in range(44):
        t = 2 * math.pi * k / 44
        a(f'      <circle cx="{f(27.0 * math.cos(t))}" cy="{f(27.0 * math.sin(t))}" r="0.12"/>')
    a('    </g>')
    ring(28.8, "drum_ring", "#ffc34a")
    # VÀNH CHIM LẠC BAY (18 con, ngược chiều kim đồng hồ) — nhóm sẽ tách ra thành chim Lạc lớn
    a('    <g data-group="drum_bird" stroke="#fff3d6" data-sp="0.55" data-bright="1" data-prio="0.65">')
    for k in range(18):
        t = 2 * math.pi * k / 18
        cx, cy = 33.0 * math.cos(t), 33.0 * math.sin(t)
        for p in bird_shape(0.44, cx, cy, t - math.pi / 2):
            a(f'      <polyline points="{pts(p)}"/>')
    a('    </g>')
    ring(37.4, "drum_ring", "#ffc34a")
    zz = []
    for k in range(97):
        t = 2 * math.pi * k / 96
        r = 38.4 if k % 2 == 0 else 39.8
        zz.append((r * math.cos(t), r * math.sin(t)))
    a(f'    <g data-group="drum_ring" stroke="#ff9a2a" data-sp="0.75" data-bright="0.8" data-prio="0.4"><polyline points="{pts(zz)}"/></g>')
    ring(41.6, "drum_rim", "#ffe08a", sp=0.75, bri=1.0, prio=0.9)
    a('  </g>')
    return svg((-45, -45, 90, 90), "Cảnh 6 — Mặt trống đồng Đông Sơn (cách điệu theo trống Ngọc Lũ)",
               "Theo mô tả trống Ngọc Lũ: tâm là ngôi sao nổi 14 cánh, giữa các cánh là hoạ tiết tam giác; các vành "
               "hoa văn đồng tâm gồm hàng chấm, vòng tròn tiếp tuyến, răng cưa; vành người hoá trang lông chim; "
               "vành 18 chim bay (mỏ dài, có mào, đuôi dài) — người và vật diễu hành ngược chiều kim đồng hồ. Trống thật "
               "có 16 vành; ở đây rút gọn còn 10 dải (bỏ vành hươu) để mỗi dải đủ rõ với mật độ drone. Thiết kế gốc.",
               "\n".join(L))


def lac_bird():
    """Chim Lạc lớn dang cánh (thiết kế riêng): đầu nghiêng, mỏ dài, mào, cổ dài, thân thon, cánh xòe
    nhiều lông, đuôi dài xẻ nhiều dải — tham khảo dáng chim bay khắc trên trống đồng."""
    L = []
    a = L.append
    a('  <g fill="none" stroke-width="0.35" data-smooth="1">')
    a('    <g data-group="bird_body" stroke="#fff3d6" data-prio="1" data-sp="0.65">')
    a(f'      <polyline points="{pts([(-14, 0.6), (-8, 1.6), (-2, 1.8), (4, 1.2), (8, 0.2), (11, -1.2), (13.4, -2.6), (15.4, -3.0)])}"/>')
    a(f'      <polyline points="{pts([(-14, -0.6), (-8, -1.4), (-2, -1.6), (4, -1.4), (8, -1.6), (11, -2.6), (13.2, -4.2), (15.4, -4.4)])}"/>')
    a(f'      <polyline points="{pts([(15.4, -3.0), (17.2, -3.6), (17.6, -4.4), (16.6, -5.0), (15.4, -4.4)])}"/>')     # đầu
    a(f'      <polyline points="{pts([(17.4, -3.8), (24.0, -2.2), (30.0, -0.6)])}" stroke="#ffd36a" data-sp="0.6"/>')   # mỏ dài
    a(f'      <polyline points="{pts([(17.0, -3.4), (23.6, -1.8)])}" stroke="#ffd36a" data-sp="0.6" data-bright="0.7"/>')
    a(f'      <polyline points="{pts([(16.4, -5.0), (15.0, -7.4), (13.0, -8.6), (11.6, -8.2)])}" stroke="#ff7a2a" data-sp="0.6"/>')   # mào
    a(f'      <polyline points="{pts([(15.6, -6.0), (14.6, -9.6), (12.6, -11.4)])}" stroke="#ff7a2a" data-sp="0.6"/>')
    a('      <circle cx="16.6" cy="-4.0" r="0.35" fill="#ff3a24" stroke="#ff3a24" data-sp="0.4"/>')
    a('    </g>')
    for side, grp in ((-1, "bird_wing_u"), (1, "bird_wing_d")):
        # cánh khép kín: mép trước cong, mép sau xẻ răng cưa theo các lông cánh; p0 = dấu (trên/dưới thân)
        lead = [(2, 1.6), (-1, 8), (-5, 15), (-10, 22), (-15, 28), (-21, 32)]
        trail = [(-19.5, 27.5), (-22.5, 24.5), (-18, 22), (-20.5, 18.5), (-15, 16), (-17, 12), (-11, 9.5),
                 (-12.5, 6), (-6, 3), (-4, 1.4)]
        shape = [(x, side * y) for x, y in lead + trail]
        a(f'    <g data-group="{grp}" stroke="#ffd36a" data-prio="0.9" data-sp="0.62" data-p0="{side}">')
        a(f'      <polygon points="{pts(shape)}" fill="#ffd36a" data-fsp="1.55" data-bright="0.95"/>')
        for (x0, y0, x1, y1) in ((-1, 6, -14, 12.5), (-5, 13, -17.5, 19.5), (-10, 20, -20, 25.5)):
            a(f'      <polyline points="{pts([(x0, side * y0), (x1, side * y1)])}" data-bright="0.55" data-sp="0.8"/>')
        a('    </g>')
    a('    <g data-group="bird_tail" stroke="#ff9a2a" data-prio="0.8" data-sp="0.7">')
    for dy, ln in ((-2.6, 20), (-1.0, 23), (0.6, 24), (2.2, 21)):
        a(f'      <polyline points="{pts([(-14, dy * 0.3), (-14 - ln * 0.5, dy * 1.4 + 1.2), (-14 - ln, dy * 2.4 + 3.6)])}"/>')
    a('    </g>')
    a('  </g>')
    return svg((-45, -36, 80, 72), "Cảnh 6 — Chim Lạc dang cánh",
               "Thiết kế gốc theo lối khắc chim bay trên trống đồng Đông Sơn: thân và cánh nhìn từ trên xuống, đầu nhìn "
               "nghiêng; mỏ dài, có mào, cổ dài, chân/đuôi dài, thân thon kiểu cò–sếu–vạc. Cánh trên/dưới là hai nhóm "
               "(bird_wing_u / bird_wing_d) để engine vỗ cánh 3D quanh trục thân. Toạ độ mét, y xuống.",
               "\n".join(L))


if __name__ == "__main__":
    os.makedirs(DES, exist_ok=True)
    for name, fn in (("04_dinh_doc_lap.svg", palace), ("06_trong_dong.svg", drum), ("06_chim_lac.svg", lac_bird)):
        with open(os.path.join(DES, name), "w", encoding="utf-8") as fh:
            fh.write(fn())
        print("wrote", name)

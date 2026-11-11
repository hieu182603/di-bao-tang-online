"""
build_formations.py — Pipeline dựng dữ liệu đội hình cho Drone Show "Bảo tàng Lịch sử Đảng 3D".

  Tư liệu lịch sử -> Thiết kế SVG gốc (designs/) -> Lấy mẫu đội hình -> Toạ độ 3D -> Ghép quỹ đạo -> JSON
Chạy (từ thư mục gốc repo):
  python scripts/drone-show/build_formations.py            # dựng cả 3 mức LOW / BALANCED / HIGH
  python scripts/drone-show/build_formations.py balanced   # chỉ một mức
Kết quả: Frontend/drone-show/formations-<tier>.json   +   docs/drone-show/previews/*.png
"""
import base64
import json
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import dronekit as dk                      # noqa: E402
from dronekit import Cand, gid             # noqa: E402
import portrait                            # noqa: E402
import scenes                              # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "Frontend", "drone-show")
PREV_DIR = os.path.join(ROOT, "docs", "drone-show", "previews")
TIERS = {"low": 760, "balanced": 1800, "high": 2800}
STAGE_HC = 120.0     # độ cao tâm đội hình so với mặt đất (m) — phải khớp DroneShowConfig.stage.height
STAGE_SCALE = 1.15   # tỉ lệ sân khấu — phải khớp DroneShowConfig.stage.scale


def b64(arr, dtype):
    return base64.b64encode(np.ascontiguousarray(arr, dtype=dtype).tobytes()).decode("ascii")


def build_tier(tier, N, previews=True):
    print(f"\n=== {tier.upper()} · {N} drone ===")
    t0 = time.time()
    os.chdir(ROOT)
    kfs = scenes.build_all(N, STAGE_HC / STAGE_SCALE)                     # list of (id, Cand, meta)
    # ---------- ghép đội hình (assignment) giữa các keyframe liên tiếp
    order_kfs = scenes.assign_chain(kfs)
    print(f"  dựng + ghép xong trong {time.time() - t0:.1f}s")
    out = {"version": 1, "tier": tier.upper(), "N": N, "stageHeight": STAGE_HC, "stageScale": STAGE_SCALE, "groups": list(dk.GROUPS),
           "keyframes": [], "extras": scenes.EXTRAS}
    for kid, c, meta in order_kfs:
        assert len(c) == N, (kid, len(c))
        pos_cm = np.clip(np.round(c.pos * 100), -32767, 32767)
        kf = {"id": kid, "pos": b64(pos_cm, "<i2"),
              "col": b64(np.clip(np.round(c.col * 255), 0, 255), "u1"),
              "bri": b64(np.clip(np.round(c.bri * 255), 0, 255), "u1"),
              "grp": b64(c.grp, "u1"),
              "prio": b64(np.clip(np.round(c.prio * 255), 0, 255), "u1")}
        if meta.get("params"):
            kf["prm"] = b64(c.prm, "<f4")
        kf.update({k: v for k, v in meta.items() if k != "params"})
        out["keyframes"].append(kf)
        if previews and (tier == "balanced" or kid in ("portrait", "dragon")):
            os.makedirs(PREV_DIR, exist_ok=True)
            view = meta.get("view", (-75, 75, -55, 55))
            dk.preview(c, os.path.join(PREV_DIR, f"{tier}_{kid}.jpg"), size=(960, int(960 * (view[3] - view[2]) / (view[1] - view[0]))),
                       view=view, title=f"{kid} · {tier} · {N} drone")
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"formations-{tier}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"  -> {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")
    return out


if __name__ == "__main__":
    want = [a.lower() for a in sys.argv[1:] if not a.startswith("-")] or list(TIERS)
    os.chdir(ROOT)
    scenes.export_tank_svg()
    for t in want:
        dk.GROUPS.clear()
        scenes.EXTRAS.clear()
        build_tier(t, TIERS[t], previews="--no-preview" not in sys.argv)

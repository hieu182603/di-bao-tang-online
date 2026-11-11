/**
 * ============================================================================
 * DRONE LIGHT SHOW — "NON SÔNG MỘT DẢI" (150 GIÂY, 7 ĐỘI HÌNH)
 * Bảo tàng Lịch sử Đảng 3D · kích hoạt bằng F9 · tích hợp màn pháo hoa F8 ở đoạn kết.
 *
 * Kiến trúc:
 *  - Dữ liệu đội hình dựng OFFLINE (scripts/drone-show/build_formations.py):
 *      thiết kế SVG gốc -> lấy mẫu (contour / Poisson-disk / theo độ sáng) -> ghép Hungarian
 *      -> Frontend/drone-show/formations-<tier>.json. Phần tử i của mọi keyframe luôn là cùng một drone.
 *  - Runtime: 1 THREE.Points (lõi LED) + 1 THREE.Points dùng chung geometry (quầng sáng / bloom chọn lọc),
 *    ShaderMaterial, cộng sáng (additive), không ghi depth. Vị trí & màu tính trên CPU vào typed array
 *    cấp phát một lần (không tạo object mỗi khung), upload 1 lần/khung.
 *  - Mỗi cảnh có "animator" thuần (vị trí = f(dữ liệu, t)) => tua (seek) tới bất kỳ giây nào đều đúng.
 *    Chuyển cảnh: mỗi drone bay theo Bézier bậc 2 (đầu -> điểm giữa theo phong cách cảnh -> đích đang
 *    chuyển động), easing smootherstep, xuất phát lệch theo kịch bản riêng của từng cảnh.
 *  - Mô phỏng cục bộ trên mỗi máy; nhiều người chơi chỉ đồng bộ {showId, seed, startTime} qua Net.
 *  - 1 đơn vị = 1 m. Gốc sân khấu (tâm đội hình) đặt ở (0, 88, -100): phía sau mái bảo tàng.
 * ============================================================================
 */
(() => {
"use strict";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function hash(i) { let x = (i + 1) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }

/* ============================ 1. CẤU HÌNH ============================ */
const DroneShowConfig = {
  duration: 150,          // phát cue trong 150 s
  fadeOut: 4.5,           // 150 -> 154.5: LED tắt dần
  tail: 8,                // chờ hạt pháo hoa tàn tự nhiên rồi mới kết thúc hẳn
  stage: { x: 0, height: 120, z: -100, scale: 1.15 },   // đáy đội hình >= 24.6° nhìn từ sân trước: vượt xà cổng & mái
  dataUrl: (tier) => `drone-show/formations-${tier.toLowerCase()}.json?v=2`,
  tiers: {
    LOW: { glow: false, ledSize: 1.6, glowSize: 0, flicker: 0.02 },
    BALANCED: { glow: true, ledSize: 1.3, glowSize: 6.0, flicker: 0.03 },
    HIGH: { glow: true, ledSize: 1.15, glowSize: 6.4, flicker: 0.035 },
  },
  // Cảnh: [bắt đầu, kết thúc, tiêu đề, phụ đề]
  scenes: [
    [0, 20, "1010 · Vua Lý Thái Tổ ban Chiếu dời đô", "Dời đô từ Hoa Lư về Đại La, đặt tên kinh thành Thăng Long"],
    [20, 40, "Rồng thời Lý", "Thân tròn uốn khúc đều đặn, bờm bay như cờ đuôi nheo, miệng ngậm ngọc"],
    [40, 60, "7/5/1954 · Chiến thắng Điện Biên Phủ", "Lá cờ “Quyết chiến Quyết thắng” tung bay trên nóc hầm De Castries"],
    [60, 82, "30/4/1975 · Xe tăng 390 húc đổ cổng chính Dinh Độc Lập", "Giải phóng hoàn toàn miền Nam, thống nhất đất nước"],
    [82, 102, "Chủ tịch Hồ Chí Minh (1890 – 1969)", "“Không có gì quý hơn độc lập, tự do”"],
    [102, 122, "Trống đồng Đông Sơn · Chim Lạc", "Ngôi sao 14 cánh, vành chim Lạc bay ngược chiều kim đồng hồ"],
    [122, 150, "Quốc kỳ Việt Nam", "Độc lập – Tự do – Hạnh phúc"],
  ],
};

/* ============================ 2. SHADER LED ============================ */
const LED_VS = `
  attribute vec4 aCol;      // rgb + độ sáng
  attribute float aSeed;
  uniform float uProj, uSize, uTime, uFlicker, uMinPx, uMaxPx, uGlow;
  varying vec3 vCol; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float b = aCol.a;
    if (b < 0.004) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    float fl = 1.0 + uFlicker * sin(uTime * (5.0 + aSeed * 7.0) + aSeed * 40.0);
    float px = uSize * uProj / max(1.0, -mv.z);
    float s = clamp(px, uMinPx, uMaxPx);
    // điểm quá nhỏ trên màn hình: bù độ sáng theo diện tích để không "biến mất" khi ở xa
    vA = b * fl * clamp(px / uMinPx, 0.55, 1.0);
    vCol = aCol.rgb;
    gl_PointSize = s;
  }
`;
const LED_FS = `
  varying vec3 vCol; varying float vA;
  uniform float uGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0 || vA < 0.004) discard;
    float a;
    vec3 col;
    if (uGlow > 0.5) {                       // lớp quầng (bloom chọn lọc): rất mềm, cộng dồn khi drone dày
      a = exp(-r2 * 4.5) * 0.13 * vA;
      col = vCol;
    } else {                                  // lõi LED: đĩa sắc + quầng nhỏ, tâm ngả trắng nhẹ (không cháy trắng)
      float core = 1.0 - smoothstep(0.10, 0.22, r2);
      float halo = exp(-r2 * 6.0) * 0.55;
      a = (core + halo) * vA;
      col = mix(vCol, vec3(1.0, 0.97, 0.9), core * 0.38);
    }
    gl_FragColor = vec4(col * a, a);
  }
`;

/* ============================ 3. GIẢI MÃ DỮ LIỆU ============================ */
function b64ToBytes(s) {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeKeyframe(kf, N) {
  const pos16 = new Int16Array(b64ToBytes(kf.pos).buffer);
  const pos = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) pos[i] = pos16[i] / 100;
  const c8 = b64ToBytes(kf.col), col = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) col[i] = c8[i] / 255;
  const b8 = b64ToBytes(kf.bri), bri = new Float32Array(N); for (let i = 0; i < N; i++) bri[i] = b8[i] / 255;
  const p8 = b64ToBytes(kf.prio), prio = new Float32Array(N); for (let i = 0; i < N; i++) prio[i] = p8[i] / 255;
  const grp = b64ToBytes(kf.grp);
  const prm = kf.prm ? new Float32Array(b64ToBytes(kf.prm).buffer) : null;
  return { id: kf.id, pos, col, bri, prio, grp, prm };
}

/* ============================ 4. ANIMATOR TỪNG CẢNH ============================
 * Mỗi animator: (t, kf, out) ghi out.pos (N*3), out.col (N*3), out.bri (N) cho toàn bộ drone.
 * t = giây của show (tuyệt đối). Hàm thuần — không giữ trạng thái giữa các khung.
 */
function makeAnimators(D) {
  const N = D.N, G = D.G, X = D.extras;
  const copyBase = (kf, o) => { o.pos.set(kf.pos); o.col.set(kf.col); o.bri.set(kf.bri); };

  // ---------- CẢNH 1: vua + cuộn chiếu mở dần + năm 1010
  const W_OPEN = 92.2, W_CLOSED = 27.0;
  function king(t, kf, o) {
    copyBase(kf, o);
    const open = lerp(W_CLOSED / W_OPEN, 1, easeIO(clamp((t - 10) / 5, 0, 1)));
    const halfW = (W_OPEN * open) / 2;
    const yearA = sstep(12.0, 14.0, t);
    const gP = G.scroll_paper, gT = G.scroll_text, gL = G.scroll_roll_l, gR = G.scroll_roll_r, gY = G.year;
    for (let i = 0; i < N; i++) {
      const g = kf.grp[i], j = i * 3, x = kf.pos[j];
      if (g === gP || g === gT) {
        // phần lụa chưa mở còn cuộn trong trục: drone nằm sát trục, tắt đèn; phần đã mở hiện dần từ giữa ra
        const ax = Math.abs(x);
        if (ax > halfW - 0.4) { o.pos[j] = Math.sign(x) * (halfW - 0.4); o.bri[i] = 0; continue; }
        if (g === gT) o.bri[i] *= sstep(halfW - 0.5, halfW - 3.5, ax) * (0.85 + 0.15 * Math.sin(t * 2.2 + x * 0.3));
      } else if (g === gL) o.pos[j] = x + 46 * (1 - open);
      else if (g === gR) o.pos[j] = x - 46 * (1 - open);
      else if (g === gY) o.bri[i] *= yearA;
      else o.bri[i] *= 0.93 + 0.07 * Math.sin(t * 1.3 + hash(i) * TAU);
    }
  }

  // ---------- CẢNH 2: rồng thời Lý — spline thân chuyển động
  const DR = X.dragon, M = DR.spine.length;
  const S0 = new Float32Array(M * 3), Dr = new Float32Array(M * 2);
  DR.spine.forEach((p, k) => { S0[k * 3] = p[0]; S0[k * 3 + 1] = p[1]; S0[k * 3 + 2] = p[2]; });
  for (let k = 0; k < M; k++) {   // pháp tuyến lưng của spline nghỉ
    const a = Math.min(k + 1, M - 1), b = Math.max(k - 1, 0);
    let tx = S0[a * 3] - S0[b * 3], ty = S0[a * 3 + 1] - S0[b * 3 + 1]; const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l; Dr[k * 2] = ty; Dr[k * 2 + 1] = -tx;
  }
  const SA = new Float32Array(M * 3), TA = new Float32Array(M * 3);
  const head = { x: 0, y: 0, z: 0, rot: 0 };
  function dragonSpine(t) {
    const tau = t - 20;
    const amp = 3.0 * sstep(24.5, 27.5, t);                 // biên độ uốn lượn
    const flyE = easeIO(clamp((t - 34) / 4.5, 0, 1));       // bay qua vùng trời
    const strE = sstep(35.4, 38.4, t);                      // giãn thành dải sáng
    const lift = 0.16 * sstep(27.5, 29.5, t) * (1 - sstep(31.5, 33.5, t));
    for (let k = 0; k < M; k++) {
      const u = k / (M - 1);
      const win = sstep(0.05, 0.24, u) * (0.65 + 0.5 * u);
      const w = amp * win * Math.sin(TAU * 1.6 * u - 2.3 * tau);
      const wz = 0.9 * amp * win * Math.sin(TAU * 1.1 * u - 1.7 * tau + 1.0);
      let x = S0[k * 3] + Dr[k * 2] * w, y = S0[k * 3 + 1] + Dr[k * 2 + 1] * w, z = S0[k * 3 + 2] + wz;
      // nâng cổ/đầu (đuôi trễ theo nhờ sóng truyền từ đầu tới đuôi)
      y += 5.5 * lift * (1 - sstep(0.0, 0.3, u)) * 2.2;
      // bay sang phải + giãn dài, dẹt dần thành dải sáng
      x = x * (1 + 0.55 * strE) + 16 * flyE; y = y * (1 - 0.62 * strE) + 2.0 * Math.sin(0.8 * tau) * (1 - strE);
      SA[k * 3] = x; SA[k * 3 + 1] = y; SA[k * 3 + 2] = z;
    }
    for (let k = 0; k < M; k++) {
      const a = Math.min(k + 1, M - 1), b = Math.max(k - 1, 0);
      TA[k * 3] = SA[a * 3] - SA[b * 3]; TA[k * 3 + 1] = SA[a * 3 + 1] - SA[b * 3 + 1]; TA[k * 3 + 2] = 0;
    }
    head.x = SA[0]; head.y = SA[1]; head.z = SA[2];
    head.rot = 0.09 * sstep(26, 28, t) * Math.sin(0.9 * tau) + lift;
    return { strE, flyE };
  }
  function dragon(t, kf, o) {
    const { strE } = dragonSpine(t);
    const P = kf.prm, tau = t - 20;
    const gHead = G.dr_head, gPearl = G.dr_pearl, gMane = G.dr_mane, gWh = G.dr_whisker;
    const gBody = G.dr_body, gScale = G.dr_scale, gFin = G.dr_fin;
    const cr = Math.cos(head.rot), sr = Math.sin(head.rot);
    const lightOn = sstep(25.5, 27.5, t) * (1 - strE);
    for (let i = 0; i < N; i++) {
      const g = kf.grp[i], j = i * 3, q = i * 4;
      let x, y, z;
      if (P[q] < -0.5) {                       // bộ phận gắn khung đầu
        let lx = P[q + 1], ly = P[q + 2];
        if (g === gMane || g === gWh) {         // bờm/râu bay phấp phới (xa gốc dao động nhiều hơn)
          const d = Math.hypot(lx, ly);
          ly += 0.7 * Math.sin(3.1 * tau - 0.35 * d + (g === gWh ? 1.3 : 0)) * Math.min(1, d / 14);
        }
        x = head.x + lx * cr - ly * sr; y = head.y + lx * sr + ly * cr; z = head.z + P[q + 3];
      } else {                                 // bộ phận gắn spline thân
        let u = P[q];
        if (g === gScale) u += 0.004 * Math.sin(2.0 * tau + 40 * u) * lightOn;   // vảy trượt dọc thân
        const f = clamp(u, 0, 1) * (M - 1), k = Math.min(M - 2, f | 0), a = f - k;
        const px = SA[k * 3] + (SA[k * 3 + 3] - SA[k * 3]) * a;
        const py = SA[k * 3 + 1] + (SA[k * 3 + 4] - SA[k * 3 + 1]) * a;
        const pz = SA[k * 3 + 2] + (SA[k * 3 + 5] - SA[k * 3 + 2]) * a;
        let tx = TA[k * 3] + (TA[k * 3 + 3] - TA[k * 3]) * a, ty = TA[k * 3 + 1] + (TA[k * 3 + 4] - TA[k * 3 + 1]) * a;
        const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const dx = ty, dy = -tx;
        x = px + tx * P[q + 1] + dx * P[q + 2]; y = py + ty * P[q + 1] + dy * P[q + 2]; z = pz + P[q + 3];
      }
      o.pos[j] = x; o.pos[j + 1] = y; o.pos[j + 2] = z;
      o.col[j] = kf.col[j]; o.col[j + 1] = kf.col[j + 1]; o.col[j + 2] = kf.col[j + 2];
      let b = kf.bri[i];
      if (g === gBody || g === gScale || g === gFin) {   // sóng ánh sáng chạy dọc thân rồng
        const u = P[q];
        const wave = 0.5 + 0.5 * Math.sin(TAU * 2.2 * u - 3.2 * tau);
        b *= lerp(1, 0.55 + 0.75 * wave * wave, lightOn);
      }
      if (g === gPearl) b *= 0.85 + 0.15 * Math.sin(4 * tau);
      if (strE > 0 && (g === gHead || g === gMane || g === gWh || g === gPearl)) b *= 1 - 0.45 * strE;
      o.bri[i] = b;
    }
  }

  // ---------- CẢNH 3: Điện Biên Phủ — giương cờ, cờ tung bay, luồng sáng dọc cán cờ, năm 1954
  const DB = X.dienbien;
  function dienbien(t, kf, o) {
    copyBase(kf, o);
    const P = kf.prm, tau = t - 40;
    const raise = easeIO(clamp((t - 46.6) / 5.4, 0, 1));
    const ang = -0.62 * (1 - raise) + 0.035 * Math.sin(1.6 * tau) * raise;   // quay quanh tay chiến sĩ
    const ca = Math.cos(ang), sa = Math.sin(ang), px0 = DB.pivot[0], py0 = DB.pivot[1];
    const waveA = 1.6 + 2.0 * sstep(52.5, 54.5, t);
    const beam = clamp((t - 53) / 3.6, 0, 1);
    const yearA = sstep(50.0, 52.2, t);
    const gArm = G.db_arm, gPole = G.db_pole, gF = G.db_flag, gS = G.db_flag_star, gT = G.db_flag_text, gY = G.year;
    for (let i = 0; i < N; i++) {
      const g = kf.grp[i], j = i * 3;
      if (g === gY) { o.bri[i] *= yearA; continue; }
      const isFlag = g === gF || g === gS || g === gT;
      if (!(isFlag || g === gPole || g === gArm)) { o.bri[i] *= 0.92 + 0.08 * Math.sin(t * 0.9 + kf.pos[j] * 0.05); continue; }
      let x = kf.pos[j], y = kf.pos[j + 1], z = kf.pos[j + 2];
      let k = 1;
      if (g === gArm) k = clamp(Math.hypot(x - (-12.0), y - 5.4) / 6.5, 0, 1);   // cánh tay cong theo
      const dx = x - px0, dy = y - py0, c = Math.cos(ang * k), s = Math.sin(ang * k);
      x = px0 + dx * c - dy * s; y = py0 + dx * s + dy * c;
      if (isFlag) {                               // sóng 3D: biên độ tăng dần từ cán ra đuôi cờ
        const u = P[i * 4], v = P[i * 4 + 1];
        const ph = TAU * (1.15 * u - 0.62 * tau) + v * 0.9;
        z += waveA * u * Math.sin(ph);
        y += 0.35 * waveA * u * Math.cos(ph);
        o.bri[i] *= (g === gF ? 0.8 + 0.2 * Math.cos(ph) : 0.93 + 0.07 * Math.cos(ph)) * sstep(43.5, 46.5, t + 2.5 * (1 - v));
      }
      if (g === gPole && beam > 0 && beam < 1) {   // luồng sáng vàng chạy từ chân cột lên đỉnh
        const v = clamp((kf.pos[j + 1] - (-1.0)) / 39, 0, 1);
        const glow = Math.exp(-Math.pow((v - beam) * 7, 2));
        o.bri[i] = Math.min(1, o.bri[i] * (0.7 + 1.6 * glow));
        o.col[j + 2] = lerp(o.col[j + 2], 0.9, glow);
      }
      o.pos[j] = x; o.pos[j + 1] = y; o.pos[j + 2] = z;
    }
  }

  // ---------- CẢNH 4: Dinh Độc Lập + xe tăng 390 tiến vào, xích quay, cổng mở
  const TK = X.tank, K = TK.k, loop = TK.loop, LN = loop.length, TP = TK.path;
  // quỹ đạo xe: đoạn thẳng sang phải -> cung tròn 90° (ôm cua vào cổng) -> đoạn thẳng xuyên qua cổng
  const L1 = TP.xTurn - TP.x0, LA = TP.r * Math.PI / 2, zc = TP.z0 - TP.r, L2 = zc - TP.zEnd, pathLen = L1 + LA + L2;
  const pose = { x: 0, z: 0, yaw: 0 };
  function tankPose(d) {
    if (d <= L1) { pose.x = TP.x0 + d; pose.z = TP.z0; pose.yaw = 0; }
    else if (d <= L1 + LA) { const ph = (d - L1) / TP.r; pose.x = TP.xTurn + TP.r * Math.sin(ph); pose.z = zc + TP.r * Math.cos(ph); pose.yaw = ph; }
    else { pose.x = TP.xTurn + TP.r; pose.z = zc - (d - L1 - LA); pose.yaw = Math.PI / 2; }
    return pose;
  }
  // tăng tốc khi xuất phát, giữ đà khi húc cổng, hãm lại trong sân
  function tankTravel(t) {   // gia tốc đều 20% đầu, vận tốc không đổi, hãm đều 20% cuối (tổng = 1)
    const u = clamp((t - 71.4) / 5.6, 0, 1);
    const f = u < 0.2 ? 3.125 * u * u : u < 0.8 ? 0.125 + 1.25 * (u - 0.2) : 0.875 + 1.25 * (u - 0.8) - 3.125 * (u - 0.8) * (u - 0.8);
    return pathLen * f;
  }
  function palace(t, kf, o) {
    copyBase(kf, o);
    const P = kf.prm, dist = Math.min(pathLen, tankTravel(t));
    const tp = tankPose(dist), cy = Math.cos(tp.yaw), sy = Math.sin(tp.yaw);
    // cổng bật mở khi xe đang ôm cua hướng thẳng vào cổng (mũi xe chạm cánh cổng)
    const gateA = 1.5 * easeIO(clamp((dist - (L1 + 0.55 * LA)) / (0.45 * LA + 2.5), 0, 1));
    const cg = Math.cos(gateA), sg = Math.sin(gateA);
    const flagA = sstep(76.4, 78.0, t);
    const ox = tp.x, oz = tp.z, oy = TK.start[1];
    const gL = G.gate_l, gR = G.gate_r, gFr = G.pal_flag_r, gFb = G.pal_flag_b, gFs = G.pal_flag_s, gCur = G.pal_curtain;
    const gTr = G.tank_track, gWh = G.tank_wheel;
    const isTank = (g) => g === G.tank_hull || g === G.tank_turret || g === G.tank_gun || g === gTr || g === gWh || g === G.tank_num;
    for (let i = 0; i < N; i++) {
      const g = kf.grp[i], j = i * 3, q = i * 4;
      if (isTank(g)) {
        let lx = P[q + 1], ly = P[q + 2], lz = P[q + 3];
        const code = P[q];
        if (code >= 10) {                       // điểm xích chạy vòng theo quãng đường xe đi
          let u = (code - 10 + dist / (TK.loopLen * K)) % 1; if (u < 0) u += 1;
          const f = u * LN, k0 = f | 0, a = f - k0, k1 = (k0 + 1) % LN;
          lx = loop[k0][0] + (loop[k1][0] - loop[k0][0]) * a; ly = loop[k0][1] + (loop[k1][1] - loop[k0][1]) * a;
        } else if (code >= 1) {                 // bánh xe quay
          const cx = TK.wheels[(code | 0) - 1], cyw = TK.wheelY, ang = -dist / (TK.wheelR * K);
          const dx = lx - cx, dy = ly - cyw, c = Math.cos(ang), s = Math.sin(ang);
          lx = cx + dx * c - dy * s; ly = cyw + dx * s + dy * c;
        }
        lx *= K; ly *= K; lz *= K;
        o.pos[j] = ox + lx * cy + lz * sy; o.pos[j + 1] = oy + ly; o.pos[j + 2] = oz - lx * sy + lz * cy;
        if (dist > 0 && dist < pathLen) o.pos[j + 1] += 0.18 * Math.sin(t * 19 + lx * 0.4);   // rung nhẹ khi chạy
      } else if (g === gL || g === gR) {        // cánh cổng quay quanh bản lề (trục đứng) vào phía trong
        const hx = P[q], dx = kf.pos[j] - hx;
        o.pos[j] = hx + dx * cg; o.pos[j + 2] = kf.pos[j + 2] - Math.abs(dx) * sg;
      } else if (g === gFr || g === gFb || g === gFs) {
        o.bri[i] *= flagA;
        o.pos[j + 2] += 0.6 * Math.sin(TAU * (0.12 * (kf.pos[j] - 0.4) - 0.7 * t)) * (kf.pos[j] / 9.4);
      } else if (g === gCur) {
        o.bri[i] *= 0.8 + 0.2 * Math.sin(kf.pos[j] * 0.09 - t * 1.4);
      }
    }
  }

  // ---------- CẢNH 5: chân dung — thở sáng nhẹ, phát sáng trước khi tách vòng
  function portrait(t, kf, o) {
    copyBase(kf, o);
    const pulse = Math.exp(-Math.pow((t - 97.6) / 0.9, 2));
    for (let i = 0; i < N; i++) {
      o.bri[i] = Math.min(1, o.bri[i] * (0.95 + 0.05 * Math.sin(0.8 * t + hash(i) * 2)) * (1 + 0.45 * pulse));
      o.pos[i * 3 + 2] += 1.5 * pulse;
    }
  }

  // ---------- CẢNH 6: trống đồng quay chậm (chiều diễu hành) + nghiêng 3D; chim Lạc vỗ cánh, bay qua
  const BC = X.bird.center;
  function drumCommon(t, kf, o, i, extraDim) {
    const j = i * 3, x0 = kf.pos[j], y0 = kf.pos[j + 1], z0 = kf.pos[j + 2];
    const rot = 0.045 * Math.max(0, t - 103.5);
    const tilt = 0.32 * easeIO(clamp((t - 104) / 5, 0, 1));
    const spread = 1 + 0.32 * easeIO(clamp((t - 116) / 4, 0, 1));
    const c = Math.cos(rot), s = Math.sin(rot);
    const x = (x0 * c - y0 * s) * spread, y = (x0 * s + y0 * c) * spread;
    // nghiêng mặt trống quanh trục ngang: mép trên lùi ra xa, mép dưới tiến lại gần => thấy rõ là một mặt tròn 3D
    o.pos[j] = x; o.pos[j + 1] = y * Math.cos(tilt) + z0 * Math.sin(tilt); o.pos[j + 2] = z0 * Math.cos(tilt) - y * Math.sin(tilt);
    const r = Math.hypot(x0, y0);
    let b = kf.bri[i] * (0.82 + 0.18 * Math.sin(TAU * r / 11 - 2.4 * t));
    o.bri[i] = b * extraDim;
    o.col[j] = kf.col[j]; o.col[j + 1] = kf.col[j + 1]; o.col[j + 2] = kf.col[j + 2];
  }
  function drum(t, kf, o) { for (let i = 0; i < N; i++) drumCommon(t, kf, o, i, 1); }
  const birdG = () => [G.bird_body, G.bird_wing_u, G.bird_wing_d, G.bird_tail];
  function drumBird(t, kf, o) {
    const P = kf.prm;
    const [gB, gU, gD, gTl] = birdG();
    const dim = 1 - 0.55 * sstep(110, 113, t);
    const fly = easeIO(clamp((t - 114.8) / 7, 0, 1));
    const bx = 30 * fly, by = 7 * Math.sin(fly * Math.PI) + 2.5 * fly, bank = -0.12 * Math.sin(fly * Math.PI);
    const cb = Math.cos(bank), sb = Math.sin(bank);
    for (let i = 0; i < N; i++) {
      const g = kf.grp[i];
      if (g !== gB && g !== gU && g !== gD && g !== gTl) { drumCommon(t, kf, o, i, dim); continue; }
      const j = i * 3, q = i * 4;
      let lx = P[q], ly = P[q + 1], lz = kf.pos[j + 2] - BC[2];
      if (g === gU || g === gD) {                 // vỗ cánh 3D quanh trục thân, đầu cánh trễ pha (cánh uốn)
        const span = Math.min(1, Math.abs(ly) / 32);
        const phi = 0.62 * Math.sin(TAU * 0.5 * (t - 110.5) - 1.1 * span) * (0.55 + 0.45 * span);
        const yy = ly * Math.cos(phi), zz = Math.abs(ly) * Math.sin(phi);
        ly = yy; lz += zz;
      } else if (g === gTl) {
        ly += 0.8 * Math.sin(2.6 * t + lx * 0.15) * Math.min(1, Math.abs(lx + 14) / 20);
      }
      const x = lx * cb - ly * sb, y = lx * sb + ly * cb;
      o.pos[j] = BC[0] + x + bx; o.pos[j + 1] = BC[1] + y + by; o.pos[j + 2] = BC[2] + lz;
      o.col[j] = kf.col[j]; o.col[j + 1] = kf.col[j + 1]; o.col[j + 2] = kf.col[j + 2];
      o.bri[i] = kf.bri[i];
    }
  }

  // ---------- CẢNH 7: Quốc kỳ — sóng 3D trái -> phải, sao vàng giữ độ sáng; tắt dần sau 150 s
  function flag(t, kf, o) {
    copyBase(kf, o);
    const P = kf.prm;
    const A = 3.4 * sstep(128.6, 131.5, t);
    const fade = 1 - sstep(DroneShowConfig.duration, DroneShowConfig.duration + DroneShowConfig.fadeOut, t);
    const gS = G.flag_star;
    for (let i = 0; i < N; i++) {
      const j = i * 3, u = P[i * 4], v = P[i * 4 + 1];
      const ph = TAU * (0.95 * u - 0.5 * (t - 129)) + 0.6 * v;
      const amp = A * (0.12 + 0.88 * u);
      o.pos[j + 2] += amp * Math.sin(ph);
      o.pos[j + 1] += 0.28 * amp * Math.cos(ph) - 0.5 * A * u * u * 0.3;
      o.pos[j] -= 0.12 * amp * (1 - Math.cos(ph)) * u;
      const shade = kf.grp[i] === gS ? 0.95 + 0.05 * Math.cos(ph) : 0.84 + 0.16 * Math.cos(ph);
      o.bri[i] *= lerp(1, shade, A / 3.4) * fade;
    }
  }

  const ground = (t, kf, o) => { copyBase(kf, o); o.bri.fill(0); };
  return { ground, king, dragon, dienbien, palace, portrait, drum, drum_bird: drumBird, flag };
}

/* ============================ 5. BIÊN ĐẠO CHUYỂN CẢNH ============================
 * Mỗi chuyển cảnh: t0, phong cách quỹ đạo (điểm giữa Bézier), độ trễ xuất phát từng drone, thời lượng bay.
 */
function makeTransitions(D) {
  const G = D.G;
  const KF = D.kf;
  const byId = (id) => KF.findIndex((k) => k.id === id);
  const T = [];
  const add = (from, to, t0, style, delay, dur, tint) => T.push({ a: byId(from), b: byId(to), t0, style, delay, dur, tint });
  // 0 -> 1: cất cánh thành các dải sáng vàng từ 4 khu, đường nét chính hội tụ trước
  add("ground", "king", 0.0, "launch", (i, f, to) => 0.25 + 0.55 * (KF[0].prm ? [0, 0.45, 0.15, 0.6][KF[0].prm[i * 4] | 0] : 0) +
      2.7 * (1 - to.prio[i]) + 0.9 * hash(i + 7), () => 5.2, [1.0, 0.72, 0.28]);
  // 1 -> 2: chiếu dời đô kéo dài thành thân rồng, hình thành từ đầu tới đuôi
  add("king", "dragon", 15.0, "unfurl", (i, f, to) => { const u = to.prm[i * 4]; return 3.8 * clamp(u < 0 ? 0 : u, 0, 1) + 0.3 * hash(i); },
      () => 4.6, [1.0, 0.78, 0.35]);
  // 2 -> 3: dải sáng hạ xuống thành núi trước, rồi cột cờ, chiến sĩ, lá cờ từ dưới lên
  const mtn = [G.db_mtn_far, G.db_mtn_mid, G.db_mtn_near];
  add("dragon", "dienbien", 37.6, "ribbons", (i, f, to) => {
    const g = to.grp[i], x = to.pos[i * 3];
    if (mtn.includes(g)) return 1.4 * (x + 62) / 124 + 0.2 * hash(i);
    if (g === G.db_pole || g === G.db_bunker) return 1.9 + 0.4 * hash(i);
    if (g === G.db_soldier || g === G.db_arm) return 2.4 + 0.5 * hash(i);
    if (g === G.year) return 2.6;
    return 3.2 + 1.6 * to.prm[i * 4 + 1] + 0.3 * hash(i);
  }, () => 3.9, [0.9, 0.8, 0.5]);
  // 3 -> 4: địa hình tách đôi thành đường nét kiến trúc, dựng từ dưới lên; xe tăng xuất hiện sau
  const tank = [G.tank_hull, G.tank_turret, G.tank_gun, G.tank_track, G.tank_wheel, G.tank_num];
  add("dienbien", "palace", 57.4, "split", (i, f, to) => {
    const g = to.grp[i];
    if (tank.includes(g)) return 6.6 + 1.2 * hash(i);
    return 0.4 + 3.4 * clamp(1 - (to.pos[i * 3 + 1] + 30) / 70, 0, 1) + 0.25 * hash(i);
  }, () => 4.2, [0.8, 0.9, 1.0]);
  // 4 -> 5: mọi đường nét hội tụ, nét nhận diện (mắt, mũi, miệng, đường bao) hiện trước
  add("palace", "portrait", 77.2, "converge", (i, f, to) => 5.6 * Math.pow(1 - to.prio[i], 1.15) + 0.5 * hash(i),
      () => 4.6, [1.0, 0.86, 0.6]);
  // 5 -> 6: chân dung tách thành các vòng hoa văn, xoáy ốc từ tâm ra ngoài
  add("portrait", "drum", 98.4, "spiral", (i, f, to) => 3.0 * Math.hypot(to.pos[i * 3], to.pos[i * 3 + 1]) / 42 + 0.3 * hash(i),
      () => 4.4, [1.0, 0.8, 0.4]);
  // 6 -> 7: vành chim bay tách khỏi mặt trống, hợp thành chim Lạc lớn
  add("drum", "drum_bird", 108.2, "detach", (i, f, to) => 1.6 * hash(i * 3 + 1), () => 3.5, [1.0, 0.95, 0.8]);
  // 7 -> 8: điểm sáng trải rộng thành quốc kỳ, quét trái -> phải; ngôi sao vàng hình thành sau cùng
  add("drum_bird", "flag", 116.6, "sweep", (i, f, to) => {
    if (to.grp[i] === G.flag_star) return 3.6 + 0.8 * hash(i);
    return 3.0 * (to.pos[i * 3] + 48) / 96 + 0.35 * hash(i);
  }, () => 4.3, [1.0, 0.5, 0.35]);
  return T;
}

/* ============================ 6. SHOW ============================ */
const DroneShow = {
  scene: null, camera: null, renderer: null, hooks: {},
  group: null, points: null, glow: null, geo: null, uniforms: null,
  tier: null, data: null, loading: null, anim: null, trans: null,
  isRunning: false, paused: false, startPerf: 0, pauseAt: 0, t: 0, seed: 0, showId: null, startTime: 0,
  endAt: 0, cueIdx: 0, cues: [], stats: { frames: 0, ms: 0 }, debug: null,
  cine: { on: false, k: 0 },

  init(scene, camera, renderer, hooks = {}) {
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.hooks = hooks;
    this.group = new THREE.Group();
    this.group.name = "DroneShowStage";
    this.applyStage();
    this.group.visible = false;
    scene.add(this.group);
    if (/[?&]droneDebug=1/.test(location.search)) this.buildDebug();
  },
  applyStage() {
    const s = DroneShowConfig.stage;
    this.group.position.set(s.x, s.height, s.z);
    this.group.scale.setScalar(s.scale);
  },

  pickTier() {
    const q = (location.search.match(/[?&]drones=(low|balanced|high)/i) || [])[1];
    if (q) return q.toUpperCase();
    if (this.forcedTier) return this.forcedTier;
    const coarse = matchMedia && matchMedia("(pointer: coarse)").matches;
    if (coarse) return "LOW";
    // Máy bàn: benchmark cho thấy show chỉ tốn ~0,3 ms CPU + 2 draw call, nên nâng HIGH khi bảo tàng đang chạy mượt
    // (khung hình trung bình gần đây < 22 ms); máy đang chậm giữ BALANCED để không làm nặng thêm.
    return this.frameAvg > 0 && this.frameAvg < 22 ? "HIGH" : "BALANCED";
  },
  frameAvg: 0,

  async load(tier) {
    tier = tier || this.pickTier();
    if (this.data && this.tier === tier) return this.data;
    if (this.loading && this.loading.tier === tier) return this.loading.p;
    const p = (async () => {
      const res = await fetch(DroneShowConfig.dataUrl(tier));
      if (!res.ok) throw new Error("Không tải được dữ liệu đội hình " + tier + " (" + res.status + ")");
      const raw = await res.json();
      const N = raw.N;
      const G = {}; raw.groups.forEach((g, i) => { G[g] = i; });
      const kf = raw.keyframes.map((k) => decodeKeyframe(k, N));
      const D = { N, G, kf, extras: raw.extras, tier };
      D.byId = {}; kf.forEach((k, i) => { D.byId[k.id] = i; });
      this.disposeGpu();
      this.tier = tier; this.data = D;
      this.anim = makeAnimators(D);
      this.trans = makeTransitions(D);
      this.buildGpu(N);
      return D;
    })();
    this.loading = { tier, p };
    try { return await p; } finally { this.loading = null; }
  },

  buildGpu(N) {
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(N * 3);
    this.colArr = new Float32Array(N * 4);
    const seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = hash(i * 13 + 5);
    const pa = new THREE.BufferAttribute(this.posArr, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.colArr, 4); ca.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", pa); geo.setAttribute("aCol", ca); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 400);
    const tcfg = DroneShowConfig.tiers[this.tier];
    const common = { uProj: { value: 600 }, uTime: { value: 0 }, uFlicker: { value: tcfg.flicker } };
    this.uniforms = common;
    const mk = (glow) => new THREE.ShaderMaterial({
      uniforms: { ...common, uSize: { value: glow ? tcfg.glowSize : tcfg.ledSize }, uMinPx: { value: glow ? 7.0 : 2.6 },
        uMaxPx: { value: glow ? 90.0 : 26.0 }, uGlow: { value: glow ? 1 : 0 } },
      vertexShader: LED_VS, fragmentShader: LED_FS,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(geo, mk(false));
    this.points.frustumCulled = false; this.points.renderOrder = 22;
    this.group.add(this.points);
    if (tcfg.glow) {
      this.glow = new THREE.Points(geo, mk(true));
      this.glow.frustumCulled = false; this.glow.renderOrder = 21;
      this.group.add(this.glow);
    }
    this.geo = geo;
    // bộ đệm tính toán (cấp phát một lần)
    const buf = () => ({ pos: new Float32Array(N * 3), col: new Float32Array(N * 3), bri: new Float32Array(N) });
    this.bufA = buf(); this.bufB = buf(); this.bufFrom = buf();
    this.fromKey = -1;
  },
  disposeGpu() {
    if (this.points) { this.group.remove(this.points); this.points.material.dispose(); }
    if (this.glow) { this.group.remove(this.glow); this.glow.material.dispose(); }
    if (this.geo) this.geo.dispose();
    this.points = this.glow = this.geo = null;
  },
  setGlow(on) { if (this.glow) this.glow.visible = !!on; },

  /* -------- vòng đời -------- */
  // opts: { seed, startTime (ms epoch, đồng bộ nhiều người), at (giây, tua), tier }
  async start(opts = {}) {
    if (this.isRunning || this.pending) return false;
    if (window.FireworksShow && window.FireworksShow.isRunning) {
      this.toast("Đang có màn pháo hoa (F8) — đợi pháo hoa kết thúc rồi nhấn F9.");
      return false;
    }
    this.pending = true;
    this.caption("Drone Show", "Đang chuẩn bị đội hình…", true);
    try { await this.load(opts.tier); } catch (e) {
      this.pending = false; console.warn("[DroneShow]", e); this.toast("Không tải được dữ liệu Drone Show."); this.caption(null); return false;
    }
    this.pending = false;
    this.seed = opts.seed >>> 0 || ((Math.random() * 2 ** 31) >>> 0);
    this.showId = opts.showId || ("drones-" + this.seed.toString(36));
    let at = opts.at || 0;
    if (opts.startTime) at = Math.max(at, (Date.now() - opts.startTime) / 1000);
    if (at > DroneShowConfig.duration + DroneShowConfig.fadeOut) { this.caption(null); return false; }
    this.startTime = opts.startTime || Date.now() - at * 1000;
    this.startPerf = performance.now() - at * 1000;
    this.t = at; this.paused = false; this.isRunning = true; this.endAt = 0;
    this.cues = buildFireworkCues(); this.cueIdx = 0;
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t < at - 0.25) this.cueIdx++;
    this.fromKey = -1;
    this.group.visible = true;
    if (this.prevNight === undefined || this.prevNight === null) {
      try { this.prevNight = !!(window.getFireworksState && window.getFireworksState().isNight); } catch (e) { this.prevNight = false; }
    }
    if (typeof window.toggleDayNight === "function") window.toggleDayNight(true, false);
    this.lastScene = -1;
    this.toast("Drone Show bắt đầu — nhìn lên bầu trời phía sau bảo tàng · C: góc nhìn điện ảnh · F9 (2 lần): dừng");
    return true;
  },
  stop(natural = false) {
    if (!this.isRunning && !this.endAt) return;
    this.isRunning = false; this.paused = false; this.endAt = 0;
    this.group.visible = false;
    this.caption(null);
    this.setCinematic(false);
    if (!natural && window.FireworksShow && window.FireworksShow.points && !window.FireworksShow.isRunning) {
      // dừng giữa chừng: dọn các cue pháo hoa thuộc Drone Show còn chờ nổ
      window.FireworksShow.extra = [];
    }
    if (this.prevNight === false && typeof window.toggleDayNight === "function") window.toggleDayNight(false, false);
    this.prevNight = null;
  },
  pause() { if (this.isRunning && !this.paused) { this.paused = true; this.pauseAt = this.t; } },
  resume() { if (this.isRunning && this.paused) { this.paused = false; this.startPerf = performance.now() - this.pauseAt * 1000; } },
  seek(t) {
    if (!this.isRunning) return;
    t = clamp(t, 0, DroneShowConfig.duration + DroneShowConfig.fadeOut);
    this.startPerf = performance.now() - t * 1000; this.pauseAt = t; this.t = t;
    this.cueIdx = 0; while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t < t) this.cueIdx++;
    this.fromKey = -1;
  },
  getState() {
    // thời điểm show tính theo đồng hồ (không phụ thuộc khung hình gần nhất — khung có thể bị trễ khi máy đang bận)
    const live = this.isRunning && !this.paused ? (performance.now() - this.startPerf) / 1000 : this.t;
    return { running: this.isRunning, paused: this.paused, t: +live.toFixed(2), frameT: +this.t.toFixed(2), tier: this.tier, drones: this.data ? this.data.N : 0,
      showId: this.showId, seed: this.seed, scene: this.sceneIndex(this.t) + 1, cinematic: this.cine.on,
      avgMs: this.stats.frames ? +(this.stats.ms / this.stats.frames).toFixed(3) : 0 };
  },
  sceneIndex(t) { const S = DroneShowConfig.scenes; for (let i = S.length - 1; i >= 0; i--) if (t >= S[i][0]) return i; return 0; },

  /* -------- mỗi khung hình -------- */
  update(dt, nowMs) {
    if (dt > 0 && dt < 0.25) this.frameAvg = this.frameAvg ? this.frameAvg + (dt * 1000 - this.frameAvg) * 0.02 : dt * 1000;
    if (!this.isRunning || !this.data) { if (this.debug) this.updateDebugPanel(); return; }
    const t0 = performance.now();
    if (!this.paused) this.t = (nowMs - this.startPerf) / 1000;
    // Giữ trời đêm trong suốt show (vd. người khác bấm F2 chuyển ban ngày): ghi nhớ để khôi phục ban ngày khi show kết thúc
    if (!this.endAt && window.getFireworksState && typeof window.toggleDayNight === "function" && !window.getFireworksState().isNight) {
      this.prevNight = false; window.toggleDayNight(true, false);
    }
    const t = this.t, D = this.data;
    // cue pháo hoa (chỉ phát khi show đang chạy thật, không phát khi tạm dừng)
    if (!this.paused) {
      while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= t) {
        const c = this.cues[this.cueIdx++];
        if (t - c.t < 0.6) { try { c.fn(); } catch (e) { console.warn("[DroneShow] cue", e); } }
      }
    }
    this.computeFrame(t);
    // tỉ lệ pixel/mét cho kích thước điểm
    const h = this.renderer.getContext().drawingBufferHeight;
    this.uniforms.uProj.value = h / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2)) * DroneShowConfig.stage.scale;
    this.uniforms.uTime.value = t;
    const si = this.sceneIndex(t);
    if (si !== this.lastScene) {
      this.lastScene = si;
      const S = DroneShowConfig.scenes[si];
      if (t < DroneShowConfig.duration) this.caption(S[2], S[3]);
    }
    if (t >= DroneShowConfig.duration + DroneShowConfig.fadeOut && !this.endAt) {
      this.endAt = nowMs + DroneShowConfig.tail * 1000;
      this.caption(null);
      this.group.visible = false;
    }
    if (this.endAt && nowMs >= this.endAt) { this.stop(true); if (this.hooks.onEnd) this.hooks.onEnd(); }
    this.stats.ms += performance.now() - t0; this.stats.frames++;
    if (this.debug) this.updateDebugPanel();
  },

  computeFrame(t) {
    const D = this.data, N = D.N, KF = D.kf, T = this.trans;
    // tìm chuyển cảnh đang diễn ra (hoặc keyframe đang giữ)
    let tr = null, k = 0;
    for (let i = 0; i < T.length; i++) {
      const x = T[i];
      if (t >= x.t0) { k = x.b; tr = x; }
    }
    const outP = this.posArr, outC = this.colArr;
    if (!tr) {   // trước khi cất cánh: drone nằm trên mặt đất, tắt đèn
      this.anim.ground(t, KF[0], this.bufA);
      for (let i = 0; i < N; i++) { outP[i * 3] = this.bufA.pos[i * 3]; outP[i * 3 + 1] = this.bufA.pos[i * 3 + 1]; outP[i * 3 + 2] = this.bufA.pos[i * 3 + 2]; outC[i * 4 + 3] = 0; }
      this.flush(); return;
    }
    const kb = KF[tr.b], ka = KF[tr.a];
    const animB = this.anim[kb.id], animA = this.anim[ka.id];
    animB(t, kb, this.bufB);
    // vị trí xuất phát: pose của cảnh trước tại thời điểm bắt đầu chuyển (tính một lần, có cache)
    const key = T.indexOf(tr);
    if (this.fromKey !== key) { animA(tr.t0, ka, this.bufFrom); this.fromKey = key; this.prepTransition(tr, ka, kb); }
    const F = this.bufFrom, B = this.bufB, delay = tr._delay, dur = tr._dur, same = tr._same;
    const tint = tr.tint, style = tr.style;
    let flying = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 3, q = i * 4;
      let u = same && same[i] ? 1 : (t - tr.t0 - delay[i]) / dur[i];
      if (u >= 1) {
        outP[j] = B.pos[j]; outP[j + 1] = B.pos[j + 1]; outP[j + 2] = B.pos[j + 2];
        outC[q] = B.col[j]; outC[q + 1] = B.col[j + 1]; outC[q + 2] = B.col[j + 2]; outC[q + 3] = B.bri[i];
        continue;
      }
      if (u <= 0) {
        outP[j] = F.pos[j]; outP[j + 1] = F.pos[j + 1]; outP[j + 2] = F.pos[j + 2];
        outC[q] = F.col[j]; outC[q + 1] = F.col[j + 1]; outC[q + 2] = F.col[j + 2]; outC[q + 3] = F.bri[i];
        continue;
      }
      flying++;
      const e = smoother(u);
      const fx = F.pos[j], fy = F.pos[j + 1], fz = F.pos[j + 2], bx = B.pos[j], by = B.pos[j + 1], bz = B.pos[j + 2];
      const m = midPoint(style, fx, fy, fz, bx, by, bz, i);
      const w0 = (1 - e) * (1 - e), w1 = 2 * (1 - e) * e, w2 = e * e;
      outP[j] = w0 * fx + w1 * m[0] + w2 * bx; outP[j + 1] = w0 * fy + w1 * m[1] + w2 * by; outP[j + 2] = w0 * fz + w1 * m[2] + w2 * bz;
      // màu: ngả sắc "dải sáng" giữa đường bay, rồi về màu đích
      const cm = sstep(0.35, 0.92, u), tw = 0.55 * Math.sin(Math.PI * u);
      for (let c = 0; c < 3; c++) outC[q + c] = lerp(lerp(F.col[j + c], B.col[j + c], cm), tint[c], tw);
      const fb = style === "launch" ? 0 : F.bri[i];
      let b = lerp(fb, B.bri[i], cm);
      if (style === "launch") b = Math.max(b, 0.75 * sstep(0.02, 0.18, u) * (1 - cm) + B.bri[i] * cm);
      else b = Math.max(b, 0.45 * Math.sin(Math.PI * u));
      outC[q + 3] = b;
    }
    this.flying = flying;
    this.flush();
  },
  prepTransition(tr, ka, kb) {
    const N = this.data.N;
    tr._delay = tr._delay || new Float32Array(N); tr._dur = tr._dur || new Float32Array(N);
    for (let i = 0; i < N; i++) { tr._delay[i] = tr.delay(i, ka, kb); tr._dur[i] = tr.dur(i, ka, kb); }
    if (tr.style === "detach") {   // drone vẫn ở nguyên mặt trống: dùng thẳng animator cảnh sau (không bay)
      tr._same = tr._same || new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        tr._same[i] = Math.abs(ka.pos[j] - kb.pos[j]) + Math.abs(ka.pos[j + 1] - kb.pos[j + 1]) + Math.abs(ka.pos[j + 2] - kb.pos[j + 2]) < 0.05 ? 1 : 0;
      }
    } else tr._same = null;
  },
  flush() {
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aCol.needsUpdate = true;
  },

  /* -------- camera điện ảnh (chỉ máy người xem, không ảnh hưởng người khác) -------- */
  setCinematic(on) { this.cine.on = !!on && this.isRunning; if (this.hooks.onCinematic) this.hooks.onCinematic(this.cine.on); },
  toggleCinematic() { this.setCinematic(!this.cine.on); return this.cine.on; },
  // trả về true nếu đã ghi đè camera
  applyCamera(camera, dt) {
    const want = this.cine.on && this.isRunning ? 1 : 0;
    this.cine.k += (want - this.cine.k) * Math.min(1, dt * 1.6);
    if (this.cine.k < 0.002) { this.cine.k = 0; return false; }
    const s = DroneShowConfig.stage, t = this.t;
    const px = 14 * Math.sin(0.045 * t), py = s.height - 48 + 3 * Math.sin(0.06 * t), pz = s.z + 104 + 5 * Math.cos(0.045 * t);
    const tx = s.x, ty = s.height - 2, tz = s.z;
    const k = smoother(clamp(this.cine.k, 0, 1));
    _v1.copy(camera.position);
    camera.position.set(lerp(_v1.x, px, k), lerp(_v1.y, py, k), lerp(_v1.z, pz, k));
    _q1.copy(camera.quaternion);
    _m1.lookAt(camera.position, _v2.set(tx, ty, tz), _up);
    _q2.setFromRotationMatrix(_m1);
    camera.quaternion.copy(_q1).slerp(_q2, k);
    return true;
  },

  /* -------- giao diện: phụ đề cảnh + thông báo -------- */
  caption(title, sub, waiting) {
    let el = document.getElementById("ds-caption");
    if (!el) {
      el = document.createElement("div"); el.id = "ds-caption"; el.setAttribute("aria-live", "polite");
      el.innerHTML = '<p class="eyebrow"><span class="g-icon sm">flight</span> Drone Show</p><div class="ds-title"></div><div class="ds-sub"></div>';
      document.body.appendChild(el);
    }
    if (!title) { el.classList.remove("show"); return; }
    el.querySelector(".ds-title").textContent = title;
    el.querySelector(".ds-sub").textContent = sub || "";
    el.classList.toggle("waiting", !!waiting);
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  },
  toast(msg) { if (this.hooks.toast) this.hooks.toast(msg); else console.info("[DroneShow]", msg); },

  /* -------- công cụ debug (chỉ khi ?droneDebug=1) -------- */
  buildDebug() {
    const el = document.createElement("div");
    el.id = "ds-debug";
    el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:60;background:rgba(10,12,20,.88);color:#e8e6df;font:12px/1.45 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:10px;width:330px;max-width:calc(100vw - 24px);border:1px solid rgba(226,201,138,.35)";
    el.innerHTML = `<b style="color:#e2c98a">Drone Show · debug</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0">
        <button data-a="play">▶ Phát / Dừng</button><button data-a="pause">⏸ Tạm dừng</button><button data-a="restart">↺ Restart</button>
        <select data-a="tier"><option>LOW</option><option selected>BALANCED</option><option>HIGH</option></select></div>
      <input data-a="seek" type="range" min="0" max="154" step="0.1" value="0" style="width:100%">
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-s="${n}">${n}</button>`).join("")}</div>
      <label><input type="checkbox" data-a="glow" checked> Bloom</label>
      <label><input type="checkbox" data-a="traj"> Quỹ đạo</label>
      <label><input type="checkbox" data-a="tgt"> Điểm đích</label>
      <label><input type="checkbox" data-a="cine"> Cinematic</label>
      <div style="margin-top:4px">Scale <input data-a="scale" type="range" min="0.5" max="1.6" step="0.05" value="1" style="width:90px">
        Cao <input data-a="height" type="range" min="50" max="140" step="1" value="88" style="width:90px"></div>
      <div style="margin-top:4px"><button data-a="overlap">Kiểm tra chồng lấn</button> <button data-a="view">Góc nhìn chính</button></div>
      <pre data-a="info" style="margin:6px 0 0;white-space:pre-wrap"></pre>`;
    document.body.appendChild(el);
    el.querySelectorAll("button,select,input").forEach((b) => b.addEventListener("keydown", (e) => e.stopPropagation()));
    const $ = (s) => el.querySelector(s);
    $('[data-a="play"]').onclick = () => (this.isRunning ? this.stop() : this.start({ tier: $('[data-a="tier"]').value }));
    $('[data-a="pause"]').onclick = () => (this.paused ? this.resume() : this.pause());
    $('[data-a="restart"]').onclick = () => { this.stop(); setTimeout(() => this.start({ tier: $('[data-a="tier"]').value }), 50); };
    $('[data-a="tier"]').onchange = (e) => { this.forcedTier = e.target.value; if (this.isRunning) { const t = this.t; this.stop(); this.start({ tier: e.target.value, at: t }); } };
    $('[data-a="seek"]').oninput = (e) => this.seek(+e.target.value);
    el.querySelectorAll("[data-s]").forEach((b) => { b.onclick = () => this.seek(DroneShowConfig.scenes[+b.dataset.s - 1][0] + (+b.dataset.s === 1 ? 9 : 8)); });
    $('[data-a="glow"]').onchange = (e) => this.setGlow(e.target.checked);
    $('[data-a="cine"]').onchange = (e) => this.setCinematic(e.target.checked);
    $('[data-a="traj"]').onchange = (e) => { this.debug.traj = e.target.checked; };
    $('[data-a="tgt"]').onchange = (e) => { this.debug.tgt = e.target.checked; };
    $('[data-a="scale"]').oninput = (e) => { DroneShowConfig.stage.scale = +e.target.value; this.applyStage(); };
    $('[data-a="height"]').oninput = (e) => { DroneShowConfig.stage.height = +e.target.value; this.applyStage(); };
    $('[data-a="overlap"]').onclick = () => { this.debug.overlap = this.checkOverlap(); };
    $('[data-a="view"]').onclick = () => { if (this.hooks.mainView) this.hooks.mainView(); };
    this.debug = { el, info: $('[data-a="info"]'), seek: $('[data-a="seek"]'), tierSel: $('[data-a="tier"]'), traj: false, tgt: false, overlap: null, fps: 0, lastT: performance.now(), n: 0 };
  },
  updateDebugPanel() {
    const d = this.debug, now = performance.now();
    d.n++; if (now - d.lastT > 500) { d.fps = (d.n * 1000) / (now - d.lastT); d.n = 0; d.lastT = now; }
    if (this.isRunning && document.activeElement !== d.seek) d.seek.value = this.t.toFixed(1);
    if (this.tier && document.activeElement !== d.tierSel && d.tierSel.value !== this.tier) d.tierSel.value = this.tier;
    const info = this.renderer.info;
    const st = this.getState();
    d.info.textContent = `t=${st.t.toFixed(1)}s cảnh ${st.scene}/7 ${st.paused ? "(tạm dừng)" : ""}\n` +
      `drone=${st.drones} (${st.tier}) đang bay=${this.flying || 0}\n` +
      `FPS=${d.fps.toFixed(0)} draw calls=${info.render.calls} tri=${info.render.triangles} pts=${info.render.points}\n` +
      `CPU drone show=${st.avgMs} ms/khung\n` + (d.overlap ? `Chồng lấn: ${d.overlap}` : "");
    this.drawDebugGeometry();
  },
  drawDebugGeometry() {
    const d = this.debug;
    if (!d.lines) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3000 * 6), 3));
      d.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.45, depthWrite: false }));
      d.lines.frustumCulled = false; this.group.add(d.lines);
      const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3000 * 3), 3));
      d.tgtPts = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xff44aa, size: 0.6, sizeAttenuation: true, depthWrite: false }));
      d.tgtPts.frustumCulled = false; this.group.add(d.tgtPts);
    }
    d.lines.visible = d.traj && this.isRunning; d.tgtPts.visible = d.tgt && this.isRunning;
    if (!this.isRunning || !this.data) return;
    const N = this.data.N, B = this.bufB, P = this.posArr;
    if (d.traj) {
      const a = d.lines.geometry.attributes.position; let n = 0;
      for (let i = 0; i < N && n < 3000; i += 2) {
        const j = i * 3;
        a.array[n * 6] = P[j]; a.array[n * 6 + 1] = P[j + 1]; a.array[n * 6 + 2] = P[j + 2];
        a.array[n * 6 + 3] = B.pos[j]; a.array[n * 6 + 4] = B.pos[j + 1]; a.array[n * 6 + 5] = B.pos[j + 2]; n++;
      }
      d.lines.geometry.setDrawRange(0, n * 2); a.needsUpdate = true;
    }
    if (d.tgt) {
      const a = d.tgtPts.geometry.attributes.position; const n = Math.min(N, 3000);
      a.array.set(B.pos.subarray(0, n * 3)); d.tgtPts.geometry.setDrawRange(0, n); a.needsUpdate = true;
    }
  },
  checkOverlap(minD = 0.8) {
    if (!this.data) return "chưa có dữ liệu";
    const N = this.data.N, P = this.posArr, cell = 2, grid = new Map();
    let pairs = 0, minSeen = Infinity;
    for (let i = 0; i < N; i++) {
      if (this.colArr[i * 4 + 3] < 0.01) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const L = grid.get(((gx + a) * 73856093) ^ ((gy + b) * 19349663) ^ ((gz + c) * 83492791)); if (!L) continue;
        for (const j of L) { const dd = Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z); if (dd < minSeen) minSeen = dd; if (dd < minD) pairs++; }
      }
      const key = (gx * 73856093) ^ (gy * 19349663) ^ (gz * 83492791);
      (grid.get(key) || grid.set(key, []).get(key)).push(i);
    }
    return `${pairs} cặp < ${minD} m, gần nhất ${minSeen.toFixed(2)} m (t=${this.t.toFixed(1)}s)`;
  },
};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();

/* Điểm giữa Bézier cho từng phong cách chuyển cảnh (không cấp phát: dùng mảng tạm). */
const _m = [0, 0, 0];
function midPoint(style, fx, fy, fz, bx, by, bz, i) {
  const h = hash(i * 7 + 3);
  switch (style) {
    case "launch":   // bay thẳng lên thành dải sáng rồi lượn về đích
      _m[0] = fx + (bx - fx) * 0.12; _m[1] = by - 8 - 10 * h; _m[2] = fz + (bz - fz) * 0.5; break;
    case "unfurl":   // kéo ngang trước (cuộn chiếu dài ra), rồi uốn vào thân rồng
      _m[0] = bx; _m[1] = fy + (by - fy) * 0.15; _m[2] = (fz + bz) / 2 + 5; break;
    case "ribbons":  // võng xuống như dải lụa rồi đặt lên sống núi
      _m[0] = (fx + bx) / 2; _m[1] = Math.min(fy, by) - 7 - 6 * h; _m[2] = (fz + bz) / 2 + 3; break;
    case "split": {  // địa hình tách đôi sang hai bên
      const s = fx >= 0 ? 1 : -1;
      _m[0] = fx * 1.2 + s * 14; _m[1] = (fy + by) / 2 + 4; _m[2] = (fz + bz) / 2 + 8; break;
    }
    case "converge": { // xoáy nhẹ vào tâm chân dung
      const mx = (fx + bx) / 2, my = (fy + by) / 2, a = 0.55;
      _m[0] = (mx * Math.cos(a) - my * Math.sin(a)) * 0.7; _m[1] = (mx * Math.sin(a) + my * Math.cos(a)) * 0.7; _m[2] = (fz + bz) / 2 + 10; break;
    }
    case "spiral": { // xoáy ốc quanh tâm trống
      const mx = (fx + bx) / 2, my = (fy + by) / 2, a = 1.0;
      _m[0] = mx * Math.cos(a) - my * Math.sin(a); _m[1] = mx * Math.sin(a) + my * Math.cos(a); _m[2] = (fz + bz) / 2 + 4; break;
    }
    case "detach":   // rời mặt trống, vồng về phía khán giả
      _m[0] = (fx + bx) / 2; _m[1] = (fy + by) / 2 + 6; _m[2] = Math.max(fz, bz) + 10; break;
    default:         // sweep: vồng lên rồi trải xuống thành lá cờ
      _m[0] = (fx + bx) / 2; _m[1] = Math.max(fy, by) + 6; _m[2] = (fz + bz) / 2 + 5;
  }
  return _m;
}

/* ============================ 7. PHÁO HOA ĐOẠN KẾT (gọi API hệ thống F8 hiện có) ============================
 * Bố trí: bắn ở HAI BÊN (|x| >= 80 m) hoặc RẤT CAO phía sau (y >= 200 m, z <= -170 m) để không che ngôi sao vàng.
 * Lá cờ drone: tâm (0, 88, -100), rộng 96 m, cao 64 m (y 56 -> 120).
 */
function buildFireworkCues() {
  const C = [];
  const fw = (t, fx, x, z, h, o = {}) => C.push({ t, fn: () => window.spawnEffect && window.spawnEffect(fx, { x, z }, Object.assign({ h }, o)) });
  const ground = (t, fx, pad, o = {}) => C.push({ t, fn: () => window.spawnEffect && window.spawnEffect(fx, pad, o) });
  // Lá cờ drone (stage cao 120 m, tỉ lệ 1,15): x ±55 m, y 83..157 m, z -100. Ngôi sao: tâm (0,120), bán kính 22 m.
  // Nhìn từ sân trước (z=37) ngôi sao chiếm phương vị ±9°, đỉnh cờ ở góc ngẩng 48,5°. Pháo đặt xa hơn sẽ hiện THẤP hơn
  // trên màn hình, nên pháo "trên đầu lá cờ" phải đặt sát sau cờ (z≈-122) và rất cao (>= 262 m); pháo hai bên |x| >= 98 m.
  // 137–143: pháo tầm cao vàng kim hai bên, cúc lớn phía sau/bên cạnh, liễu vàng rủ
  for (const s of [-1, 1]) {
    fw(137.0, "chrys", s * 118, -130, 150, { size: "G", c: "gold", core: "champagne" });
    fw(137.7, "palm", s * 98, -126, 112, { c: "gold", arms: 10 });
    fw(138.5, "willow", s * 124, -150, 178, { size: "G" });
    fw(139.3, "chrys", s * 102, -140, 205, { size: "M", c: "red", core: "gold" });
    fw(140.1, "ring", s * 130, -124, 128, { size: "M", c: "gold", inner: "red" });
    fw(141.7, "willow", s * 84, -195, 248, { size: "M" });          // góc trên, phía sau cờ — xa ngôi sao
    fw(142.4, "crackle", s * 104, -118, 96, { c: "white" });
  }
  fw(140.9, "chrys", 0, -122, 262, { size: "G", c: "white", core: "gold" });   // rất cao, ngay trên lá cờ
  // 143–150: GRAND FINALE — nhiều tầng, nổ liên tục, quốc kỳ vẫn giữ nguyên
  ground(143.0, "fan", "L4", { rays: 6, spread: 0.55, v: 66, c: "gold" });
  ground(143.0, "fan", "R4", { rays: 6, spread: 0.55, v: 66, c: "gold" });
  const fx = ["chrys", "peony", "palm", "ring", "chrys", "peony"];
  const col = ["gold", "red", "white", "gold", "red", "champagne"];
  let k = 0;
  for (let t = 143.3; t < 149.7; t += 0.38, k++) {                  // hai cột pháo liên hoàn hai bên, nhiều tầng
    const s = k % 2 ? 1 : -1, x = s * (98 + ((k * 13) % 38)), h = 92 + ((k * 29) % 120);
    fw(t, fx[k % fx.length], x, -116 - ((k * 7) % 40), h, { size: Math.abs(x) > 118 ? "G" : "M", c: col[k % col.length], core: "gold", inner: "white" });
  }
  const high = [[-84, -196, 246, "M"], [84, -196, 252, "M"], [0, -122, 264, "G"], [-70, -205, 258, "M"], [70, -205, 258, "M"]];
  for (let t = 143.8, j = 0; t < 149.5; t += 1.15, j++) {           // tầng rất cao
    const [x, z, h, size] = high[j % high.length];
    fw(t, j % 2 ? "willow" : "chrys", x, z, h, { size, c: "gold", core: "red" });
  }
  fw(147.6, "star", 0, -122, 266, { size: "M", c: "gold" });          // sao vàng pháo hoa — phía trên ngôi sao drone
  for (const x of [-136, -118, -100, 100, 118, 136]) fw(148.6, "chrys", x, -128, 150 + Math.abs(x) * 0.25, { size: "M", c: Math.abs(x) > 110 ? "red" : "gold", core: "white" });
  fw(149.3, "willow", 0, -122, 268, { size: "G" });
  fw(149.5, "willow", -84, -200, 250, { size: "M" });
  fw(149.5, "willow", 84, -200, 250, { size: "M" });
  C.sort((a, b) => a.t - b.t);
  return C;
}

window.DroneShow = DroneShow;
window.DroneShowConfig = DroneShowConfig;
})();

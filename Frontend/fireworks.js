/**
 * ============================================================================
 * FIREWORKS SHOW v2 — "DƯỚI LÁ CỜ VẺ VANG CỦA ĐẢNG" (60 GIÂY)
 * Lấy cảm hứng từ màn pháo hoa mừng thành công Đại hội XIV tại SVĐ Mỹ Đình (23/01/2026):
 *  - Trận địa 1: lớp hỏa thuật trên mái khán đài, xếp vòng cung (đài phun, quạt sao chổi).
 *  - Trận địa 2: dải pháo tầm cao chạy dài phía sau (gần / giữa / xa).
 * Đây là biên đạo lấy cảm hứng về thẩm mỹ & quy mô, KHÔNG phải bản sao trình tự thật.
 *
 * Kiến trúc:
 *  - Mọi quỹ đạo tính giải tích trên GPU (lực cản tuyến tính + trọng lực):
 *      p(t) = p0 + v0·(1-e^{-kt})/k − ĝ·g/k·(t − (1-e^{-kt})/k)
 *    => bán kính nở tối đa của một quả = v0/k (điều khiển chính xác kích thước pattern).
 *  - Đuôi sáng = LineSegments: mỗi sao có 8 đoạn, đỉnh i được tính tại p(age − lag_i),
 *    nên đuôi bám đúng đường cong thật (liễu rủ cong tự nhiên, không phải đường thẳng).
 *  - Hai pool vòng (points + trails), cấp phát 1 lần, chỉ upload dải buffer bị ghi (updateRange).
 *  - Scheduler xác định: cue = thời điểm NỔ; thời điểm PHÓNG = nổ − thời gian bay (tính trước).
 *  - Seeded RNG: cùng seed => cùng show (sẵn sàng đồng bộ multiplayer qua showId/startTime/seed).
 *  - 1 đơn vị Three.js = 1 m (EYE = 1.65 trong app.js).
 * ============================================================================
 */
(() => {
"use strict";

const TAU = Math.PI * 2;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= 1. CẤU HÌNH ================= */
const C = {
  gold:      [1.00, 0.74, 0.28],
  goldDeep:  [1.00, 0.52, 0.12],
  champagne: [1.00, 0.88, 0.62],
  red:       [1.00, 0.10, 0.07],
  redDeep:   [0.80, 0.04, 0.03],
  white:     [1.00, 0.96, 0.90],
  silver:    [0.88, 0.92, 1.00],
  orange:    [1.00, 0.42, 0.08],
  ember:     [0.70, 0.22, 0.05],
  ice:       [0.62, 0.72, 1.00],   // gốc thân cây pháo hoa ánh xanh
};

// Bãi bắn phía sau bảo tàng (mặt tiền z=0 cao 9m, tường sau z≈-24; khán giả mặc định ở z≈37)
// Dải pháo cách khán giả 140–190m, hậu cảnh ~230m
const PADS = {
  // Dải pháo tầm cao — gần (z≈-150..-160), giữa (z≈-170..-185), xa (z≈-195..-205)
  L4: [-112, 0, -105], L3: [-82, 0, -132], L2: [-54, 0, -112], L1: [-26, 0, -142], C1: [-8, 0, -122],
  C2: [10, 0, -150],   R1: [26, 0, -142],  R2: [54, 0, -112],  R3: [82, 0, -132],  R4: [112, 0, -105],
  // Hậu cảnh rất xa (cho các quả nổ "phía sau" màn liễu)
  FL: [-70, 0, -190], FC: [0, 0, -200], FR: [70, 0, -190],
};
// Mái khán đài vòng cung (lớp hỏa thuật) cao 30m
for (let i = 0; i < 9; i++) {
  const x = -80 + i * 20;
  PADS["A" + (i + 1)] = [x, 30, -88 - 0.0025 * x * x];
}
PADS.T0 = [0, 0, -122];   // giàn trung tâm của "cây pháo hoa"
const MORTARS = ["L4", "L3", "L2", "L1", "C1", "C2", "R1", "R2", "R3", "R4"];
const ARC = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];

const FireworksConfig = {
  duration: 60.0,           // phát cue trong 60 giây
  tail: 7.5,                // sau 60s chỉ cho hạt tàn tự nhiên
  shellGravity: 30.0,
  heightScale: 1.22, heightLift: 12,   // nâng toàn bộ độ cao nổ trong cue (h' = h*1.22 + 12, tối đa 268m)       // gia tốc hiệu dụng của vỏ pháo khi bay lên (thời gian bay 1.8–3.9s)
  altitudes: { low: [45, 90], mid: [100, 160], high: [165, 235], extreme: [235, 268] },   // sau khi nâng
  launchPoints: PADS,
  colors: C,
  caps: { points: 32768, trails: 16384, segs: 8 },   // pool gấp đôi cho mật độ x2
  density: 2,   // x2 số quả pháo: mỗi quả tầm cao có thêm 1 quả "song sinh" ở lớp sâu hơn
  qualityBudgets: {
    LOW:      { scale: 0.42, glitter: 0.25, maxStars: 1500 },
    BALANCED: { scale: 0.70, glitter: 0.6,  maxStars: 5000 },
    HIGH:     { scale: 1.00, glitter: 1.0,  maxStars: 8000 },
  },
};

/* ================= 2. QUẢN LÝ CHẤT LƯỢNG ================= */
const FireworksQualityManager = {
  currentTier: (matchMedia && matchMedia("(pointer: coarse)").matches) ? "LOW" : "HIGH",
  samples: [], lastCheck: 0, low: 0, high: 0,
  get budget() { return FireworksConfig.qualityBudgets[this.currentTier]; },
  update(dt) {
    if (dt <= 0.001 || dt > 0.25) return;
    this.samples.push(dt); if (this.samples.length > 90) this.samples.shift();
    const now = performance.now();
    if (now - this.lastCheck < 2000 || this.samples.length < 45) return;
    this.lastCheck = now;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg > 1 / 30) { if (++this.low >= 2) { this.low = 0; this.step(-1); } this.high = 0; }
    else if (avg < 1 / 55) { if (++this.high >= 4) { this.high = 0; this.step(1); } this.low = 0; }
    else this.low = this.high = 0;
  },
  step(d) {
    const order = ["LOW", "BALANCED", "HIGH"];
    const i = Math.max(0, Math.min(2, order.indexOf(this.currentTier) + d));
    if (order[i] !== this.currentTier) this.setTier(order[i]);
  },
  setTier(t) { if (FireworksConfig.qualityBudgets[t]) { this.currentTier = t; console.info("[Fireworks] quality:", t); } },
};

/* ================= 3. ÂM THANH (Tiếng pháo hoa thực tế từ tiengdong.com + Web Audio Spatial 3D) ================= */
const FireworksAudio = {
  // Âm thanh thực tế từ tiengdong.com:
  // - tieng_phao_hoa_no_tren_bau_troi.mp3: Tiếng pháo hoa nổ vang rền trên bầu trời (sky bursts & atmospheric rumble)
  // - tieng_phao_hoa_no.mp3: Tiếng pháo nổ giòn giã, chát chúa và lách tách (crackles & crisp detonations)
  // - tieng_ban_phao_hoa.mp3: Tiếng cối phóng pháo hoa mặt đất (mortar launches)
  // - tieng_phao_hoa_hu_len_troi.mp3: Tiếng rít hú của pháo hoa xé gió bay vút lên trời
  ctx: null, master: null, dry: null, wet: null, enabled: true, muted: false,
  noise: null, pink: null, shot: null, voices: [],
  buffers: {
    skyBoom: null,
    groundBoom: null,
    launch: null,
    whistle: null,
  },
  isLoading: false,
  isLoaded: false,
  ambientNode: null,
  ambientGain: null,

  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AC) this.ctx = new AC();
    const ctx = this.ctx;
    if (ctx && !this.master) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = 0.0005; comp.release.value = 0.18;   // giữ tiếng nổ đanh mà không vỡ tiếng
      this.master = ctx.createGain(); this.master.gain.value = 1.0;
      this.master.connect(comp); comp.connect(ctx.destination);
      const sr = ctx.sampleRate, len = Math.floor(sr * 2.0);
      this.noise = ctx.createBuffer(1, len, sr);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const shotLen = Math.floor(sr * 0.7);
      this.shot = ctx.createBuffer(1, shotLen, sr);
      const sd = this.shot.getChannelData(0);
      for (let i = 0; i < shotLen; i++) {
        const t = i / sr, n = Math.random() * 2 - 1;
        sd[i] = n * (Math.exp(-t / 0.009) + 0.22 * Math.exp(-t / 0.09)) + (t < 0.0015 ? 1 - t / 0.0015 : 0) * 0.9;
      }
      this.pink = ctx.createBuffer(1, len, sr);
      const pd = this.pink.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; pd[i] = (b0 + b1 + b2) * 2.2; }
      // Vang của "sân vận động": impulse response stereo 3.2s tự sinh
      const irLen = Math.floor(sr * 3.2), ir = ctx.createBuffer(2, irLen, sr);
      for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < irLen; i++) { const t = i / sr; x[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / 3.2, 2.2) * (t < 0.02 ? t / 0.02 : 1); } }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      this.wet = ctx.createGain(); this.wet.gain.value = 0.55;
      this.wet.connect(conv); conv.connect(this.master);
      this.dry = ctx.createGain(); this.dry.gain.value = 1.0; this.dry.connect(this.master);
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if (ctx && !this.isLoading && !this.isLoaded) this.loadAudio();
    return ctx;
  },

  loadPromise: null,
  loadAudio() {
    if (this.isLoaded) return Promise.resolve(this.buffers);
    if (this.loadPromise) return this.loadPromise;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    this.isLoading = true;
    const list = [
      { key: "skyBoom", url: "sounds/tieng_phao_hoa_no_tren_bau_troi.mp3" },
      { key: "groundBoom", url: "sounds/tieng_phao_hoa_no.mp3" },
      { key: "launch", url: "sounds/tieng_ban_phao_hoa.mp3" },
      { key: "whistle", url: "sounds/tieng_phao_hoa_hu_len_troi.mp3" }
    ];
    this.loadPromise = Promise.all(list.map(async (item) => {
      try {
        const res = await fetch(item.url);
        if (!res.ok) {
          console.warn("[FireworksAudio] HTTP error fetching:", item.url, res.status);
          return;
        }
        const ab = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        this.buffers[item.key] = decoded;
      } catch (err) {
        console.warn("[FireworksAudio] error decoding:", item.key, err);
      }
    })).then(() => {
      this.isLoaded = true;
      this.isLoading = false;
      if (typeof FireworksShow !== "undefined" && FireworksShow.isRunning && !this.ambientNode) {
        this.startShowAmbient();
      }
      return this.buffers;
    });
    return this.loadPromise;
  },

  startShowAmbient() {
    if (!this.ok()) return;
    this.stopShowAmbient();
    const ctx = this.ctx;
    const buf = this.buffers.skyBoom || this.buffers.groundBoom;
    if (!buf) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 2.0);

      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 6500;

      src.connect(f);
      f.connect(g);
      g.connect(this.master);

      src.start(t, 1.2);
      this.ambientNode = src;
      this.ambientGain = g;
    } catch (e) {}
  },

  stopShowAmbient() {
    if (this.ambientGain && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, t);
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, t + 1.8);
        const node = this.ambientNode;
        setTimeout(() => {
          try { if (node) node.stop(); } catch (e) {}
        }, 1900);
      } catch (e) {}
    }
    this.ambientNode = null;
    this.ambientGain = null;
  },

  geo(x, y, z) {
    const cam = (FireworksShow.camera && FireworksShow.camera.position) || { x: 0, y: 2, z: 37 };
    const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    return { dist, pan: Math.max(-0.85, Math.min(0.85, (x - cam.x) / 120)), att: Math.max(0.18, Math.min(0.9, 210 / (dist + 45))) };
  },
  out(pan, wetAmt = 0.5) {   // nút đầu ra: pan stereo + gửi vang
    const ctx = this.ctx, g = ctx.createGain();
    let node = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = wetAmt; node.connect(s); s.connect(this.wet);
    return g;
  },
  src(buf, t, dur, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buf || this.noise; s.playbackRate.value = rate;
    s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05); return s;
  },
  env(t, peak, a, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  },
  filt(type, f0, f1, t, dur, q = 0.8) {
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    return f;
  },
  ok() { return this.enabled && !this.muted && this.ensure() && this.master; },

  // Một phát "súng": xung đanh lọc theo khoảng cách (xa => đục hơn), tốc độ phát lệch nhẹ cho mỗi phát khác nhau
  shotAt(t, gain, pan, rate, lp, wet) {
    const s = this.ctx.createBufferSource(); s.buffer = this.shot; s.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.5;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.out(pan, wet)); s.start(t); s.stop(t + 0.7);
  },
  thumpAt(t, gain, pan, f0, f1, dur) {
    const o = this.ctx.createOscillator(), g = this.env(t, gain, 0.001, dur);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(this.out(pan, 0.2)); o.start(t); o.stop(t + dur + 0.02);
  },

  // Cối phóng: tiếng bụp uy lực từ file thu âm tieng_ban_phao_hoa.mp3 + tiếng hú xé gió
  launch(x, y, z, ascent = 1.2) {
    if (!this.ok()) return;
    const { dist, pan, att } = this.geo(x, y, z), ctx = this.ctx, t = ctx.currentTime + Math.min(0.4, dist / 340);
    const launchOffsets = [3.58, 5.47, 6.07, 13.01, 14.91, 20.16, 24.10, 35.91];

    if (this.buffers.launch) {
      try {
        const offset = launchOffsets[Math.floor(Math.random() * launchOffsets.length)];
        const dur = 0.85;
        const src = ctx.createBufferSource();
        src.buffer = this.buffers.launch;
        src.playbackRate.value = 0.94 + Math.random() * 0.12;

        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = 2500;

        const g = ctx.createGain();
        const gVal = Math.max(0.25, att * 0.85);
        g.gain.setValueAtTime(gVal, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        src.connect(f); f.connect(g); g.connect(this.out(pan, 0.25));
        src.start(t, offset, dur);
      } catch (e) {
        this.shotAt(t, att * 0.55, pan, 0.42 + Math.random() * 0.1, 900, 0.25);
      }
    } else {
      this.shotAt(t, att * 0.55, pan, 0.42 + Math.random() * 0.1, 900, 0.25);
      this.thumpAt(t, att * 0.7, pan, 120, 45, 0.12);
    }

    // Tiếng rít hú bay vút lên bầu trời (tieng_phao_hoa_hu_len_troi.mp3)
    if (ascent > 0.65) {
      if (this.buffers.whistle) {
        try {
          const wSrc = ctx.createBufferSource();
          wSrc.buffer = this.buffers.whistle;
          const wGain = ctx.createGain();
          const wTime = t + 0.05, wDur = Math.min(1.5, ascent);
          wGain.gain.setValueAtTime(0.0001, wTime);
          wGain.gain.linearRampToValueAtTime(att * 0.45, wTime + 0.2);
          wGain.gain.exponentialRampToValueAtTime(0.0001, wTime + wDur);
          wSrc.connect(wGain); wGain.connect(this.out(pan, 0.3));
          wSrc.start(wTime, 0, wDur);
        } catch (e) {}
      } else if (Math.random() < 0.4) {
        const w = this.src(this.noise, t + 0.05, ascent), wf = this.filt("bandpass", 1400, 3800 + Math.random() * 1500, t + 0.05, ascent, 10);
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.0001, t + 0.05); wg.gain.linearRampToValueAtTime(att * 0.14, t + 0.3);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + ascent);
        w.connect(wf); wf.connect(wg); wg.connect(this.out(pan, 0.3));
      }
    }
  },

  // Tiếng nổ lớn: trích xuất vụ nổ bầu trời chân thực từ tiengdong.com
  boom(x, y, z, power = 1) {
    if (!this.ok()) return;
    const nowMs = performance.now();
    this.voices = this.voices.filter((v) => nowMs - v < 220);
    if (this.voices.length >= 10) return;
    this.voices.push(nowMs);

    const { dist, pan, att } = this.geo(x, y, z), ctx = this.ctx;
    const t = ctx.currentTime + Math.min(0.85, dist / 340) + Math.random() * 0.012;
    const gVal = Math.min(1.5, att * power * 1.25);
    const lpFreq = Math.max(2000, Math.min(14000, 1600000 / (dist + 40)));

    const skyOffsets = [1.62, 3.77, 10.14, 11.67, 16.05, 19.38, 20.62, 25.32, 34.59, 35.89, 41.20, 45.29, 49.65, 54.23];
    const groundOffsets = [0.77, 1.96, 2.92, 6.04, 7.14, 8.03, 9.55, 10.50, 11.42, 13.92, 15.33, 16.24, 18.96, 19.89, 20.96, 21.87, 22.85, 24.47, 25.42, 26.86];

    let buf = null, offset = 0, dur = 2.4;
    if (power >= 1.0 && this.buffers.skyBoom) {
      buf = this.buffers.skyBoom;
      offset = skyOffsets[Math.floor(Math.random() * skyOffsets.length)];
      dur = 2.8;
    } else if (this.buffers.groundBoom) {
      buf = this.buffers.groundBoom;
      offset = groundOffsets[Math.floor(Math.random() * groundOffsets.length)];
      dur = 2.1;
    } else if (this.buffers.skyBoom) {
      buf = this.buffers.skyBoom;
      offset = skyOffsets[Math.floor(Math.random() * skyOffsets.length)];
      dur = 2.4;
    }

    if (buf) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.92 + Math.random() * 0.16;

        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = lpFreq; f.Q.value = 0.6;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(gVal, t);
        gainNode.gain.setValueAtTime(gVal, t + 0.35);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        src.connect(f); f.connect(gainNode); gainNode.connect(this.out(pan, 0.45));
        src.start(t, offset, dur);

        // Rung chấn sub-bass xúc giác (thump rung ngực)
        this.thumpAt(t, gVal * 0.85, pan * 0.4, 90, 36, 0.22);

        // Vọng âm dội lại từ công trình xa (slap echo)
        if (power > 1.1) {
          const echoTime = t + 0.24 + Math.random() * 0.14;
          const echoGain = ctx.createGain();
          echoGain.gain.setValueAtTime(gVal * 0.32, echoTime);
          echoGain.gain.exponentialRampToValueAtTime(0.0001, echoTime + 1.2);
          const echoSrc = ctx.createBufferSource();
          echoSrc.buffer = buf;
          echoSrc.playbackRate.value = 0.88;
          echoSrc.connect(echoGain);
          echoGain.connect(this.out(-pan * 0.7, 0.7));
          echoSrc.start(echoTime, offset + 0.1, 1.2);
        }
      } catch (e) {
        this.shotAt(t, gVal * 1.9, pan, 0.85 + Math.random() * 0.3, lpFreq, 0.45);
        this.thumpAt(t, gVal * 1.1, pan * 0.5, 130, 38, 0.16);
      }
    } else {
      this.shotAt(t, gVal * 1.9, pan, 0.85 + Math.random() * 0.3, lpFreq, 0.45);
      this.thumpAt(t, gVal * 1.1, pan * 0.5, 130, 38, 0.16);
    }
  },

  // Lách tách = chuỗi tiếng nổ tí tách từ file tieng_phao_hoa_no.mp3
  crackle(x, y, z, n = 30, delay = 0.45) {
    if (!this.ok()) return;
    const { dist, pan, att } = this.geo(x, y, z), ctx = this.ctx, t0 = ctx.currentTime + Math.min(0.9, dist / 340) + delay;
    const crackleOffsets = [7.10, 19.85, 22.80, 26.80];

    if (this.buffers.groundBoom) {
      try {
        const offset = crackleOffsets[Math.floor(Math.random() * crackleOffsets.length)];
        const dur = Math.min(1.8, n * 0.05 + 0.4);
        const src = ctx.createBufferSource();
        src.buffer = this.buffers.groundBoom;
        src.playbackRate.value = 1.05 + Math.random() * 0.2;

        const f = ctx.createBiquadFilter();
        f.type = "highpass"; f.frequency.value = 1200;

        const g = ctx.createGain();
        const gVal = att * 0.75;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(gVal, t0 + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(f); f.connect(g); g.connect(this.out(pan + (Math.random() - 0.5) * 0.3, 0.35));
        src.start(t0, offset, dur);
      } catch (e) {}
    }

    try {
      const snapCount = Math.min(12, n);
      for (let k = 0; k < snapCount; k++) {
        const t = t0 + Math.pow(Math.random(), 0.7) * 1.0;
        this.shotAt(t, att * (0.15 + Math.random() * 0.2), pan + (Math.random() - 0.5) * 0.4, 1.8 + Math.random() * 0.8, 8500, 0.3);
      }
    } catch (e) {}
  },
  sizzle(x, y, z, dur = 4.5) {   // tiếng xèo của liễu rủ
    if (!this.ok()) return;
    const { dist, pan, att } = this.geo(x, y, z), ctx = this.ctx, t = ctx.currentTime + Math.min(0.9, dist / 340) + 0.3;
    try {
      const s = this.src(this.noise, t, dur), f = this.filt("highpass", 3500, 6000, t, dur), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(att * 0.16, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.out(pan, 0.5));
    } catch (e) {}
  },
  whoosh(x, y, z, dur = 1.6) {   // quạt sao chổi / đài phun
    if (!this.ok()) return;
    const { pan, att } = this.geo(x, y, z), ctx = this.ctx, t = ctx.currentTime + 0.25;
    try {
      const s = this.src(this.pink, t, dur), f = this.filt("bandpass", 500, 2600, t, dur, 1.2), g = this.env(t, att * 0.45, 0.15, dur);
      s.connect(f); f.connect(g); g.connect(this.out(pan, 0.5));
    } catch (e) {}
  },
  crowd(dur = 6, level = 0.16) {   // tiếng reo hò đám đông dâng lên ở cao trào
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    try {
      for (const [fc, pan] of [[700, -0.6], [1100, 0.6], [1600, 0]]) {
        const s = this.src(this.pink, t, dur, 0.9 + Math.random() * 0.2), f = this.filt("bandpass", fc, fc, t, dur, 0.9);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + 1.2);
        g.gain.setValueAtTime(level, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 3 + Math.random() * 3; lg.gain.value = level * 0.35;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur);
        s.connect(f); f.connect(g); g.connect(this.out(pan, 0.6));
      }
    } catch (e) {}
  },
};

// Tự động mở khoá AudioContext và tải sẵn âm thanh ngay khi người dùng tương tác
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    FireworksAudio.ensure();
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
  window.addEventListener("keydown", unlockAudio, { once: true, passive: true });
}

/* ================= 4. SHADERS ================= */
const GLSL_COMMON = `
  uniform float uTime;
  uniform float uProj;
  attribute vec3 aVel;
  attribute vec4 aTime;   // birth, life, drag k, gravity g
  attribute vec4 aMisc;   // size (m), strobe Hz, seed, trail (s)
  attribute vec3 aColA;
  attribute vec3 aColB;
  varying vec3 vColor;
  varying float vAlpha;
  vec3 simPos(float t) {
    float k = aTime.z; float g = aTime.w;
    vec3 p = position;
    if (k < 0.001) { p += aVel * t; p.y -= 0.5 * g * t * t; }
    else { float e = (1.0 - exp(-k * t)) / k; p += aVel * e; p.y -= g / k * (t - e); }
    return p;
  }
  float lifeAlpha(float u) { return smoothstep(0.0, 0.015, u) * (1.0 - smoothstep(0.55, 1.0, u)); }
  float strobe(float age) {
    if (aMisc.y <= 0.0) return 1.0;
    return fract(age * aMisc.y + aMisc.z) < 0.45 ? 1.0 : 0.1;
  }
`;
const POINT_VS = GLSL_COMMON + `
  void main() {
    float age = uTime - aTime.x; float life = aTime.y;
    if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
    float u = age / life;
    vec4 mv = modelViewMatrix * vec4(simPos(age), 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aMisc.x * uProj / max(1.0, -mv.z) * mix(1.0, 0.55, u);
    vAlpha = lifeAlpha(u) * strobe(age) * clamp(s / 1.8, 0.3, 1.0);
    gl_PointSize = clamp(s, 1.8, 11.0);
    vColor = mix(aColA, aColB, smoothstep(0.05, 0.9, u));
  }
`;
const POINT_FS = `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0 || vAlpha < 0.004) discard;
    float core = exp(-r2 * 16.0); float halo = exp(-r2 * 3.2) * 0.22;
    vec3 col = mix(vColor, vec3(1.0, 0.98, 0.92), core * 0.7);
    gl_FragColor = vec4(col, (core + halo) * vAlpha);
  }
`;
const TRAIL_VS = GLSL_COMMON + `
  attribute float aLag;
  void main() {
    float age = uTime - aTime.x; float life = aTime.y; float tr = aMisc.w;
    if (age < 0.0 || age > life || tr <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
    float u = age / life;
    float tl = max(age - aLag * tr, 0.0);
    vec4 mv = modelViewMatrix * vec4(simPos(tl), 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = lifeAlpha(min(1.0, u * 1.06)) * pow(1.0 - aLag, 1.6) * 0.95 * strobe(age);
    vColor = mix(aColA, aColB, clamp(aLag * 0.85 + u * 0.5, 0.0, 1.0));
  }
`;
// Hạt lửa dọc đuôi: vẽ lại chính các đỉnh của đuôi dưới dạng điểm nhỏ => đuôi dày & lấp lánh, không tốn buffer
const TRAILDOT_VS = TRAIL_VS.replace("vColor = mix(", "gl_PointSize = clamp(0.55 * uProj / max(1.0, -mv.z), 1.4, 4.0) * (1.0 - aLag * 0.5); vAlpha *= 0.75; vColor = mix(");
const TRAIL_FS = `
  varying vec3 vColor; varying float vAlpha;
  void main() { if (vAlpha < 0.004) discard; gl_FragColor = vec4(vColor, vAlpha); }
`;

/* ================= 5. GPU POOL (ring buffer, cấp phát một lần) ================= */
class StarPool {
  constructor(cap, segs, uniforms) {
    this.cap = cap; this.segs = segs; this.vps = segs ? segs * 2 : 1;
    const n = cap * this.vps;
    this.arr = {
      position: new Float32Array(n * 3), aVel: new Float32Array(n * 3),
      aTime: new Float32Array(n * 4), aMisc: new Float32Array(n * 4),
      aColA: new Float32Array(n * 3), aColB: new Float32Array(n * 3),
    };
    this.size = { position: 3, aVel: 3, aTime: 4, aMisc: 4, aColA: 3, aColB: 3 };
    this.geo = new THREE.BufferGeometry();
    for (const k in this.arr) {
      const a = new THREE.BufferAttribute(this.arr[k], this.size[k]);
      a.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute(k, a);
    }
    if (segs) {
      const lag = new Float32Array(n);
      for (let s = 0; s < cap; s++) for (let j = 0; j < segs; j++) {
        lag[s * this.vps + j * 2] = j / segs; lag[s * this.vps + j * 2 + 1] = (j + 1) / segs;
      }
      this.geo.setAttribute("aLag", new THREE.BufferAttribute(lag, 1));
    }
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 120, -140), 2000);
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: segs ? TRAIL_VS : POINT_VS, fragmentShader: segs ? TRAIL_FS : POINT_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mesh = segs ? new THREE.LineSegments(this.geo, mat) : new THREE.Points(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
    if (segs) {
      this.dots = new THREE.Points(this.geo, new THREE.ShaderMaterial({
        uniforms, vertexShader: TRAILDOT_VS, fragmentShader: POINT_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      this.dots.frustumCulled = false; this.dots.renderOrder = 19; this.mesh.add(this.dots);
    }
    this.death = new Float32Array(cap);
    this.head = 0; this.dmin = Infinity; this.dmax = -1; this.drops = 0;
  }
  alloc(birth, life, now) {
    // Dò tiếp tối đa 1024 ô để bỏ qua các sao sống lâu (liễu, tán cây) đang chiếm đầu vòng;
    // chỉ khi cả đoạn đều bận mới coi là đầy -> bỏ (sao phụ/lấp lánh phát sau sao chính nên bị bỏ trước).
    let i = this.head, n = 0;
    while (this.death[i] > now) {
      if (++n > 1024) { this.drops++; return -1; }
      i = (i + 1) % this.cap;
    }
    this.head = (i + 1) % this.cap;
    this.death[i] = birth + life;
    if (i < this.dmin) this.dmin = i; if (i > this.dmax) this.dmax = i;
    return i;
  }
  write(i, s) {
    const A = this.arr;
    for (let v = 0; v < this.vps; v++) {
      const j = i * this.vps + v, j3 = j * 3, j4 = j * 4;
      A.position[j3] = s.p[0]; A.position[j3 + 1] = s.p[1]; A.position[j3 + 2] = s.p[2];
      A.aVel[j3] = s.v[0]; A.aVel[j3 + 1] = s.v[1]; A.aVel[j3 + 2] = s.v[2];
      A.aTime[j4] = s.b; A.aTime[j4 + 1] = s.life; A.aTime[j4 + 2] = s.k; A.aTime[j4 + 3] = s.g;
      A.aMisc[j4] = s.size; A.aMisc[j4 + 1] = s.hz || 0; A.aMisc[j4 + 2] = s.seed || 0; A.aMisc[j4 + 3] = s.tr || 0;
      A.aColA[j3] = s.a[0]; A.aColA[j3 + 1] = s.a[1]; A.aColA[j3 + 2] = s.a[2];
      A.aColB[j3] = s.c[0]; A.aColB[j3 + 1] = s.c[1]; A.aColB[j3 + 2] = s.c[2];
    }
  }
  active(now) { let n = 0; for (let i = 0; i < this.cap; i++) if (this.death[i] > now) n++; return n; }
  flush() {
    if (this.dmax < 0) return;
    for (const k in this.arr) {
      const at = this.geo.attributes[k], sz = this.size[k];
      at.updateRange.offset = this.dmin * this.vps * sz;
      at.updateRange.count = (this.dmax - this.dmin + 1) * this.vps * sz;
      at.needsUpdate = true;
    }
    this.dmin = Infinity; this.dmax = -1;
  }
  clear() {
    this.death.fill(0); this.arr.aTime.fill(0);
    const at = this.geo.attributes.aTime; at.updateRange.offset = 0; at.updateRange.count = -1; at.needsUpdate = true;
    this.head = 0;
  }
  dispose() { this.geo.dispose(); this.mesh.material.dispose(); if (this.dots) this.dots.material.dispose(); }
}

/* ================= 6. TOÁN HỌC DÙNG CHUNG (CPU = GPU) ================= */
function simAt(p, v, k, g, t) {
  if (k < 0.001) return [p[0] + v[0] * t, p[1] + v[1] * t - 0.5 * g * t * t, p[2] + v[2] * t];
  const e = (1 - Math.exp(-k * t)) / k;
  return [p[0] + v[0] * e, p[1] + v[1] * e - g / k * (t - e), p[2] + v[2] * e];
}
function fib(i, n, rot) {        // hướng đều trên mặt cầu (Fibonacci), không dồn ở 2 cực
  const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653 + rot;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const col = (c, fb) => (typeof c === "string" ? C[c] : c) || fb || C.gold;

/* ================= 7. HIỆU ỨNG (pattern) ================= */
const FireworkEffects = {
  show: null,
  get q() { return FireworksQualityManager.budget; },
  n(base, min = 12) { return Math.max(min, Math.round(base * this.q.scale)); },
  emit(s, now) { return this.show.emit(s, now); },
  flash(p, b, now, size = 7, color = C.white) {
    this.emit({ p, v: [0, 0, 0], b, life: 0.16, k: 0, g: 0, size, a: color, c: color }, now);
  },
  // Sao "lấp lánh" dọc đường bay của một sao mẹ (vị trí lấy từ cùng công thức với GPU)
  glitterAlong(p, v, k, g, b, times, now, o = {}) {
    if (Math.random() > this.q.glitter + 0.001 && !o.force) return;
    for (const t of times) {
      const q = simAt(p, v, k, g, t);
      this.emit({ p: q, v: [(Math.random() - 0.5) * 2, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 2], b: b + t,
        life: o.life || 0.6, k: 1.5, g: 4, size: (o.size || 0.42) * 1.5, a: o.a || C.champagne, c: o.c || C.goldDeep,
        hz: o.hz || 14, seed: Math.random() }, now);
    }
  },
  viewerBasis(p) {   // mặt phẳng hướng về người xem (để vòng/ngôi sao đọc rõ hình)
    const cam = (this.show.camera && this.show.camera.position) || { x: 0, y: 2, z: 37 };
    const n = norm3([cam.x - p[0], (cam.y - p[1]) * 0.35, cam.z - p[2]]);
    const u = norm3(cross3([0, 1, 0], n)); const w = cross3(n, u);
    return { n, u, w };
  },

  // ---- A. CHRYSANTHEMUM: cầu 3D, tia sáng có đuôi, lõi tương phản
  chrys(p, b, now, o = {}) {
    const sz = o.size || "M", R = ({ S: 13, M: 24, G: 38 })[sz] * (o.r || 1), k = 1.6;
    const N = this.n(({ S: 90, M: 150, G: 240 })[sz], 50);
    const life = ({ S: 2.2, M: 2.8, G: 3.4 })[sz], rot = Math.random() * TAU;
    const ca = col(o.c, C.gold), cb = col(o.end, mix3(ca, C.ember, 0.55));
    const tr = sz === "G" ? 0.45 : 0.36, head = sz === "G" ? 1.7 : 1.4;
    this.flash(p, b, now, sz === "G" ? 9 : 6);
    const sparks = [];
    for (let i = 0; i < N; i++) {
      const d = fib(i, N, rot), sp = R * k * (0.95 + Math.random() * 0.1);
      const v = scale3(d, sp), L = life * (0.9 + Math.random() * 0.2);
      this.emit({ p, v, b, life: L, k, g: 6, size: head, a: ca, c: cb, tr, seed: Math.random() }, now);
      if (sz !== "S" && i % 3 === 0) sparks.push([v, L]);
    }
    if (o.core) {
      const cc = col(o.core), Nc = this.n(N * 0.32, 16);
      for (let i = 0; i < Nc; i++) {
        const d = fib(i, Nc, rot + 1.3), v = scale3(d, R * 0.42 * k * (0.95 + Math.random() * 0.1));
        this.emit({ p, v, b, life: life * 0.75, k, g: 5, size: 0.8, a: cc, c: mix3(cc, C.ember, 0.4), tr: 0.12 }, now);
      }
    }
    for (const [v, L] of sparks) this.glitterAlong(p, v, k, 6, b, [L * 0.45, L * 0.62, L * 0.78], now);
    return { power: sz === "G" ? 1.5 : 1.1, light: sz === "G" ? 1.3 : 0.8, color: ca };
  },

  // ---- B. PEONY: bông tròn dày, gần như không đuôi, nở & tàn nhanh
  peony(p, b, now, o = {}) {
    const sz = o.size || "M", R = ({ S: 12, M: 19, G: 27 })[sz], k = 2.4;
    const N = this.n(({ S: 110, M: 170, G: 240 })[sz], 50), rot = Math.random() * TAU;
    const ca = col(o.c, C.red), cb = col(o.end, mix3(ca, C.white, 0.15));
    this.flash(p, b, now, 5);
    for (let i = 0; i < N; i++) {
      const v = scale3(fib(i, N, rot), R * k * (0.93 + Math.random() * 0.14));
      this.emit({ p, v, b, life: 1.6 + Math.random() * 0.3, k, g: 5, size: 1.6, a: ca, c: cb, tr: 0.07 }, now);
    }
    return { power: 1.0, light: 0.6, color: ca };
  },

  // ---- C. GOLDEN WILLOW (Kamuro): vòm lớn, 22–38 nhánh chính, mỗi nhánh có sợi phụ + đuôi dài rủ cong, glitter cuối đời
  willow(p, b, now, o = {}) {
    const sz = o.size || "G", R = ({ S: 18, M: 28, G: 40 })[sz] * (o.r || 1), k = 1.25, g = 5.0;
    const B = Math.max(24, Math.round(({ S: 30, M: 42, G: 56 })[sz] * Math.max(0.6, this.q.scale)));
    const life = ({ S: 4.4, M: 5.0, G: 5.8 })[sz], rot = Math.random() * TAU;
    const hd = C.champagne, tl = C.goldDeep;
    this.flash(p, b, now, 8, C.champagne);
    const total = Math.round(B / 0.8); let made = 0;
    const branches = [];
    for (let i = 0; i < total && made < B; i++) {
      const d = fib(i, total, rot); if (d[1] < -0.45) continue; made++;
      const v = scale3(d, R * k * (0.95 + Math.random() * 0.1)); v[1] += 0.18 * R * k;
      const L = life * (0.92 + Math.random() * 0.16);
      this.emit({ p, v, b, life: L, k, g, size: 1.3, a: hd, c: tl, tr: 1.7 }, now);
      branches.push([v, L]);
      const subs = this.q.scale > 0.6 ? 3 : 2;
      for (let s = 0; s < subs; s++) {
        const j = norm3([d[0] + (Math.random() - 0.5) * 0.06, d[1] + (Math.random() - 0.5) * 0.06, d[2] + (Math.random() - 0.5) * 0.06]);
        const vs = scale3(j, Math.hypot(v[0], v[1], v[2]) * (0.86 + s * 0.05)); vs[1] += 0.03 * R * k;
        this.emit({ p, v: vs, b: b + 0.02 * s, life: L * 0.94, k, g, size: 0.8, a: C.gold, c: C.ember, tr: 1.35 }, now);
      }
    }
    for (const [v, L] of branches) {
      const ts = []; for (let t = 2.0; t < L - 0.3; t += 0.55 + Math.random() * 0.3) ts.push(t);
      this.glitterAlong(p, v, k, g, b, ts, now, { life: 0.9, hz: 11, size: 0.45 });
    }
    return { power: 1.4, light: 1.1, color: C.champagne, willow: life };
  },

  // ---- D. RING: vòng tròn rõ trong không gian 3D, đơn hoặc kép, có thể nghiêng
  ring(p, b, now, o = {}) {
    const sz = o.size || "M", R = ({ S: 14, M: 22, G: 32 })[sz], k = 2.0;
    const { n, u, w } = this.viewerBasis(p);
    const tilt = o.tilt !== undefined ? o.tilt : (Math.random() - 0.5) * 0.9;
    // quay vòng quanh trục u một góc tilt => vòng nghiêng (vẫn đọc được là hình tròn/elip)
    const w2 = norm3(mix3(w, n, Math.sin(tilt)));
    const ring = (rad, N, ca, cb, delay) => {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU, d = [u[0] * Math.cos(a) + w2[0] * Math.sin(a), u[1] * Math.cos(a) + w2[1] * Math.sin(a), u[2] * Math.cos(a) + w2[2] * Math.sin(a)];
        this.emit({ p, v: scale3(d, rad * k * (0.985 + Math.random() * 0.03)), b: b + delay, life: 2.4, k, g: 2.0, size: 1.5, a: ca, c: cb, tr: 0.12 }, now);
      }
    };
    const ca = col(o.c, C.gold);
    this.flash(p, b, now, 5);
    ring(R, this.n(84, 48), ca, mix3(ca, C.ember, 0.5), 0);
    if (o.inner) { const ci = col(o.inner); ring(R * 0.55, this.n(56, 32), ci, mix3(ci, C.ember, 0.5), 0.04); }
    return { power: 1.0, light: 0.7, color: ca };
  },

  // ---- E. PALM: 8–12 nhánh dày, đầu nhánh sáng, xòe rồi cong xuống
  palm(p, b, now, o = {}) {
    const arms = o.arms || 10, R = (o.size === "G" ? 40 : 31), k = 1.0, g = 9.8;
    const ca = col(o.c, C.gold), cb = col(o.end, C.orange), rot = Math.random() * TAU;
    this.flash(p, b, now, 6);
    for (let a = 0; a < arms; a++) {
      const az = rot + (a / arms) * TAU + (Math.random() - 0.5) * 0.15;
      const el = 0.35 + Math.random() * 0.75;
      const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      for (let s = 0; s < 3; s++) {
        const j = s === 0 ? d : norm3([d[0] + (Math.random() - 0.5) * 0.05, d[1] + (Math.random() - 0.5) * 0.05, d[2] + (Math.random() - 0.5) * 0.05]);
        const v = scale3(j, R * k * [1.0, 0.95, 1.03][s]);
        this.emit({ p, v, b, life: 3.0, k, g, size: s === 0 ? 2.0 : 1.0, a: s === 0 ? C.white : ca, c: cb, tr: 1.0 }, now);
        if (s === 0) this.glitterAlong(p, v, k, g, b, [0.6, 1.0, 1.4, 1.8, 2.2], now, { size: 0.4 });
      }
    }
    return { power: 1.2, light: 0.8, color: ca };
  },

  // ---- F. MULTI-BREAK: nổ cha -> 6 sao "mang" trên một vòng nghiêng -> nổ con tại đúng vị trí sao mang (-> nổ cháu)
  multi(p, b, now, o = {}) {
    const k = 1.6, R = 22, info = this.chrys(p, b, now, { size: "M", c: o.c || C.gold, end: C.goldDeep, r: 0.9 });
    const { u, w } = this.viewerBasis(p), kids = 6, delay = 0.5, rot = Math.random() * TAU;
    for (let i = 0; i < kids; i++) {
      const a = rot + (i / kids) * TAU;
      const d = norm3([u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a) + 0.1, u[2] * Math.cos(a) + w[2] * Math.sin(a)]);
      const v = scale3(d, R * k);
      this.emit({ p, v, b, life: delay + 0.05, k, g: 6, size: 1.8, a: C.white, c: C.white, tr: 0.25 }, now);
      const q = simAt(p, v, k, 6, delay);
      this.show.at(b + delay, (bb, nn) => {
        const r = this.peony(q, bb, nn, { size: "S", c: o.sub || C.white, end: C.silver });
        FireworksAudio.boom(q[0], q[1], q[2], 0.5);
        if (o.levels === 3) {
          for (let m = 0; m < 3; m++) {
            const dd = norm3([Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5]);
            const v2 = scale3(dd, 10 * 2.4); const q2 = simAt(q, v2, 2.4, 5, 0.42);
            this.show.at(bb + 0.42, (b3, n3) => this.crackle(q2, b3, n3, { small: true, c: C.gold }));
          }
        }
        return r;
      });
    }
    return info;
  },

  // ---- G. COMET FAN: 4–11 sao chổi đuôi dài phóng từ mặt đất theo hình quạt
  fan(pad, b, now, o = {}) {
    const n = Math.round((o.rays || 7) * (FireworksConfig.density >= 2 ? 1.6 : 1)), spread = o.spread || 0.9, V = o.v || 62, k = 0.35, g = 9.8, life = 2.4;
    const lean = o.lean !== undefined ? o.lean : -Math.sign(pad[0]) * 0.12;
    const ca = col(o.c, C.gold), cb = col(o.end, C.goldDeep);
    FireworksAudio.launch(pad[0], pad[1], pad[2], 0); FireworksAudio.whoosh(pad[0], pad[1] + 40, pad[2], 1.8);
    for (let i = 0; i < n; i++) {
      const th = lean + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      const v = [Math.sin(th) * V, Math.cos(th) * V * (0.97 + Math.random() * 0.06), (Math.random() - 0.5) * 3];
      this.emit({ p: pad, v, b, life, k, g, size: 1.8, a: ca, c: cb, tr: 0.65 }, now);
      const ts = []; for (let t = 0.15; t < life - 0.2; t += 0.14) ts.push(t);
      this.glitterAlong(pad, v, k, g, b, ts, now, { life: 0.55, hz: 16, size: 0.38 });
      if (o.endBurst) {
        const q = simAt(pad, v, k, g, life - 0.05);
        this.show.at(b + life - 0.05, (bb, nn) => this.peony(q, bb, nn, { size: "S", c: o.endBurst }));
      }
    }
    return null;
  },

  // ---- H. FOUNTAIN / GERB trên mái khán đài
  fountain(pad, b, now, o = {}) {
    const D = o.dur || 3, H = o.h || 30, g = 9.8, k = 0.3;
    const N = Math.round(D * 60 * FireworksConfig.density * Math.max(0.35, this.q.scale));
    const ca = col(o.c, C.gold), v0 = Math.sqrt(2 * g * H) * 1.12;
    if (!o.quiet) FireworksShow.at(b, () => FireworksAudio.whoosh(pad[0], pad[1], pad[2], D));
    for (let i = 0; i < N; i++) {
      const az = Math.random() * TAU, cone = Math.random() * 0.13, sp = v0 * (0.85 + Math.random() * 0.2);
      const v = [Math.cos(az) * Math.sin(cone) * sp, Math.cos(cone) * sp, Math.sin(az) * Math.sin(cone) * sp];
      this.emit({ p: pad, v, b: b + (i / N) * D, life: 1.5 + Math.random() * 0.5, k, g, size: 0.85, a: ca, c: C.ember,
        tr: i % 3 === 0 ? 0.18 : 0, hz: i % 5 === 0 ? 18 : 0, seed: Math.random() }, now);
    }
    return null;
  },

  // ---- I. CRACKLING: chùm nhỏ rồi vỡ thành hạt nhấp nháy lách tách
  crackle(p, b, now, o = {}) {
    const N = o.small ? 10 : this.n(34, 16), k = 2.0, R = o.small ? 5 : 9;
    const ca = col(o.c, C.white);
    for (let i = 0; i < N; i++) {
      const v = scale3(fib(i, N, Math.random() * TAU), R * k * (0.8 + Math.random() * 0.4));
      const L = 0.55 + Math.random() * 0.25;
      this.emit({ p, v, b, life: L, k, g: 4, size: 0.9, a: ca, c: C.gold, tr: 0.05 }, now);
      const q = simAt(p, v, k, 4, L);
      for (let s = 0; s < 4; s++) {
        this.emit({ p: q, v: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6], b: b + L + Math.random() * 0.25,
          life: 0.22 + Math.random() * 0.15, k: 3, g: 3, size: 0.85, a: C.white, c: ca, hz: 28, seed: Math.random() }, now);
      }
    }
    if (!o.small) FireworksAudio.crackle(p[0], p[1], p[2], 26);
    return o.small ? null : { power: 0.5, light: 0.3, color: ca };
  },

  // ---- K. THÂN "CÂY PHÁO HOA": hàng trăm sao chổi bắn liên tục từ cụm giàn hẹp, toả hình nón (gốc hẹp, ngọn loe)
  trunk(pad, b, now, o = {}) {
    const D = o.dur || 5, rate = Math.round((o.rate || 46) * Math.max(0.45, this.q.scale)), N = Math.round(D * rate);
    const k = 0.3, g = 9.8, spread = o.spread || 0.24;
    FireworksAudio.whoosh(pad[0], pad[1] + 40, pad[2], D);
    for (let i = 0; i < N; i++) {
      const bt = b + (i / N) * D + Math.random() * 0.03;
      const th = (Math.random() * 2 - 1) * spread, ph = (Math.random() * 2 - 1) * spread * 0.6;
      const V = (o.v || 74) * (0.88 + Math.random() * 0.2);
      const v = [Math.sin(th) * V, Math.cos(th) * Math.cos(ph) * V, Math.sin(ph) * V];
      const base = [pad[0] + (Math.random() - 0.5) * 6, pad[1], pad[2] + (Math.random() - 0.5) * 4];
      const life = 1.9 + Math.random() * 0.5;
      this.emit({ p: base, v, b: bt, life, k, g, size: 1.1, a: i % 3 === 0 ? C.ice : C.white, c: C.champagne, tr: 0.85, seed: Math.random() }, now);
      if (i % 3 === 0) this.glitterAlong(base, v, k, g, bt, [0.35, 0.7, 1.05], now, { life: 0.45, hz: 20, size: 0.36, a: C.white, c: C.ice });
    }
    if (FireworksShow.at) for (let t = 0; t < D; t += 0.5) FireworksShow.at(b + t, () => FireworksAudio.crackle(pad[0], 60, pad[2], 8, 0));
    return null;
  },
  // ---- L. TÁN "CÂY PHÁO HOA": vòm liễu vàng liền khối — các sợi xuất hiện dần trên mặt vòm elip,
  // vận tốc nhỏ toả ra ngoài, lực cản + trọng lực nhẹ => rủ xuống thành mành vàng dày, đầu sợi nhấp nháy
  canopy(p, b, now, o = {}) {
    const RX = o.rx || 88, RY = o.ry || 42, RZ = o.rz || 30, D = o.dur || 2.6;
    const N = Math.round((o.n || 520) * Math.max(0.4, this.q.scale)), k = 1.1, g = 9.0;
    for (let i = 0; i < N; i++) {
      const az = Math.random() * TAU, e = -0.25 + Math.pow(Math.random(), 0.8) * 1.75;   // nhiều sợi ở đỉnh & vai vòm
      const ce = Math.cos(Math.min(e, Math.PI / 2)), se = Math.sin(Math.min(e, Math.PI / 2));
      const rr = 0.55 + 0.45 * Math.sqrt(Math.random());
      const q = [p[0] + Math.cos(az) * ce * RX * rr, p[1] + se * RY * rr, p[2] + Math.sin(az) * ce * RZ * rr];
      const out = norm3([q[0] - p[0], (q[1] - p[1]) * 0.3 - 6, q[2] - p[2]]);   // hơi toả ra & chúc xuống => sợi rủ
      const v = scale3(out, 3 + Math.random() * 4);
      // tán nở từ trong ra ngoài: sợi gần tâm xuất hiện trước
      const bt = b + Math.min(1, Math.hypot(q[0] - p[0], q[2] - p[2]) / RX) * D * 0.75 + Math.random() * D * 0.25;
      const life = 3.6 + Math.random() * 1.6;
      this.emit({ p: q, v, b: bt, life, k, g, size: 1.0, a: Math.random() < 0.3 ? C.champagne : C.gold, c: C.ember, tr: 2.4, seed: Math.random() }, now);
      if (i % 2 === 0) this.glitterAlong(q, v, k, g, bt, [0.8 + Math.random(), 2.0 + Math.random() * 1.5], now, { life: 0.8, hz: 13, size: 0.5, a: C.white, c: C.gold });
    }
    if (FireworksShow.at) for (let t = 0; t < D + 2; t += 0.6) FireworksShow.at(b + t, () => FireworksAudio.crackle(p[0] + (Math.random() - 0.5) * RX, p[1], p[2], 14, 0));
    FireworksAudio.sizzle(p[0], p[1], p[2], D + 4);
    return { power: 0.4, light: 1.0, color: C.gold };
  },
  crowd(pad, b, now, o = {}) { FireworksAudio.crowd(o.dur || 6, o.level || 0.16); return null; },

  // ---- J. "SAO VÀNG": pattern ngôi sao 5 cánh hướng về người xem
  star(p, b, now, o = {}) {
    const R = o.size === "M" ? 26 : 36, k = 2.2, { u, w } = this.viewerBasis(p);
    const ca = col(o.c, C.gold), N = this.n(130, 80);
    const vtx = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.40 : 1; vtx.push([Math.cos(a) * r, Math.sin(a) * r]); }
    this.flash(p, b, now, 7, C.champagne);
    for (let i = 0; i < N; i++) {
      const f = (i / N) * 10, e = Math.floor(f), t = f - e, A = vtx[e], Bv = vtx[(e + 1) % 10];
      const x = A[0] + (Bv[0] - A[0]) * t, y = A[1] + (Bv[1] - A[1]) * t;
      const d = [u[0] * x + w[0] * y, u[1] * x + w[1] * y, u[2] * x + w[2] * y];
      this.emit({ p, v: scale3(d, R * k), b, life: 2.8, k, g: 1.0, size: 1.5, a: ca, c: C.goldDeep, tr: 0.08 }, now);
    }
    return { power: 1.3, light: 1.0, color: ca };
  },
};

/* ================= 8. BIÊN ĐẠO 60 GIÂY =================
 * aerial: t = thời điểm NỔ (scheduler tự tính thời điểm phóng). ground: t = thời điểm bắt đầu.
 * h = độ cao nổ (m). Tầng: thấp 30–65, trung 75–120, cao 130–190, cực cao 190–240.
 */
const A = (t, fx, at, h, o = {}) => ({ t, fx, at: [].concat(at), h: [].concat(h), o, aerial: true });
const G = (t, fx, at, o = {}) => ({ t, fx, at: [].concat(at), o, aerial: false });
// Lớp tầm thấp (nổ ~50–85m, bắn từ mái khán đài) & tầm trung (~100–150m, từ dải giàn chính) chạy suốt show,
// xen kẽ trái/phải, màu theo chương. Khi "cây pháo hoa" lên (53.6–60s) chỉ bắn hai cánh để chừa khoảng giữa.
function lowMidLayer() {
  const out = [];
  const pal = (t) => t < 17 ? ["gold", "red"] : t < 27 ? ["gold", "champagne"] : t < 37 ? ["red", "white"] : t < 47 ? ["red", "gold"] : ["gold", "white"];
  const lowFx = ["peony", "chrys", "crackle", "ring", "peony", "palm"];
  const midFx = ["chrys", "peony", "ring", "chrys", "palm"];
  const arcSide = (k, tree) => tree ? (k % 2 ? ["A1", "A2"] : ["A8", "A9"])[k % 2 ? 0 : 1] : ARC[(k * 5 + 2) % 9];
  let k = 0;
  for (let t = 1.2; t < 59.5; t += 0.62, k++) {         // tầng thấp
    const tree = t > 53.4, c = pal(t)[k % 2], fx = lowFx[k % lowFx.length];
    out.push(A(t, fx, arcSide(k, tree), 30 + ((k * 7) % 28), { size: "S", c, inner: fx === "ring" ? "white" : undefined, arms: 8 }));
  }
  k = 0;
  const midL = ["L4", "L3", "L2", "L1"], midR = ["R4", "R3", "R2", "R1"];
  for (let t = 2.0; t < 59.5; t += 0.95, k++) {         // tầng trung
    const tree = t > 53.4, side = k % 2 ? midR : midL;
    const pad = tree ? side[k % 2] : (k % 5 === 4 ? (k % 2 ? "C2" : "C1") : side[(k >> 1) % 4]);
    const fx = midFx[k % midFx.length], c = pal(t)[(k + 1) % 2];
    out.push(A(t, fx, pad, 75 + ((k * 11) % 45), { size: k % 3 === 0 ? "M" : "S", c, core: fx === "chrys" ? "gold" : undefined, inner: fx === "ring" ? "gold" : undefined, arms: 9 }));
  }
  return out;
}
const FireworksCueSheet = [
  // ===== CHƯƠNG 1 — KHAI MÀN (0–8s): mái khán đài bừng sáng, quạt sao chổi vàng đối xứng
  G(0.0, "fountain", ARC, { stagger: 0.12, dur: 2.6, h: 28, c: "gold" }),
  G(0.0, "fan", ["L4", "L3", "R3", "R4"], { rays: 4, spread: 0.55, v: 64 }),
  G(1.4, "fan", ["L2", "R2"], { rays: 5, spread: 0.6, v: 58, c: "champagne" }),
  A(3.5, "chrys", ["L2", "R2"], 105, { size: "M", c: "gold", core: "champagne" }),
  A(4.5, "chrys", "C1", 165, { size: "G", c: "red", core: "gold" }),
  A(5.5, "ring", "L3", 95, { size: "M", c: "gold", inner: "red", tilt: 0.35 }),
  G(5.6, "fan", ["L1", "R1"], { rays: 5, spread: 0.7, v: 56, endBurst: "gold" }),
  A(6.2, "ring", "R3", 95, { size: "M", c: "gold", inner: "red", tilt: -0.35 }),
  A(7.2, "peony", ["L4", "R4"], 70, { size: "S", c: "red" }),

  // ===== CHƯƠNG 2 — BẦU TRỜI NỞ HOA (8–17s)
  A(8.0, "chrys", "L3", 140, { size: "M", c: "gold", core: "champagne" }),
  A(8.65, "chrys", "R3", 145, { size: "M", c: "red", core: "gold" }),
  A(9.3, "chrys", "C2", 172, { size: "M", c: "white", core: "gold" }),
  G(10.0, "fountain", ["A4", "A5", "A6"], { dur: 3, h: 32, c: "champagne" }),
  A(10.2, "palm", ["L2", "R2"], 115, { c: "gold", arms: 10 }),
  A(11.6, "ring", "C1", 160, { size: "G", c: "red", inner: "gold", tilt: 0.3 }),
  A(13.0, "chrys", "L1", 122, { size: "M", c: "gold" }),
  A(13.4, "chrys", "C1", 152, { size: "M", c: "red", core: "gold" }),
  A(13.8, "chrys", "R1", 122, { size: "M", c: "gold" }),
  A(14.6, "multi", "C2", 175, { c: "gold", sub: "white", levels: 2 }),
  A(15.6, "crackle", ["L3", "R3"], 80, { c: "white" }),
  A(16.4, "peony", ["L4", "R4"], 62, { size: "S", c: "gold" }),

  // ===== CHƯƠNG 3 — THÁC VÀNG (17–27s)
  A(17.0, "willow", "FC", 225, { size: "G" }),
  A(18.6, "willow", ["L3", "R3"], 160, { size: "M" }),
  G(20.0, "fountain", ARC, { stagger: 0.1, dur: 3.4, h: 26, c: "champagne" }),
  A(21.5, "chrys", ["FL", "FR"], 175, { size: "M", c: "red", core: "gold" }),
  A(23.0, "crackle", ["L2", "R2"], 92, { c: "white" }),
  A(24.5, "willow", "FR", 142, { size: "S" }),
  A(25.4, "chrys", "C1", 132, { size: "M", c: "gold", core: "red" }),
  A(26.4, "ring", ["L1", "R1"], 110, { size: "M", c: "gold" }),

  // ===== CHƯƠNG 4 — LIÊN HOÀN TĂNG TỐC (27–37s): quét trái -> phải, khoảng cách 0.45s
  ...["L4", "L3", "L2", "L1", "C1", "C2", "R1", "R2", "R3", "R4"].map((pad, i) => {
    const fx = ["ring", "palm", "chrys"][i % 3], h = [92, 122, 150, 106, 172, 135, 115, 146, 124, 96][i];
    return A(27.0 + i * 0.45, fx, pad, h, { size: "M", c: i % 2 ? "red" : "gold", inner: fx === "ring" ? "white" : undefined, core: fx === "chrys" ? "gold" : undefined });
  }),
  G(30.6, "fan", "L1", { rays: 9, spread: 0.55, lean: -0.42, v: 66, c: "gold" }),
  G(30.6, "fan", "R1", { rays: 9, spread: 0.55, lean: 0.42, v: 66, c: "gold" }),
  A(31.6, "chrys", ["L2", "R2"], 140, { size: "M", c: "gold" }),
  A(32.2, "chrys", ["L3", "C1", "R3"], [150, 186, 150], { size: "M", c: "red", core: "gold" }),
  A(33.2, "multi", "C2", 180, { c: "gold", sub: "white", levels: 3 }),
  A(34.3, "crackle", ["L1", "C1", "R1"], 85, { c: "white" }),
  A(35.0, "palm", ["L3", "R3"], 122, { c: "white", end: "gold", arms: 11 }),
  A(35.9, "peony", ["L2", "R2"], 76, { size: "M", c: "red" }),
  A(36.6, "chrys", "FC", 200, { size: "M", c: "gold" }),

  // ===== CHƯƠNG 5 — DƯỚI LÁ CỜ VẺ VANG (37–47s)
  A(37.4, "chrys", ["L4", "R4"], 130, { size: "M", c: "red", core: "gold" }),
  A(37.4, "chrys", ["L1", "R1"], 162, { size: "M", c: "gold", core: "champagne" }),
  A(38.1, "peony", "C1", 115, { size: "M", c: "gold" }),
  A(38.7, "palm", "L2", 125, { c: "gold" }),
  A(39.3, "ring", "R2", 130, { size: "M", c: "red", inner: "gold" }),
  A(39.9, "chrys", "C2", 150, { size: "M", c: "white", core: "gold" }),
  A(40.6, "peony", ["L4", "L3", "L2", "R2", "R3", "R4"], [92, 100, 96, 96, 100, 92], { size: "M", c: "red" }),  // nền đỏ
  A(41.0, "star", "C1", 172, { size: "G", c: "gold" }),                                                       // sao vàng
  A(42.6, "ring", ["L1", "C2", "R1"], [112, 168, 132], { c: "gold", inner: "red", size: "M" }),
  A(43.6, "willow", ["L4", "R4"], 150, { size: "M" }),
  A(44.6, "chrys", "L3", 135, { size: "M", c: "gold" }), A(44.6, "peony", "R3", 120, { size: "M", c: "red" }),
  A(45.3, "palm", ["L1", "R1"], 140, { c: "gold" }), A(45.3, "chrys", "C1", 176, { size: "M", c: "red", core: "gold" }),
  A(46.0, "peony", "L2", 100, { size: "M", c: "white" }), A(46.0, "chrys", "R2", 150, { size: "M", c: "gold" }),

  // ===== CHƯƠNG 6 — GRAND FINALE (47–60s)
  G(47.0, "fan", MORTARS, { rays: 5, spread: 0.5, v: 70, c: "champagne" }),
  G(47.2, "fountain", ARC, { stagger: 0.06, dur: 4.0, h: 34, c: "gold" }),
  G(47.4, "crowd", "C1", { dur: 6, level: 0.14 }),
  A(48.2, "chrys", ["L3", "R3"], 160, { size: "G", c: "red", core: "gold" }),
  A(48.5, "peony", ["L4", "R4"], 90, { size: "S", c: "gold" }),
  A(48.8, "chrys", "C1", 192, { size: "G", c: "gold", core: "red" }),
  A(49.4, "ring", "L2", 120, { c: "gold", inner: "red" }), A(49.65, "palm", "R2", 130, { c: "gold" }),
  A(49.9, "peony", "L1", 95, { c: "white" }), A(50.15, "crackle", "C2", 85, { c: "gold" }),
  A(50.4, "ring", "R1", 150, { c: "red", inner: "gold" }), A(50.65, "palm", "L3", 140, { c: "white", end: "gold" }),
  // FINAL WALL: 10 giàn từ trái sang phải, tầng cao & cực cao cùng sáng
  ...MORTARS.map((pad, i) => A(51.0 + i * 0.1, "chrys", pad, i % 2 ? 196 : 160, { size: "M", c: i < 3 || i > 6 ? "red" : "white", core: "gold" })),
  ...MORTARS.map((pad, i) => A(52.0 + i * 0.07, i % 2 ? "peony" : "ring", pad, i % 2 ? 128 : 148, { size: "M", c: i < 5 ? "gold" : "red", inner: "white" })),
  A(52.8, "crackle", ["L2", "C1", "R2"], 118, { c: "gold" }),

  // CÂY PHÁO HOA — hình ảnh khép màn (53.6s → 60s, còn rủ tới ~64s):
  //  thân: hàng trăm tia trắng ánh xanh bắn liên tục từ mặt đất, loe dần lên;
  //  tán: vòm liễu vàng liền khối xoè từ trong ra ngoài + 7 quả liễu vàng nổ dồn dập trong tán.
  G(53.6, "trunk", "T0", { dur: 6.2, rate: 170, v: 108, spread: 0.27 }),
  G(54.0, "crowd", "C1", { dur: 9, level: 0.2 }),
  A(55.2, "canopy", "T0", 162, { exact: true, rx: 95, ry: 52, rz: 34, dur: 2.8, n: 1500 }),
  ...[0, -34, 34, -64, 64, -16, 16].map((x, i) => A(55.2 + i * 0.3, "willow", "T0", 214 - 0.012 * x * x, { exact: true, ox: x, oz: i % 2 ? -10 : 8, size: Math.abs(x) < 30 ? "G" : "M", r: 0.72 })),
  A(57.4, "canopy", "T0", 186, { exact: true, rx: 72, ry: 34, rz: 26, dur: 1.6, n: 700 }),   // lớp tán thứ hai dày hơn ở đỉnh
  A(58.3, "star", "T0", 262, { exact: true, size: "M", c: "gold" }),                          // ngôi sao vàng trên ngọn cây
  A(58.8, "crackle", ["L3", "R3"], 150, { c: "gold" }),
  ...lowMidLayer(),
];

/* ================= 9. DIRECTOR (biên dịch cue -> sự kiện phóng/nổ đã tính lead-time) ================= */
class FireworksDirector {
  constructor(cues) { this.cues = cues; this.events = []; this.i = 0; }
  static ascent(padY, h) { return Math.sqrt(2 * Math.max(5, h - padY) / FireworksConfig.shellGravity); }
  compile(rng) {
    const ev = [];
    for (const cue of this.cues) {
      cue.at.forEach((name, j) => {
        const pad = PADS[name] || PADS.C1;
        const t = cue.t + (cue.o.stagger || 0) * j;
        if (!cue.aerial) { ev.push({ t, kind: "ground", fx: cue.fx, pad, o: cue.o }); return; }
        const exact = !!cue.o.exact, raw = cue.h[j] !== undefined ? cue.h[j] : cue.h[0];
        const h = exact ? raw : Math.min(268, raw * FireworksConfig.heightScale + FireworksConfig.heightLift) + (rng() - 0.5) * 6;
        const jit = exact ? 0 : 8;
        const burst = [pad[0] + (cue.o.ox || 0) + (rng() - 0.5) * jit, h, pad[2] + (cue.o.oz || 0) + (rng() - 0.5) * jit];
        const T = FireworksDirector.ascent(pad[1], h);
        let tb = t; if (tb - T < 0) tb = T;   // không thể nổ trước khi bay tới
        ev.push({ t: tb - T, kind: "launch", pad, burst, T });
        ev.push({ t: tb, kind: "burst", fx: cue.fx, burst, o: cue.o });
        // Quả song sinh (density x2): cùng kiểu & màu, phóng từ giàn lệch ra ngoài và lùi sâu hơn,
        // nổ trễ 0.15–0.4s, độ cao lệch nhẹ => bầu trời dày gấp đôi mà vẫn giữ nhịp biên đạo.
        if (FireworksConfig.density >= 2 && !exact && cue.fx !== "star") {
          const side = pad[0] > 4 ? 1 : pad[0] < -4 ? -1 : (rng() < 0.5 ? -1 : 1);
          const pad2 = [Math.max(-135, Math.min(135, pad[0] + side * (16 + rng() * 16))), 0, pad[2] - 26 - rng() * 22];
          const h2 = Math.max(45, Math.min(268, h * (0.88 + rng() * 0.18)));
          const burst2 = [pad2[0] + (rng() - 0.5) * 8, h2, pad2[2] + (rng() - 0.5) * 8];
          const T2 = FireworksDirector.ascent(0, h2), tb2 = Math.max(T2, tb + 0.15 + rng() * 0.25);
          ev.push({ t: tb2 - T2, kind: "launch", pad: pad2, burst: burst2, T: T2 });
          ev.push({ t: tb2, kind: "burst", fx: cue.fx, burst: burst2, o: cue.o });
        }
      });
    }
    ev.sort((a, b) => a.t - b.t);
    this.events = ev; this.i = 0;
    return ev;
  }
}

/* ================= 10. SHOW (vòng đời & tích hợp scene hiện có) ================= */
const FireworksShow = {
  scene: null, camera: null, renderer: null,
  points: null, trails: null, uniforms: null, flashLight: null,
  director: null, extra: [],
  isRunning: false, isFinished: true, startTime: 0, elapsed: 0, endAt: 0,
  showId: null, seed: 0, prevNight: null, lastDeath: 0, stats: { peakStars: 0, drops: 0 },

  init(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.uniforms = { uTime: { value: 0 }, uProj: { value: 600 } };
    const caps = FireworksConfig.caps;
    this.points = new StarPool(caps.points, 0, this.uniforms);
    this.trails = new StarPool(caps.trails, caps.segs, this.uniforms);
    scene.add(this.trails.mesh); scene.add(this.points.mesh);
    try {
      this.flashLight = new THREE.PointLight(0xffe2b0, 0, 700, 1.0);
      this.flashLight.position.set(0, 140, -125);
      scene.add(this.flashLight);
    } catch (e) {}
    FireworkEffects.show = this;
    this.director = new FireworksDirector(FireworksCueSheet);
  },

  now() { return performance.now() / 1000; },
  // ghi một sao: luôn có điểm sáng; nếu tr>0 thì thêm đuôi
  emit(s, now) {
    const i = this.points.alloc(s.b, s.life, now); if (i < 0) return false;
    this.points.write(i, s);
    if (s.b + s.life > this.lastDeath) this.lastDeath = s.b + s.life;
    if (s.tr > 0) { const j = this.trails.alloc(s.b, s.life, now); if (j >= 0) this.trails.write(j, s); }
    return true;
  },
  at(absTime, fn) { this.extra.push({ t: absTime, fn }); },

  // opts: { seed, at (giây, để tua nhanh kiểm thử), startTime (ms epoch, cho đồng bộ sau này), showId }
  start(opts = {}) {
    if (this.isRunning) return false;
    FireworksAudio.ensure();
    FireworksAudio.startShowAmbient();
    this.seed = opts.seed >>> 0 || ((Math.random() * 2 ** 31) >>> 0);
    this.showId = opts.showId || ("show-" + this.seed.toString(36));
    const rng = mulberry32(this.seed);
    this.director.compile(rng);
    const now = this.now();
    let at = opts.at || 0;
    if (opts.startTime) at = Math.max(at, (Date.now() - opts.startTime) / 1000);
    this.startTime = now - at;
    this.elapsed = at; this.isRunning = true; this.isFinished = false; this.endAt = 0; this.extra = [];
    this.stats = { peakStars: 0, drops: 0 };
    if (this.prevNight === null && typeof window.getFireworksState === "function") {
      try { this.prevNight = !!window.getFireworksState().isNight; } catch (e) { this.prevNight = false; }
    }
    if (typeof window.toggleDayNight === "function") window.toggleDayNight(true);
    this.freezeAt = opts.freeze ? now : 0;   // chỉ dùng cho kiểm thử: đóng băng đồng hồ GPU tại giây `at`
    if (at > 0) {   // tua: chạy mọi sự kiện đã qua với birth đúng thời điểm (GPU tự tính vị trí hiện tại)
      FireworksAudio.muted = true; this.runEvents(now); FireworksAudio.muted = false;
    }
    return true;
  },
  stop(natural = false) {
    this.freezeAt = 0;
    this.isRunning = false; this.isFinished = true; this.extra = [];
    if (!natural) { this.points.clear(); this.trails.clear(); this.restoreSky(); }
    if (this.flashLight) this.flashLight.intensity = 0;
    FireworksAudio.stopShowAmbient();
  },
  toggle() { if (!this.isRunning) this.start(); },   // không cho chạy 2 show chồng nhau
  restoreSky() {
    if (this.prevNight === false && typeof window.toggleDayNight === "function") window.toggleDayNight(false);
    this.prevNight = null;
  },
  getState() {
    const now = this.now();
    return { running: this.isRunning, elapsed: this.elapsed, showId: this.showId, seed: this.seed,
      tier: FireworksQualityManager.currentTier, activeStars: this.points.active(now), activeTrails: this.trails.active(now),
      drops: this.points.drops + this.trails.drops, peakStars: this.stats.peakStars };
  },

  runEvents(now) {
    const D = this.director, showT = now - this.startTime;
    while (D.i < D.events.length && D.events[D.i].t <= showT) {
      const e = D.events[D.i++], b = this.startTime + e.t, late = showT - e.t > 0.3;
      if (late) FireworksAudio.muted = true;
      this.exec(e, b, now);
      if (late) FireworksAudio.muted = false;
    }
    // sự kiện phụ (nổ con của multi-break, đầu sao chổi...) cũng theo đồng hồ show
    if (this.extra.length) {
      this.extra.sort((a, b) => a.t - b.t);
      while (this.extra.length && this.extra[0].t <= now) {
        const x = this.extra.shift(), late = now - x.t > 0.3, was = FireworksAudio.muted;
        if (late) FireworksAudio.muted = true;
        x.fn(x.t, now);
        FireworksAudio.muted = was;
      }
    }
  },
  exec(e, b, now) {
    const FX = FireworkEffects;
    if (e.kind === "ground") {
      FX[e.fx] && FX[e.fx](e.pad, b, now, e.o);
    } else if (e.kind === "launch") {
      const p = e.pad, T = e.T, g = FireworksConfig.shellGravity;
      const v = [(e.burst[0] - p[0]) / T, g * T, (e.burst[2] - p[2]) / T];
      FX.emit({ p, v, b, life: T + 0.04, k: 0, g, size: 1.3, a: [1, 0.62, 0.28], c: [1, 0.88, 0.6], tr: 0.38 }, now);
      FX.flash(p, b, now, 3, C.goldDeep);
      const ts = []; for (let t = 0.2; t < T; t += 0.22) ts.push(t);
      FX.glitterAlong(p, v, 0, g, b, ts, now, { life: 0.5, hz: 18, size: 0.32, a: C.gold, c: C.ember });
      FireworksAudio.launch(p[0], p[1], p[2], T);
    } else if (e.kind === "burst") {
      const r = FX[e.fx] ? FX[e.fx](e.burst, b, now, e.o) : null;
      if (r) {
        FireworksAudio.boom(e.burst[0], e.burst[1], e.burst[2], r.power);
        if (r.willow) FireworksAudio.sizzle(e.burst[0], e.burst[1], e.burst[2], r.willow * 0.85);
        if (this.flashLight) {
          this.flashLight.position.set(e.burst[0], e.burst[1] * 0.7, e.burst[2] + 40);
          this.flashLight.color.setRGB(r.color[0], Math.min(1, r.color[1] + 0.15), Math.min(1, r.color[2] + 0.2));
          this.flashLight.intensity = Math.min(1.6, this.flashLight.intensity + r.light);
        }
      }
    }
  },

  update(dt, nowMs) {
    if (!this.points) return;
    if (this.freezeAt) { this.uniforms.uTime.value = this.freezeAt; this.points.flush(); this.trails.flush(); this.points.mesh.visible = this.trails.mesh.visible = true; return; }
    const now = nowMs / 1000;
    FireworksQualityManager.update(dt);
    if (this.isRunning) {
      this.elapsed = now - this.startTime;
      this.runEvents(now);
      if (this.elapsed >= FireworksConfig.duration && this.director.i >= this.director.events.length) {
        this.isRunning = false; this.endAt = now + FireworksConfig.tail;   // ngừng phóng mới, cho hạt tàn tự nhiên
        FireworksAudio.stopShowAmbient();
      }
    } else if (this.extra.length) {
      this.runEvents(now);
    } else if (this.endAt && now >= this.endAt) {
      this.endAt = 0; this.isFinished = true; this.points.clear(); this.trails.clear(); this.restoreSky();
      FireworksAudio.stopShowAmbient();
    }
    if (this.flashLight && this.flashLight.intensity > 0.002) this.flashLight.intensity *= Math.exp(-dt * 6);
    // tỉ lệ pixel/mét cho point size (chính xác theo FOV & độ phân giải hiện tại)
    if (this.renderer && this.camera) {
      const h = this.renderer.getContext().drawingBufferHeight;
      this.uniforms.uProj.value = h / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    }
    this.uniforms.uTime.value = now;
    this.points.flush(); this.trails.flush();
    if ((this.isRunning || this.endAt) && now - (this.lastPeak || 0) > 0.5) {   // lấy mẫu số sao đang sống mỗi 0.5s
      this.lastPeak = now;
      const a = this.points.active(now); if (a > this.stats.peakStars) this.stats.peakStars = a;
    }
    const vis = this.isRunning || this.endAt > 0 || this.extra.length > 0 || now < this.lastDeath;
    this.points.mesh.visible = this.trails.mesh.visible = vis;
  },
};

/* ================= 11. EXPORT ================= */
window.FireworksShow = FireworksShow;
window.FireworksDirector = FireworksDirector;
window.FireworksCueSheet = FireworksCueSheet;
window.FireworkEffects = FireworkEffects;
window.FireworksAudio = FireworksAudio;
window.FireworksQualityManager = FireworksQualityManager;
window.FireworksConfig = FireworksConfig;
window.spawnEffect = function (fx, padOrPos, o = {}) {
  const S = FireworksShow; if (!S.points) return;
  const now = S.now();
  const pad = typeof padOrPos === "string" ? (PADS[padOrPos] || PADS.C1) : [padOrPos.x, padOrPos.y || 0, padOrPos.z];
  if (fx === "fan" || fx === "fountain") { FireworkEffects[fx](pad, now, now, o); return; }
  const h = o.h || o.targetHeight || 140, burst = [pad[0], h, pad[2]], T = FireworksDirector.ascent(pad[1], h);
  S.exec({ kind: "launch", pad, burst, T }, now, now);
  S.at(now + T, (b, n) => S.exec({ kind: "burst", fx, burst, o }, b, n));
};
})();

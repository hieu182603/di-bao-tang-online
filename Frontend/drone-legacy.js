/* ============================================================================
 * DRONE LIGHT SHOW — BẢN LƯU 7 ĐỘI HÌNH BLENDER (F6)
 * 7 đội hình lịch sử: Đông Sơn, Lý Thái Tổ, Rồng Lý, Bác Hồ, Điện Biên, Dinh Độc Lập
 * và QUỐC KỲ VIỆT NAM NÂNG CẤP TỪ BẢN 10 CẢNH (21.285 drone, đỏ tươi, sao vàng đặc, lượn sóng)
 * Kết thúc ở giây 150 kết nối tiếp màn pháo hoa nghệ thuật F8
 * ============================================================================ */
(() => {
'use strict';

const N3 = 14000;
const N = 22000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const types = { '<f4': Float32Array, '<i2': Int16Array, u1: Uint8Array, '<u4': Uint32Array };

/* -------- 1. CẤU HÌNH -------- */
const DroneLegacyConfig = {
  duration: 150,
  fadeOut: 4.5,
  tail: 8,
  drones: N,
  revision: 'box-launch-landing-v3-flag-v6-2026',
  assetTag: 'b3-flag6-22k',
  base: 'drone-show/blender-v3/',
  flagBase: 'drone-show/blender-v6/',
  music: 'audio/thinh-vuong-viet-nam-sang-ngoi.mp3',
  stage: { x: 0, height: 120, z: -100, scale: 1.15, pivot: 85 },
  tiers: { LOW: { glow: false }, BALANCED: { glow: true }, HIGH: { glow: true } },
  scenes: [
    [12, 20, "Trống đồng Đông Sơn · Chim Lạc", "Ngôi sao 14 cánh, vành chim Lạc bay ngược chiều kim đồng hồ"],
    [28, 38, "1010 · Vua Lý Thái Tổ ban Chiếu dời đô", "Dời đô từ Hoa Lư về Đại La, đặt tên kinh thành Thăng Long"],
    [46, 58, "Rồng thời Lý", "Thân tròn uốn khúc đều đặn, bờm bay như cờ đuôi nheo, miệng ngậm ngọc"],
    [66, 78, "Chủ tịch Hồ Chí Minh (1890 – 1969)", "“Không có gì quý hơn độc lập, tự do”"],
    [86, 98, "7/5/1954 · Chiến thắng Điện Biên Phủ", "Lá cờ “Quyết chiến Quyết thắng” tung bay trên nóc hầm De Castries"],
    [106, 116, "30/4/1975 · Xe tăng 390 húc đổ cổng chính Dinh Độc Lập", "Giải phóng hoàn toàn miền Nam, thống nhất đất nước"],
    [124, 150, "Quốc kỳ Việt Nam", "Độc lập – Tự do – Hạnh phúc (21.285 drone đỏ tươi, sao vàng đặc)"],
  ]
};

const VS = `
attribute vec4 aCol;
uniform float uProj, uDiameter, uGlow, uEmission;
varying vec3 vEmission;
void main() {
  vec3 emitted = aCol.rgb * aCol.a;
  vEmission = emitted * uEmission;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  if (max(max(emitted.r, emitted.g), emitted.b) < 0.004) {
    gl_Position = vec4(2.0); gl_PointSize = 0.0; return;
  }
  gl_PointSize = clamp(uDiameter * uProj / max(0.01, -mv.z) * (uGlow > 0.5 ? 4.0 : 1.0), 1.0, uGlow > 0.5 ? 22.0 : 9.0);
}`;

const FS = `
uniform float uGlow;
varying vec3 vEmission;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float mask = uGlow > 0.5 ? exp(-r*r*6.0)*0.045 : 1.0-smoothstep(0.62,1.0,r);
  gl_FragColor = vec4(vEmission * mask, 1.0);
  #include <encodings_fragment>
}`;

function buildFireworkCues(timeline) {
  const markers = Object.fromEntries(timeline.fireworks.map(c => [c.name, c.time])), C = [];
  const fw = (t, fx, x, z, h, o = {}) => {
    const flight = window.FireworksDirector ? window.FireworksDirector.ascent(0, h) : 2.5;
    C.push({ t: Math.max(0, t - flight), fn: () => window.spawnEffect && window.spawnEffect(fx, { x, z }, { ...o, h }) });
  };
  const start = markers.FIREWORKS_START || 137, build = markers.FIREWORKS_BUILDUP || 141, finale = markers.FIREWORKS_FINALE || 145, end = markers.FIREWORKS_END || 150;
  for (const side of [-1, 1]) {
    fw(start, 'chrys', side * 124, -130, 165, { size: 'G', c: 'gold' });
    fw(start + 1.4, 'willow', side * 126, -145, 195, { size: 'G' });
    fw(build, 'palm', side * 110, -125, 140, { c: 'gold' });
    fw(build + 1.2, 'ring', side * 130, -130, 155, { c: 'red', inner: 'gold' });
  }
  for (let t = finale, k = 0; t < end - 0.4; t += 0.38, k++) {
    const side = k % 2 ? 1 : -1;
    fw(t, ['chrys', 'peony', 'palm', 'ring'][k % 4], side * (118 + (k % 3) * 9), -130 - (k % 3) * 10, 130 + (k % 4) * 24, { size: k % 3 ? 'M' : 'G', c: ['gold', 'red', 'white'][k % 3] });
  }
  fw(build + 2, 'chrys', 0, -122, 268, { size: 'G', c: 'gold' });
  fw(finale + 1.2, 'willow', 0, -122, 268, { size: 'G' });
  fw(end - 0.7, 'willow', -96, -180, 260, { size: 'G' });
  fw(end - 0.7, 'willow', 96, -180, 260, { size: 'G' });
  C.sort((a, b) => a.t - b.t);
  return C;
}

/* -------- 2. TẢI DỮ LIỆU KẾT HỢP (6 CẢNH V3 + CỜ V6 21.285 DRONE) -------- */
async function loadDataset() {
  async function fetchBuffer(base, path, dtype) {
    const r = await fetch(base + path);
    if (!r.ok) throw Error(path + ': HTTP ' + r.status);
    const raw = await r.arrayBuffer();
    return new types[dtype](raw);
  }

  const [manifest, timeline] = await Promise.all([
    fetch(DroneLegacyConfig.base + 'export_manifest.json').then(r => r.json()),
    fetch(DroneLegacyConfig.base + 'show_timeline.json').then(r => r.json())
  ]);

  const B = {};
  const v3_list = [
    ['launch.f32', '<f4'], ['launch.rgba.u8', 'u1'],
    ['dong_son.position.f32', '<f4'], ['dong_son.motion.i16', '<i2'], ['dong_son.rgb.u8', 'u1'], ['dong_son.brightness.u8', 'u1'],
    ['transition_00.f32', '<f4'], ['transition_00.rgba.u8', 'u1'],
    ['ly_thai_to.position.f32', '<f4'], ['ly_thai_to.motion.i16', '<i2'], ['ly_thai_to.rgb.u8', 'u1'], ['ly_thai_to.brightness.u8', 'u1'],
    ['transition_01.f32', '<f4'], ['transition_01.rgba.u8', 'u1'],
    ['ly_dragon.position.f32', '<f4'], ['ly_dragon.motion.i16', '<i2'], ['ly_dragon.rgb.u8', 'u1'], ['ly_dragon.brightness.u8', 'u1'],
    ['transition_02.f32', '<f4'], ['transition_02.rgba.u8', 'u1'],
    ['ho_chi_minh_lotus.position.f32', '<f4'], ['ho_chi_minh_lotus.motion.i16', '<i2'], ['ho_chi_minh_lotus.rgb.u8', 'u1'], ['ho_chi_minh_lotus.brightness.u8', 'u1'],
    ['transition_03.f32', '<f4'], ['transition_03.rgba.u8', 'u1'],
    ['dien_bien.position.f32', '<f4'], ['dien_bien.motion.i16', '<i2'], ['dien_bien.rgb.u8', 'u1'], ['dien_bien.brightness.u8', 'u1'],
    ['transition_04.f32', '<f4'], ['transition_04.rgba.u8', 'u1'],
    ['reunification.position.f32', '<f4'], ['reunification.motion.i16', '<i2'], ['reunification.rgb.u8', 'u1'], ['reunification.brightness.u8', 'u1'],
    ['transition_05.f32', '<f4'], ['transition_05.rgba.u8', 'u1']
  ];

  const v6_list = [
    ['launch.f32', '<f4'],
    ['vietnam_flag.position.f32', '<f4'], ['vietnam_flag.motion.i16', '<i2'], ['vietnam_flag.brightness.u8', 'u1'],
    ['vietnam_flag.rgb.u8', 'u1'], ['vietnam_flag.color_ids.u32', '<u4'], ['vietnam_flag.color_motion.u8', 'u1']
  ];

  await Promise.all([
    ...v3_list.map(async ([path, dtype]) => { B['v3:' + path] = await fetchBuffer(DroneLegacyConfig.base, path, dtype); }),
    ...v6_list.map(async ([path, dtype]) => { B['v6:' + path] = await fetchBuffer(DroneLegacyConfig.flagBase, path, dtype); })
  ]);

  // Chuẩn bị sẵn vị trí và màu bắt đầu tại t = 116 (kết thúc Dinh Độc Lập) cho toàn bộ 22.000 drone
  const reun_pos = B['v3:reunification.position.f32'], reun_mot = B['v3:reunification.motion.i16'];
  const reun_rgb = B['v3:reunification.rgb.u8'], reun_bri = B['v3:reunification.brightness.u8'];
  const v6_launch = B['v6:launch.f32'];
  const flag_rgb = B['v6:vietnam_flag.rgb.u8'];

  const startPos = new Float32Array(N * 3);
  const startCol = new Float32Array(N * 4);
  const lastFrame = 40, Q = 0.002;
  for (let i = 0; i < N3; i++) {
    const j = i * 3, k = i * 4, s = lastFrame * N3 * 3 + j;
    startPos[j] = reun_pos[j] + reun_mot[s] * Q;
    startPos[j + 1] = reun_pos[j + 1] + reun_mot[s + 1] * Q;
    startPos[j + 2] = reun_pos[j + 2] + reun_mot[s + 2] * Q;
    startCol[k] = reun_rgb[j] / 255;
    startCol[k + 1] = reun_rgb[j + 1] / 255;
    startCol[k + 2] = reun_rgb[j + 2] / 255;
    startCol[k + 3] = reun_bri[lastFrame * N3 + i] / 255;
  }
  for (let i = N3; i < N; i++) {
    const j = i * 3, k = i * 4, lj = i * 10;
    startPos[j] = v6_launch[lj];
    startPos[j + 1] = v6_launch[lj + 1];
    startPos[j + 2] = v6_launch[lj + 2];
    startCol[k] = flag_rgb[j] / 255;
    startCol[k + 1] = flag_rgb[j + 1] / 255;
    startCol[k + 2] = flag_rgb[j + 2] / 255;
    startCol[k + 3] = 0; // drone mặt đất ban đầu tắt đèn
  }

  return { manifest, timeline, buffers: B, startPos, startCol, N };
}

/* -------- 3. HÀM TÍNH TOÁN TOẠ ĐỘ VÀ MÀU SẮC (CPU EVALUATE) -------- */
function evaluateFrame(D, time, pos, rgba, pivot = 85) {
  const t = clamp(time, 0, 150);
  const B = D.buffers;

  // Giai đoạn 1: 0 -> 116s (6 đội hình lịch sử v3)
  if (t < 116) {
    const hold = D.timeline.formations.find(c => t >= c.start && t < c.end && c.formation !== 'vietnam_flag');
    if (hold) {
      const key = hold.formation;
      const base = B['v3:' + key + '.position.f32'], motion = B['v3:' + key + '.motion.i16'], rgb = B['v3:' + key + '.rgb.u8'], bri = B['v3:' + key + '.brightness.u8'];
      const phase = clamp((t - hold.start) * hold.sample_hz, 0, hold.sample_count - 1);
      const a = Math.floor(phase), b = Math.min(a + 1, hold.sample_count - 1), w = phase - a, Q = hold.position_quantum_m;
      const a3 = a * N3 * 3, b3 = b * N3 * 3, an = a * N3, bn = b * N3;
      for (let i = 0; i < N3; i++) {
        const j = i * 3, k = i * 4;
        for (let c = 0; c < 3; c++) {
          pos[j + c] = base[j + c] + (motion[a3 + j + c] * (1 - w) + motion[b3 + j + c] * w) * Q - (c === 1 ? pivot : 0);
          rgba[k + c] = rgb[j + c] / 255;
        }
        rgba[k + 3] = (bri[an + i] * (1 - w) + bri[bn + i] * w) / 255;
      }
      const v6_launch = B['v6:launch.f32'];
      for (let i = N3; i < N; i++) {
        const j = i * 3, k = i * 4, lj = i * 10;
        pos[j] = v6_launch[lj]; pos[j + 1] = v6_launch[lj + 1] - pivot; pos[j + 2] = v6_launch[lj + 2];
        rgba[k] = 0; rgba[k + 1] = 0; rgba[k + 2] = 0; rgba[k + 3] = 0;
      }
      return;
    }

    const cue = D.timeline.transitions.find(c => t >= c.start && t < c.end && c.index < 7);
    if (cue) {
      const g = B['v3:' + cue.geometry], colors = B['v3:' + cue.colors], duration = cue.end - cue.start;
      for (let i = 0; i < N3; i++) {
        const j = i * 10, k = i * 4, ci = i * 8;
        const u = clamp((t - cue.start - g[j + 9]) / (duration - g[j + 9]), 0, 1);
        const q = u * u * u * (u * (6 * u - 15) + 10);
        const arc = 16 * q * q * (1 - q) * (1 - q);
        for (let c = 0; c < 3; c++) pos[i * 3 + c] = g[j + c] + (g[j + 3 + c] - g[j + c]) * q + g[j + 6 + c] * arc - (c === 1 ? pivot : 0);
        for (let c = 0; c < 4; c++) rgba[k + c] = (colors[ci + c] * (1 - q) + colors[ci + 4 + c] * q) / 255;
      }
      const v6_launch = B['v6:launch.f32'];
      for (let i = N3; i < N; i++) {
        const j = i * 3, k = i * 4, lj = i * 10;
        pos[j] = v6_launch[lj]; pos[j + 1] = v6_launch[lj + 1] - pivot; pos[j + 2] = v6_launch[lj + 2];
        rgba[k] = 0; rgba[k + 1] = 0; rgba[k + 2] = 0; rgba[k + 3] = 0;
      }
      return;
    }
  }

  const flag_pos = B['v6:vietnam_flag.position.f32'];
  const flag_rgb = B['v6:vietnam_flag.rgb.u8'];
  const flag_bri = B['v6:vietnam_flag.brightness.u8'];
  const flag_mot = B['v6:vietnam_flag.motion.i16'];
  const flag_cids = B['v6:vietnam_flag.color_ids.u32'];
  const flag_cmot = B['v6:vietnam_flag.color_motion.u8'];

  // Giai đoạn 2: 116 -> 124s (Chuyển tiếp mượt mà từ Dinh Độc Lập vào Quốc kỳ 22.000 drone)
  if (t < 124) {
    const u = clamp((t - 116) / 8.0, 0, 1);
    const q = u * u * u * (u * (6 * u - 15) + 10);
    const arc = 16 * q * q * (1 - q) * (1 - q);
    const startP = D.startPos, startC = D.startCol;
    for (let i = 0; i < N; i++) {
      const j = i * 3, k = i * 4;
      const tx = flag_pos[j], ty = flag_pos[j + 1], tz = flag_pos[j + 2];
      const tb = flag_bri[i] / 255;
      pos[j] = startP[j] + (tx - startP[j]) * q;
      pos[j + 1] = startP[j + 1] + (ty - startP[j + 1]) * q + (i >= N3 ? 12 : 5) * arc - pivot;
      pos[j + 2] = startP[j + 2] + (tz - startP[j + 2]) * q;
      for (let c = 0; c < 3; c++) rgba[k + c] = startC[k + c] * (1 - q) + (flag_rgb[j + c] / 255) * q;
      rgba[k + 3] = startC[k + 3] * (1 - q) + tb * q;
    }
    return;
  }

  // Giai đoạn 3: 124 -> 150s (Lá cờ Quốc kỳ Việt Nam 21.285 drone v6 hoàn mỹ, lượn sóng tuần hoàn)
  const elapsed = (t - 124) % 23.0;
  const phase = clamp(elapsed * 10, 0, 230);
  const a = Math.floor(phase), b = Math.min(a + 1, 230), w = phase - a, Q = 0.002;
  const a3 = a * N * 3, b3 = b * N * 3, an = a * N, bn = b * N;
  for (let i = 0; i < N; i++) {
    const j = i * 3, k = i * 4;
    for (let c = 0; c < 3; c++) {
      pos[j + c] = flag_pos[j + c] + (flag_mot[a3 + j + c] * (1 - w) + flag_mot[b3 + j + c] * w) * Q - (c === 1 ? pivot : 0);
      rgba[k + c] = flag_rgb[j + c] / 255;
    }
    rgba[k + 3] = (flag_bri[an + i] * (1 - w) + flag_bri[bn + i] * w) / 255;
  }

  // Sóng màu 30Hz
  const phaseC = clamp(elapsed * 30, 0, 690);
  const aC = Math.floor(phaseC), bC = Math.min(aC + 1, 690), wC = phaseC - aC;
  const count = 3126;
  for (let i = 0; i < count; i++) {
    const id = flag_cids[i];
    for (let ch = 0; ch < 3; ch++) {
      rgba[id * 4 + ch] = (flag_cmot[(aC * count + i) * 3 + ch] * (1 - wC) + flag_cmot[(bC * count + i) * 3 + ch] * wC) / 255;
    }
  }
}

/* -------- 4. TRÌNH ĐIỀU KHIỂN SHOW (F6) -------- */
const DroneLegacyShow = {
  isRunning: false, pending: false, paused: false, t: 0, tier: 'BALANCED', seed: 0,
  generation: 0, data: null, loading: null, music: null, endAt: 0,
  stats: { frames: 0, ms: 0 }, frameAvg: 0, combo: true, fwStarted: false,

  init(scene, camera, renderer, hooks = {}) {
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.hooks = hooks;
    this.group = new THREE.Group();
    this.group.name = 'DroneLegacyShowStage';
    this.group.visible = false;
    this.applyStage();
    scene.add(this.group);
  },

  applyStage() {
    const s = DroneLegacyConfig.stage;
    this.group.position.set(s.x, s.height, s.z);
    this.group.scale.setScalar(s.scale);
    this.group.updateMatrixWorld(true);
    if (this.geo) this.worldSphere = this.geo.boundingSphere.clone().applyMatrix4(this.group.matrixWorld);
  },

  pickTier() {
    const q = new URLSearchParams(location.search).get('drones');
    return q && DroneLegacyConfig.tiers[q.toUpperCase()] ? q.toUpperCase() : this.forcedTier || (matchMedia('(pointer: coarse)').matches ? 'LOW' : 'BALANCED');
  },

  async load() {
    if (this.data) return this.data;
    if (!this.loading) {
      const begun = performance.now();
      this.loading = loadDataset().then(D => {
        this.data = D;
        this.buildGpu(D.N);
        this.warmShaders();
        this.stats.loadMs = performance.now() - begun;
        return D;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  },

  warmShaders() {
    const FS = window.FireworksShow, meshes = FS && FS.points ? [FS.points.mesh, FS.trails.mesh] : [], vis = meshes.map(m => m.visible), gv = this.group.visible;
    meshes.forEach(m => { m.visible = true; });
    this.group.visible = true;
    try { this.renderer.compile(this.scene, this.camera); }
    catch (e) { console.warn('[DroneLegacyShow] shader warm-up skipped', e); }
    finally { meshes.forEach((m, i) => { m.visible = vis[i]; }); this.group.visible = gv; }
  },

  buildGpu(droneCount) {
    this.disposeGpu();
    this.posArr = new Float32Array(droneCount * 3);
    this.colArr = new Float32Array(droneCount * 4);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9, -13), 140);
    this.applyStage();
    this.frustum = new THREE.Frustum();
    this.viewProj = new THREE.Matrix4();
    this.lastT = NaN;
    this.uniforms = {
      uProj: { value: 600 },
      uDiameter: { value: 0.44 },
      uEmission: { value: 3.2 }
    };
    const material = glow => new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uGlow: { value: glow ? 1 : 0 } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, toneMapped: false
    });
    this.points = new THREE.Points(g, material(false)); this.points.frustumCulled = true; this.points.renderOrder = 22;
    this.glow = new THREE.Points(g, material(true)); this.glow.frustumCulled = true; this.glow.renderOrder = 21;
    this.group.add(this.points, this.glow);
    this.setTier(this.tier);
  },

  setTier(tier) {
    if (!DroneLegacyConfig.tiers[tier]) return;
    this.tier = tier;
    if (this.glow) this.glow.visible = DroneLegacyConfig.tiers[tier].glow;
  },

  setGlow(on) { if (this.glow) this.glow.visible = !!on; },

  disposeGpu() {
    for (const key of ['points', 'glow']) {
      if (this[key]) { this.group.remove(this[key]); this[key].material.dispose(); this[key] = null; }
    }
    if (this.geo) { this.geo.dispose(); this.geo = null; }
  },

  ensureMusic() {
    if (!this.music) {
      this.music = new Audio(DroneLegacyConfig.music);
      this.music.preload = 'auto';
      this.music.volume = 0.55;
      this.music.muted = !!this.hooks.soundEnabled && !this.hooks.soundEnabled();
    }
    return this.music;
  },

  unlockMusic() {
    const a = this.ensureMusic();
    if (this.isRunning && !this.paused) { this.syncMusic(true); return; }
    a.volume = 0;
    const p = a.play();
    if (p) p.then(() => { if (!this.isRunning) a.pause(); }).catch(() => {});
  },

  syncMusic(force = false) {
    const a = this.ensureMusic(), t = this.paused ? this.t : (performance.now() - this.startPerf) / 1000, end = this.musicEnd();
    if (!this.isRunning || this.paused || t >= end) { a.pause(); return; }
    const musicTime = Math.max(0, t);
    if (a.readyState >= 1 && (force || Math.abs(a.currentTime - musicTime) > 0.45)) a.currentTime = musicTime;
    a.volume = 0.55 * Math.min(1, Math.max(0, (end - t) / (this.combo ? 5 : 2)));
    if (a.paused) {
      const p = a.play();
      if (p) p.then(() => { this.audioBlocked = false; }).catch(e => {
        if (e.name === 'AbortError') return;
        if (!this.audioBlocked) console.warn('[DroneLegacyShow] Nhạc cần tương tác người dùng:', e.name);
        this.audioBlocked = true;
      });
    }
  },

  fwConfig() { return window.FireworksConfig || { duration: 45, tail: 7.5 }; },
  musicEnd() { return this.combo ? DroneLegacyConfig.duration + this.fwConfig().duration + 4 : DroneLegacyConfig.duration; },
  showEnd() { return this.combo ? DroneLegacyConfig.duration + this.fwConfig().duration + this.fwConfig().tail : DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut + DroneLegacyConfig.tail; },

  syncCombo() {
    const FS = window.FireworksShow;
    if (!this.combo || !FS) return;
    const fwT = this.t - DroneLegacyConfig.duration;
    if (fwT < 0) {
      if (this.fwStarted) { FS.stop(false); this.fwStarted = false; }
      return;
    }
    if (this.fwStarted || fwT >= this.fwConfig().duration) return;
    this.fwStarted = true;
    const inFlight = FS.extra ? FS.extra.slice() : [];
    FS.start({ seed: this.seed, at: fwT, showId: this.showId + '-fw', keepSky: true });
    if (FS.extra) FS.extra.push(...inFlight);
    FS.prevNight = null;
  },

  async start(opts = {}) {
    if (this.isRunning || this.pending) return false;
    if (window.DroneShow && (window.DroneShow.isRunning || window.DroneShow.pending)) {
      window.DroneShow.stop(false);
    }
    if (window.FireworksShow && window.FireworksShow.isRunning && !this.fwStarted) {
      window.FireworksShow.stop(false);
    }
    this.unlockMusic();
    const token = ++this.generation;
    this.pending = true;
    this.seed = opts.seed >>> 0 || ((Math.random() * 2 ** 31) >>> 0);
    this.startTime = opts.startTime || 0;
    try {
      await this.load();
    } catch (e) {
      if (token === this.generation) { this.pending = false; this.ensureMusic().pause(); }
      console.warn('[DroneLegacyShow]', e);
      return false;
    }
    if (token !== this.generation) return false;
    this.pending = false;

    if (!this.startTime) this.startTime = opts.at !== undefined ? Date.now() - opts.at * 1000 : Date.now();
    const at = Math.max(opts.at === undefined ? 0 : opts.at, (Date.now() - this.startTime) / 1000);
    this.stats.initialAt = at;
    this.combo = opts.combo !== undefined ? !!opts.combo : true;
    this.fwStarted = false;

    if (at > (this.combo ? this.musicEnd() : DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut)) {
      this.ensureMusic().pause(); return false;
    }
    this.setTier(opts.tier || this.pickTier());
    this.showId = opts.showId || DroneLegacyConfig.assetTag + (this.combo ? '-combo-' : '-') + this.seed;
    this.startPerf = performance.now() - at * 1000;
    this.t = at; this.paused = false; this.isRunning = true; this.endAt = 0;

    this.cues = buildFireworkCues(this.data.timeline);
    this.cueIdx = 0;
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t < at) this.cueIdx++;

    this.prevNight = !!(window.getFireworksState && window.getFireworksState().isNight);
    if (window.toggleDayNight) window.toggleDayNight(true, false);

    this.group.visible = at < DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut;
    this.computeFrame(at);
    this.syncCombo();
    this.syncMusic(true);
    return true;
  },

  stop(natural = false) {
    ++this.generation; this.pending = false;
    const wasRunning = this.isRunning || this.endAt;
    this.isRunning = false; this.paused = false; this.endAt = 0;
    if (this.group) this.group.visible = false;
    if (this.music) { this.music.pause(); this.music.currentTime = 0; }
    if (this.fwStarted && !natural && window.FireworksShow) {
      window.FireworksShow.stop(false);
    }
    this.fwStarted = false;
    if (wasRunning && !natural && window.FireworksShow && !window.FireworksShow.isRunning) {
      window.FireworksShow.extra = [];
    }
    if (wasRunning && this.prevNight === false && window.toggleDayNight) {
      window.toggleDayNight(false, false);
    }
    this.prevNight = null;
  },

  pause() {
    if (this.isRunning && !this.paused) {
      this.t = (performance.now() - this.startPerf) / 1000;
      this.paused = true;
      if (this.music) this.music.pause();
    }
  },

  resume() {
    if (this.isRunning && this.paused) {
      this.paused = false;
      this.startPerf = performance.now() - this.t * 1000;
      this.syncMusic(true);
    }
  },

  seek(t) {
    if (!this.isRunning) return;
    this.t = Math.max(0, Math.min(this.combo ? this.showEnd() : DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut, t));
    this.startPerf = performance.now() - this.t * 1000;
    this.endAt = 0;
    if (this.fwStarted && window.FireworksShow) {
      window.FireworksShow.stop(false);
      this.fwStarted = false;
    }
    this.cueIdx = 0;
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t < this.t) this.cueIdx++;
    if (window.FireworksShow && !window.FireworksShow.isRunning) window.FireworksShow.extra = [];
    this.group.visible = this.t < DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut;
    this.computeFrame(this.t);
    this.syncCombo();
    this.syncMusic(true);
  },

  sceneIndex(t) {
    const scenes = DroneLegacyConfig.scenes;
    let k = 0;
    for (let i = 0; i < scenes.length; i++) if (t >= scenes[i][0]) k = i;
    return k;
  },

  getState() {
    return {
      running: this.isRunning,
      pending: this.pending,
      paused: this.paused,
      t: +(this.isRunning && !this.paused ? (performance.now() - this.startPerf) / 1000 : this.t).toFixed(3),
      frameT: this.t,
      combo: !!this.combo,
      fireworks: !!this.fwStarted,
      musicEnd: this.musicEnd(),
      tier: this.tier,
      drones: this.data ? this.data.N : 0,
      revision: DroneLegacyConfig.assetTag,
      showId: this.showId,
      seed: this.seed,
      scene: this.sceneIndex(this.t) + 1,
      avgMs: this.stats.frames ? this.stats.ms / this.stats.frames : 0,
      loadMs: this.stats.loadMs,
      initialAt: this.stats.initialAt,
      musicPlaying: !!this.music && !this.music.paused,
      audioBlocked: !!this.audioBlocked
    };
  },

  computeFrame(t) {
    evaluateFrame(this.data, t, this.posArr, this.colArr, DroneLegacyConfig.stage.pivot);
    if (t > DroneLegacyConfig.duration) {
      const f = Math.max(0, 1 - (t - DroneLegacyConfig.duration) / DroneLegacyConfig.fadeOut);
      for (let i = 3; i < this.colArr.length; i += 4) this.colArr[i] *= f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aCol.needsUpdate = true;
    this.lastT = t;
  },

  inView() {
    if (!this.worldSphere) return true;
    const c = this.camera;
    c.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    return this.frustum.intersectsSphere(this.worldSphere);
  },

  update(dt, now) {
    if (!this.isRunning) return;
    const begun = performance.now();
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.95 + dt * 50 : dt * 1000;
    if (!this.paused) this.t = (now - this.startPerf) / 1000;
    if ((!this.endAt || this.combo) && window.getFireworksState && !window.getFireworksState().isNight && window.toggleDayNight) {
      window.toggleDayNight(true, false);
    }
    if (!this.paused) {
      while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= this.t) {
        const c = this.cues[this.cueIdx++];
        if (this.t - c.t < 0.6) c.fn();
      }
    }
    const minStep = this.tier === 'LOW' || this.frameAvg > 22 ? 1 / 30 : 0;
    if (this.group.visible && this.t !== this.lastT && !(Math.abs(this.t - this.lastT) < minStep) && this.inView()) {
      this.computeFrame(this.t);
    }
    this.uniforms.uProj.value = this.renderer.getContext().drawingBufferHeight / (2 * Math.tan(this.camera.fov * Math.PI / 360)) * DroneLegacyConfig.stage.scale;
    if (now - (this.lastMusicSync || 0) > 750) {
      this.lastMusicSync = now;
      this.syncMusic();
    }
    if (!this.paused) this.syncCombo();
    if (this.t >= DroneLegacyConfig.duration + DroneLegacyConfig.fadeOut && !this.endAt) {
      this.group.visible = false;
      this.endAt = now + (this.showEnd() - this.t) * 1000;
    }
    if (this.endAt && now >= this.endAt) this.stop(true);
    this.stats.frames++;
    this.stats.ms += performance.now() - begun;
  },

  dispose() {
    this.stop();
    this.disposeGpu();
    if (this.music) {
      this.music.removeAttribute('src');
      this.music.load();
      this.music = null;
    }
    if (this.group) this.scene.remove(this.group);
  }
};

window.DroneLegacyShow = DroneLegacyShow;
window.DroneLegacyConfig = DroneLegacyConfig;
})();

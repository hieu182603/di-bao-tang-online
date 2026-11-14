/* Approved Blender export decoder. Coordinates are already Y-up; row i is drone ID i. */
(function (root) {
  'use strict';
  const REVISION = 'ten-scenes-v6-2026-11-14';
  const MANIFEST_HASH = '8b8c5ee48818edd62ca08322f513d47d563305fd283e2c77f67f907b7d5da1ee';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const types = { '<f4': Float32Array, '<i2': Int16Array, u1: Uint8Array, '<u4': Uint32Array };
  function validate(manifest, timeline, buffers) {
    if (manifest.schema !== 'vn-source-guided-drone/1.1' || manifest.revision !== REVISION || timeline.revision !== REVISION || manifest.endianness !== 'little') throw Error('Unsupported Blender revision/schema');
    if (!Number.isInteger(manifest.drone_count) || manifest.drone_count <= 0 || !manifest.id_order.includes('fixed drone ID')) throw Error('Invalid drone ID convention');
    for (const e of manifest.files) {
      const a = buffers[e.path], T = types[e.dtype];
      if (!T || !(a instanceof T) || a.byteLength !== e.bytes || a.length !== e.shape.reduce((n, v) => n * v, 1)) throw Error('Invalid buffer: ' + e.path);
      if (T === Float32Array) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw Error('Nonfinite: ' + e.path);
    }
    const N = manifest.drone_count;
    for (const c of timeline.formations) {
      if (buffers[c.formation + '.position.f32'].length !== N * 3 || buffers[c.formation + '.motion.i16'].length !== c.sample_count * N * 3 || buffers[c.formation + '.brightness.u8'].length !== c.sample_count * N) throw Error('Invalid formation shape');
      if (c.color_animation) for (const id of buffers[c.color_animation.ids]) if (id >= N) throw Error('Invalid color drone ID');
    }
    return { manifest, timeline, buffers, N };
  }
  // Giữ lại mỗi `stride`-th drone (ID 0, stride, 2·stride…) của một mảng đã giải mã; trục drone là trục có kích thước = N0.
  function thin(arr, shape, N0, stride) {
    const ax = shape.indexOf(N0); if (ax < 0) return { arr, shape };
    const keep = Math.ceil(N0 / stride), outer = shape.slice(0, ax).reduce((n, v) => n * v, 1), inner = shape.slice(ax + 1).reduce((n, v) => n * v, 1);
    const out = new arr.constructor(outer * keep * inner);
    for (let o = 0; o < outer; o++) for (let i = 0; i < keep; i++) {
      const src = (o * N0 + i * stride) * inner, dst = (o * keep + i) * inner;
      for (let c = 0; c < inner; c++) out[dst + c] = arr[src + c];
    }
    const sh = shape.slice(); sh[ax] = keep; return { arr: out, shape: sh };
  }
  // opts.stride > 1 (điện thoại): chỉ giữ 1/stride số drone ngay khi tải xong từng tệp → RAM và CPU mỗi khung giảm stride lần.
  async function load(base, opts = {}) {
    const stride = Math.max(1, opts.stride | 0);
    async function get(path, json) {
      const r = await fetch(base + path); if (!r.ok) throw Error(path + ': HTTP ' + r.status);
      if (!json) return r.arrayBuffer();
      const raw = await r.arrayBuffer();
      if (path === 'export_manifest.json' && globalThis.crypto && crypto.subtle) {
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), b => b.toString(16).padStart(2, '0')).join('');
        if (digest !== MANIFEST_HASH) throw Error('Unexpected Blender manifest hash');
      }
      return JSON.parse(new TextDecoder().decode(raw));
    }
    const [manifest, timeline] = await Promise.all([get('export_manifest.json', true), get('show_timeline.json', true)]);
    if (manifest.revision !== REVISION || manifest.schema !== 'vn-source-guided-drone/1.1') throw Error('Blender asset revision mismatch');
    const buffers = {}, queue = manifest.files.slice(), N0 = manifest.drone_count, files = [];
    // Lite: bản đồ ID màu (color_ids) phải xử lý trước để các tệp màu theo ID lọc cùng một tập drone.
    const idsPaths = new Set(timeline.formations.filter(c => c.color_animation).map(c => c.color_animation.ids));
    const idsKept = {}, idsDone = {};
    for (const p of idsPaths) idsDone[p] = new Promise(res => { idsKept[p] = res; });
    const rgbToIds = Object.fromEntries(timeline.formations.filter(c => c.color_animation).map(c => [c.color_animation.rgb, c.color_animation.ids]));
    if (stride > 1) queue.sort((a, b) => idsPaths.has(b.path) - idsPaths.has(a.path));
    // Limit simultaneous downloads; cache this load promise in the show, not each replay.
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const e = queue.shift();
        if (!/^[a-z0-9_.]+$/i.test(e.path) || !types[e.dtype]) throw Error('Invalid asset entry');
        const raw = await get(e.path, false);
        if (raw.byteLength !== e.bytes) throw Error('Truncated ' + e.path);
        if (globalThis.crypto && crypto.subtle) {
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), b => b.toString(16).padStart(2, '0')).join('');
          if (hash !== e.sha256) throw Error('SHA256 mismatch: ' + e.path);
        }
        let arr = new types[e.dtype](raw), entry = e;
        if (stride > 1) {
          if (idsPaths.has(e.path)) {            // chỉ giữ ID chia hết cho stride, đánh số lại theo chỉ số mới
            const pos = [], ids = [];
            arr.forEach((id, i) => { if (id % stride === 0) { pos.push(i); ids.push(id / stride); } });
            arr = Uint32Array.from(ids); entry = { ...e, shape: [arr.length] }; idsKept[e.path](pos);
          } else if (rgbToIds[e.path]) {         // [mẫu, count, 3] → giữ đúng các cột của ID còn lại
            const pos = await idsDone[rgbToIds[e.path]], S = e.shape[0], C = e.shape[1], out = new arr.constructor(S * pos.length * 3);
            for (let k = 0; k < S; k++) for (let i = 0; i < pos.length; i++) for (let c = 0; c < 3; c++) out[(k * pos.length + i) * 3 + c] = arr[(k * C + pos[i]) * 3 + c];
            arr = out; entry = { ...e, shape: [S, pos.length, 3] };
          } else { const t = thin(arr, e.shape, N0, stride); arr = t.arr; entry = { ...e, shape: t.shape }; }
          entry.bytes = arr.byteLength;
        }
        buffers[e.path] = arr; files.push(entry);
      }
    }));
    if (stride > 1) {
      for (const c of timeline.formations) if (c.color_animation) c.color_animation.count = buffers[c.color_animation.ids].length;
      return validate({ ...manifest, drone_count: Math.ceil(N0 / stride), files }, timeline, buffers);
    }
    return validate(manifest, timeline, buffers);
  }
  // Timeline emission gain (flag scene): smoothstep up over ramp_up, down over ramp_down; 1 elsewhere.
  function emissionGain(timeline, t) {
    const g = timeline.emission_gain; if (!g) return 1;
    const s = (x, a, b) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
    return 1 + (g.value - 1) * s(t, g.ramp_up[0], g.ramp_up[1]) * (1 - s(t, g.ramp_down[0], g.ramp_down[1]));
  }
  // Writes into preallocated float arrays; usable independently of Three.js for parity tests.
  // rgba[3] is brightness x emission gain, so it can exceed 1 during the flag scene.
  function evaluate(D, time, pos, rgba, pivot = 0) {
    evaluateRaw(D, time, pos, rgba, pivot);
    const gain = emissionGain(D.timeline, clamp(time, 0, D.timeline.duration));
    if (gain !== 1) for (let k = 3; k < rgba.length; k += 4) rgba[k] *= gain;
  }
  function evaluateRaw(D, time, pos, rgba, pivot) {
    const t = clamp(time, 0, D.timeline.duration), N = D.N, B = D.buffers;
    const hold = D.timeline.formations.find(c => t >= c.start && (t < c.end || t === D.timeline.duration && c.end === t));
    if (hold) {
      const key = hold.formation, base = B[key + '.position.f32'], motion = B[key + '.motion.i16'], rgb = B[key + '.rgb.u8'], bri = B[key + '.brightness.u8'];
      const phase = clamp((t - hold.start) * hold.sample_hz, 0, hold.sample_count - 1), a = Math.floor(phase), b = Math.min(a + 1, hold.sample_count - 1), w = phase - a, Q = hold.position_quantum_m;
      const a3 = a * N * 3, b3 = b * N * 3, an = a * N, bn = b * N;
      for (let i = 0; i < N; i++) {
        const j = i * 3, k = i * 4;
        for (let c = 0; c < 3; c++) { pos[j + c] = base[j + c] + (motion[a3 + j + c] * (1 - w) + motion[b3 + j + c] * w) * Q - (c === 1 ? pivot : 0); rgba[k + c] = rgb[j + c] / 255; }
        rgba[k + 3] = (bri[an + i] * (1 - w) + bri[bn + i] * w) / 255;
      }
      if (hold.color_animation) {
        const c = hold.color_animation, ids = B[c.ids], colors = B[c.rgb], phase = clamp((t - hold.start) * c.sample_hz, 0, c.sample_count - 1), a = Math.floor(phase), b = Math.min(a + 1, c.sample_count - 1), w = phase - a;
        for (let i = 0; i < c.count; i++) for (let ch = 0; ch < 3; ch++) rgba[ids[i] * 4 + ch] = (colors[(a * c.count + i) * 3 + ch] * (1 - w) + colors[(b * c.count + i) * 3 + ch] * w) / 255;
      }
      return;
    }
    const cue = D.timeline.transitions.find(c => t >= c.start && (t < c.end || t === D.timeline.duration && c.end === t));
    if (!cue) throw Error('Timeline gap: ' + t);
    const g = B[cue.geometry], colors = B[cue.colors], duration = cue.end - cue.start;
    for (let i = 0; i < N; i++) {
      const j = i * 10, k = i * 4, ci = i * 8, u = clamp((t - cue.start - g[j + 9]) / (duration - g[j + 9]), 0, 1), q = u * u * u * (u * (6 * u - 15) + 10), arc = 16 * q * q * (1 - q) * (1 - q);
      for (let c = 0; c < 3; c++) pos[i * 3 + c] = g[j + c] + (g[j + 3 + c] - g[j + c]) * q + g[j + 6 + c] * arc - (c === 1 ? pivot : 0);
      for (let c = 0; c < 4; c++) rgba[k + c] = (colors[ci + c] * (1 - q) + colors[ci + 4 + c] * q) / 255;
    }
  }
  const api = { REVISION, types, validate, load, evaluate, emissionGain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DroneBlender = api;
})(globalThis);

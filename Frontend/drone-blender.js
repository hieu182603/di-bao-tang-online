/* Approved Blender export decoder. Coordinates are already Y-up; row i is drone ID i. */
(function (root) {
  'use strict';
  const REVISION = 'box-launch-landing-v3-2026-11-12';
  const MANIFEST_HASH = '6d4770113720d6a6dc63b25cdbd0f4a31b4a2ac3e2e76c30cbf4af9a167cafa0';
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
  async function load(base) {
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
    const buffers = {}, queue = manifest.files.slice();
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
        buffers[e.path] = new types[e.dtype](raw);
      }
    }));
    return validate(manifest, timeline, buffers);
  }
  // Writes into preallocated float arrays; usable independently of Three.js for parity tests.
  function evaluate(D, time, pos, rgba, pivot = 0) {
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
  const api = { REVISION, types, validate, load, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DroneBlender = api;
})(globalThis);

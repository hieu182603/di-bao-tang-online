// Sửa khớp nối trong bản xuất Blender v6 (không có tệp .blend gốc trong repo nên sửa thẳng trên dữ liệu):
//  - ho_chi_minh_lotus: cánh tay vẫy (nhóm 2) nằm trước thân ~4.7 m -> lùi về sát vai.
//  - ly_dragon: ba chân (nhóm 3) nằm trước bụng 3–13 m, chân giữa không chạm thân, đùi chân sau thấp hơn bụng 3 m,
//    chân trượt/rách khi thân uốn -> mỗi chân dời về sát bụng và uốn mềm theo các drone thân quanh đùi.
//  - chua_mot_cot: 667 drone nhóm "cột" (màu hồng của sen) nằm lùi sau bông sen vài mét, 315 con trùng chỗ với drone sen
//    -> trùng thì tắt, còn lại kéo lên đúng mặt bông sen và chuyển động theo drone sen gần nhất (hết loang lổ).
// Cập nhật luôn điểm cuối/đầu của hai đoạn chuyển cảnh kề bên, sha256 trong manifest, MANIFEST_HASH và assetTag.
// Chạy lại an toàn: phần nào đã khớp thì bỏ qua.  node scripts/drone-show/fix_v6_joints.js
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..'), DIR = path.join(ROOT, 'Frontend/drone-show/blender-v6');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'export_manifest.json')));
const timeline = JSON.parse(fs.readFileSync(path.join(DIR, 'show_timeline.json')));
const N = manifest.drone_count, GAP = 0.5;   // khoảng cách độ sâu còn lại tại khớp (≈ 1 khoảng drone) để drone không chồng lên nhau
const read = (f, T) => { const b = fs.readFileSync(path.join(DIR, f)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const write = (f, a) => fs.writeFileSync(path.join(DIR, f), Buffer.from(a.buffer));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const changed = new Set();

function load(form) {
  const hold = timeline.formations.find((c) => c.formation === form);
  const tin = timeline.transitions.find((c) => c.formation === form);
  const tout = timeline.transitions.find((c) => c.start === hold.end);
  return { form, S: hold.sample_count, Q: hold.position_quantum_m, tin: tin.geometry, tout: tout.geometry, tinC: tin.colors, toutC: tout.colors,
    bri: read(form + '.brightness.u8', Uint8Array), briChanged: false,
    pos: read(form + '.position.f32', Float32Array), mot: read(form + '.motion.i16', Int16Array),
    grp: read(form + '.group.u8', Uint8Array), act: read(form + '.active.u8', Uint8Array) };
}
const ids = (F, g) => { const r = []; for (let i = 0; i < N; i++) if (F.grp[i] === g && F.act[i]) r.push(i); return r; };
function nearestXY(F, i, pool) {   // drone gần nhất (theo mặt nhìn thẳng) trong pool
  let best = -1, d = Infinity; const x = F.pos[i * 3], y = F.pos[i * 3 + 1];
  for (const j of pool) { const dd = Math.hypot(F.pos[j * 3] - x, F.pos[j * 3 + 1] - y); if (dd < d) { d = dd; best = j; } }
  return [best, d];
}
function contacts(F, part, body, r = 1.0) {
  const out = []; for (const i of part) { const [j, d] = nearestXY(F, i, body); if (d < r) out.push([i, j]); } return out;
}
function shift(F, part, v) { for (const i of part) for (let c = 0; c < 3; c++) F.pos[i * 3 + c] += v[c]; }

// ---- cánh tay Bác Hồ: chỉ lùi độ sâu, giữ nguyên động tác vẫy
const H = load('ho_chi_minh_lotus');
{
  const arm = ids(H, 2), torso = ids(H, 1), cs = contacts(H, arm, torso);
  const dz = median(cs.map(([i, j]) => H.pos[i * 3 + 2] - H.pos[j * 3 + 2]));
  console.log('HCM arm: contacts', cs.length, 'depth step', dz.toFixed(2), 'm');
  if (dz > GAP + 0.2) { shift(H, arm, [0, 0, -(dz - GAP)]); changed.add(H.form); }
}

// ---- chân rồng
const R = load('ly_dragon');
{
  const legsAll = ids(R, 3), body = ids(R, 1);
  const xs = legsAll.map((i) => [R.pos[i * 3], i]).sort((a, b) => a[0] - b[0]), legs = [[]];
  for (let k = 0; k < xs.length; k++) { if (k && xs[k][0] - xs[k - 1][0] > 5) legs.push([]); legs[legs.length - 1].push(xs[k][1]); }
  for (const leg of legs) {
    const lo = Math.min(...leg.map((i) => R.pos[i * 3])), hi = Math.max(...leg.map((i) => R.pos[i * 3]));
    let cs = contacts(R, leg, body);
    if (cs.length < 6) {   // chân không chạm thân trên mặt nhìn thẳng: kéo điểm gần nhất tới sát bụng
      let bi = -1, bj = -1, bd = Infinity;
      for (const i of leg) { const [j, d] = nearestXY(R, i, body); if (d < bd) { bd = d; bi = i; bj = j; } }
      if (bd > GAP) {
        const k = (bd - GAP * 0.8) / bd;
        shift(R, leg, [(R.pos[bj * 3] - R.pos[bi * 3]) * k, (R.pos[bj * 3 + 1] - R.pos[bi * 3 + 1]) * k, 0]); changed.add(R.form);
      }
      cs = contacts(R, leg, body);
    }
    // đùi chân (dải trên cùng) phải chạm bụng: đo khe dọc giữa đỉnh chân và đáy thân theo từng dải x rộng 2 m
    const topY = Math.max(...leg.map((i) => R.pos[i * 3 + 1])), band = leg.filter((i) => R.pos[i * 3 + 1] > topY - 2);
    const gaps = [];
    for (let x = Math.floor(Math.min(...band.map((i) => R.pos[i * 3]))); x < Math.max(...band.map((i) => R.pos[i * 3])); x += 2) {
      const L = band.filter((i) => R.pos[i * 3] >= x && R.pos[i * 3] < x + 2); if (!L.length) continue;
      const ly = Math.max(...L.map((i) => R.pos[i * 3 + 1]));
      const B = body.filter((j) => R.pos[j * 3] >= x && R.pos[j * 3] < x + 2 && R.pos[j * 3 + 1] > ly - 3);
      if (B.length) gaps.push(Math.min(...B.map((j) => R.pos[j * 3 + 1])) - ly);
    }
    const gap = median(gaps);
    if (gap > 0.8) { shift(R, leg, [0, gap - GAP * 0.8, 0]); changed.add(R.form); }
    cs = contacts(R, leg, body);
    const dz = median(cs.map(([i, j]) => R.pos[i * 3 + 2] - R.pos[j * 3 + 2]));
    if (Math.abs(dz - GAP) > 0.2) { shift(R, leg, [0, 0, -(dz - GAP)]); changed.add(R.form); }
    // chuyển động: cả chân đi theo các drone thân quanh đùi (bán kính 3 m)
    const top2 = leg.filter((i) => R.pos[i * 3 + 1] > topY + Math.max(0, gap - GAP * 0.8) - 2);
    let anchor = body.filter((j) => top2.some((i) => Math.hypot(R.pos[i * 3] - R.pos[j * 3], R.pos[i * 3 + 1] - R.pos[j * 3 + 1]) < 3));
    if (anchor.length < 8) anchor = [...new Set(cs.map(([, j]) => j))];   // đỉnh chân không nằm dưới bụng: neo vào chỗ chân chạm thân
    if (!anchor.length) throw Error('dragon leg without anchors');
    const S = R.S;
    let slide = 0;
    // Chân uốn mềm theo thân: mỗi drone chân đi theo trung bình (trọng số Gauss, σ = 3 m theo khoảng cách lúc đứng yên)
    // chuyển động của các drone thân neo -> khớp không trượt, đùi dài nằm dọc bụng uốn theo bụng, chân không rách.
    const at = (i, s, c) => R.pos[i * 3 + c] + R.mot[(s * N + i) * 3 + c] * R.Q;
    const rest = leg.map((i) => [0, 1, 2].map((c) => at(i, 0, c))), a0 = anchor.map((j) => [0, 1, 2].map((c) => at(j, 0, c)));
    const W = rest.map((p) => {
      const d2 = a0.map((q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2), m = Math.min(...d2);
      const w = d2.map((d) => Math.exp(-(d - m) / (2 * 9))), t = w.reduce((x, y) => x + y, 0);
      return w.map((x) => x / t);
    });
    for (let s = 0; s < S; s++) {
      const dA = anchor.map((j, k) => [0, 1, 2].map((c) => at(j, s, c) - a0[k][c]));
      leg.forEach((i, n) => {
        for (let c = 0; c < 3; c++) {
          let d = 0; for (let k = 0; k < anchor.length; k++) d += W[n][k] * dA[k][c];
          const o = (s * N + i) * 3 + c, v = Math.round((rest[n][c] + d - R.pos[i * 3 + c]) / R.Q);
          slide = Math.max(slide, Math.abs(R.mot[o] - v)); R.mot[o] = v;
        }
      });
    }
    if (slide > 0) changed.add(R.form);
    console.log(`dragon leg x[${lo.toFixed(0)},${hi.toFixed(0)}] n=${leg.length}: contacts ${cs.length}, depth step was ${dz.toFixed(2)} m, thigh gap ${gap.toFixed(2)} m, anchors ${anchor.length}, max motion change ${(slide * R.Q).toFixed(2)} m`);
  }
}

// ---- bông sen dưới chùa Một Cột
const P = load('chua_mot_cot');
{
  const pillar = ids(P, 2), lotus = ids(P, 3), S = P.S;
  let off = 0, moved = 0;
  for (const i of pillar) {
    // phần cột nằm sau bông sen (thấp hơn ngọn sen): cả những drone giữa các lỗ cánh sen (cách tới 3 m)
    const [j, d] = nearestXY(P, i, lotus); if (d >= (P.pos[i * 3 + 1] < 64 ? 3.0 : 1.2)) continue;
    if (d < 0.3) {   // trùng chỗ một drone sen: tắt hẳn
      let lit = false; for (let s = 0; s < S; s++) if (P.bri[s * N + i]) { lit = true; P.bri[s * N + i] = 0; }
      if (lit) { off++; P.briChanged = true; changed.add(P.form); }
      continue;
    }
    let diff = Math.abs(P.pos[i * 3 + 2] - P.pos[j * 3 + 2]) > 0.01;
    for (let s = 0; s < S && !diff; s++) for (let c = 0; c < 3; c++) if (P.mot[(s * N + i) * 3 + c] !== P.mot[(s * N + j) * 3 + c]) diff = true;
    if (!diff) continue;
    P.pos[i * 3 + 2] = P.pos[j * 3 + 2];
    for (let s = 0; s < S; s++) for (let c = 0; c < 3; c++) P.mot[(s * N + i) * 3 + c] = P.mot[(s * N + j) * 3 + c];
    moved++; changed.add(P.form);
  }
  console.log('pagoda lotus: pillar drones turned off', off, 'moved onto lotus surface', moved);
}

// ---- ghi tệp + nối lại hai đoạn chuyển cảnh kề bên
for (const F of [H, R, P]) {
  if (!changed.has(F.form)) continue;
  const gin = read(F.tin, Float32Array), gout = read(F.tout, Float32Array), last = (F.S - 1) * N;
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
    gin[i * 10 + 3 + c] = F.pos[i * 3 + c] + F.mot[i * 3 + c] * F.Q;
    gout[i * 10 + c] = F.pos[i * 3 + c] + F.mot[(last + i) * 3 + c] * F.Q;
  }
  write(F.form + '.position.f32', F.pos); write(F.form + '.motion.i16', F.mot); write(F.tin, gin); write(F.tout, gout);
  const files = [F.form + '.position.f32', F.form + '.motion.i16', F.tin, F.tout];
  if (F.briChanged) {   // độ sáng: đầu/cuối hai đoạn chuyển cảnh cũng phải khớp
    const cin = read(F.tinC, Uint8Array), cout = read(F.toutC, Uint8Array);
    for (let i = 0; i < N; i++) { cin[i * 8 + 7] = F.bri[i]; cout[i * 8 + 3] = F.bri[last + i]; }
    write(F.form + '.brightness.u8', F.bri); write(F.tinC, cin); write(F.toutC, cout);
    files.push(F.form + '.brightness.u8', F.tinC, F.toutC);
  }
  for (const f of files) {
    const e = manifest.files.find((x) => x.path === f);
    e.sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex');
  }
}
if (changed.size) {
  const mPath = path.join(DIR, 'export_manifest.json'), old = crypto.createHash('sha256').update(fs.readFileSync(mPath)).digest('hex');
  fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(mPath)).digest('hex');
  const swap = (f, a, b) => { const p = path.join(ROOT, f), s = fs.readFileSync(p, 'utf8'); if (!s.includes(a)) throw Error(f + ': missing ' + a); fs.writeFileSync(p, s.split(a).join(b)); };
  swap('Frontend/drone-blender.js', old, hash);
  swap('Frontend/drone-show.js', 'b6-' + old.slice(0, 12), 'b6-' + hash.slice(0, 12));
  console.log('manifest', old.slice(0, 12), '->', hash.slice(0, 12), 'changed:', [...changed].join(', '));
} else console.log('nothing to change');

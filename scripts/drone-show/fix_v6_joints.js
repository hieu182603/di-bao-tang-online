// Sửa khớp nối trong bản xuất Blender v6 (không có tệp .blend gốc trong repo nên sửa thẳng trên dữ liệu):
//  - ho_chi_minh_lotus: cánh tay vẫy (nhóm 2) nằm trước thân ~4.7 m -> lùi về sát vai.
//  - ly_dragon: ba chân (nhóm 3) nằm trước bụng 3–13 m, chân giữa không chạm thân, chân trượt/rách khi thân uốn
//    -> mỗi chân dời về sát bụng và chuyển động liền khối theo phần thân tại khớp.
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
  return { form, S: hold.sample_count, Q: hold.position_quantum_m, tin: tin.geometry, tout: tout.geometry,
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
    const dz = median(cs.map(([i, j]) => R.pos[i * 3 + 2] - R.pos[j * 3 + 2]));
    if (Math.abs(dz - GAP) > 0.2) { shift(R, leg, [0, 0, -(dz - GAP)]); changed.add(R.form); }
    // chuyển động: cả chân đi theo trung bình chuyển động của các drone thân tại khớp
    const anchor = [...new Set(cs.map(([, j]) => j))], S = R.S;
    let slide = 0;
    // Khớp đi theo thân như một vật cứng: tịnh tiến + xoay trong mặt phẳng nhìn (thân rồng uốn lượn trong mặt này).
    const at = (i, s, c) => R.pos[i * 3 + c] + R.mot[(s * N + i) * 3 + c] * R.Q;
    const frame = (s) => {
      const c = [0, 1, 2].map((k) => anchor.reduce((a, j) => a + at(j, s, k), 0) / anchor.length);
      return c;
    };
    const c0 = frame(0), rest = leg.map((i) => [0, 1, 2].map((c) => at(i, 0, c)));
    for (let s = 0; s < S; s++) {
      const cs = frame(s);
      let dot = 0, crs = 0;
      for (const j of anchor) {
        const ax = at(j, 0, 0) - c0[0], ay = at(j, 0, 1) - c0[1], bx = at(j, s, 0) - cs[0], by = at(j, s, 1) - cs[1];
        dot += ax * bx + ay * by; crs += ax * by - ay * bx;
      }
      const th = anchor.length > 2 ? Math.atan2(crs, dot) : 0, co = Math.cos(th), si = Math.sin(th);
      leg.forEach((i, n) => {
        const x = rest[n][0] - c0[0], y = rest[n][1] - c0[1];
        const p = [cs[0] + co * x - si * y, cs[1] + si * x + co * y, rest[n][2] + cs[2] - c0[2]];
        for (let c = 0; c < 3; c++) {
          const o = (s * N + i) * 3 + c, v = Math.round((p[c] - R.pos[i * 3 + c]) / R.Q);
          slide = Math.max(slide, Math.abs(R.mot[o] - v)); R.mot[o] = v;
        }
      });
    }
    if (slide > 0) changed.add(R.form);
    console.log(`dragon leg x[${lo.toFixed(0)},${hi.toFixed(0)}] n=${leg.length}: contacts ${cs.length}, depth step was ${dz.toFixed(2)} m, anchors ${anchor.length}, max motion change ${(slide * R.Q).toFixed(2)} m`);
  }
}

// ---- ghi tệp + nối lại hai đoạn chuyển cảnh kề bên
for (const F of [H, R]) {
  if (!changed.has(F.form)) continue;
  const gin = read(F.tin, Float32Array), gout = read(F.tout, Float32Array), last = (F.S - 1) * N;
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
    gin[i * 10 + 3 + c] = F.pos[i * 3 + c] + F.mot[i * 3 + c] * F.Q;
    gout[i * 10 + c] = F.pos[i * 3 + c] + F.mot[(last + i) * 3 + c] * F.Q;
  }
  write(F.form + '.position.f32', F.pos); write(F.form + '.motion.i16', F.mot); write(F.tin, gin); write(F.tout, gout);
  for (const f of [F.form + '.position.f32', F.form + '.motion.i16', F.tin, F.tout]) {
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

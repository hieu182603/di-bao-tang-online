// Bảo tàng số Lịch sử Đảng – không gian 3D, người que, nhiều người cùng tham quan.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const DATA = window.MUSEUM;
const Net = window.Net;

/* ================= renderer, scene, camera (PBR + Shadows + ToneMapping) ================= */
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // bóng chỉ dựng lại mỗi vài khung hình (xem frame()) để lia chuột không bị đơ

const scene = new THREE.Scene();
const SKY = 0x7fa6cc;
const HORIZON = 0xcdd8e0; // chân trời nhạt, hơi xám như không khí nhiệt đới có hơi ẩm
scene.background = new THREE.Color(SKY);
// Sương mù xa (55m - 290m) tạo phối cảnh không khí: vật càng xa càng nhạt và ngả xám xanh
scene.fog = new THREE.Fog(HORIZON, 55, 290);

// Tạo bản đồ phản xạ môi trường PBR (IBL) ngay bằng PMREMGenerator để kim loại, vàng đồng, đá hoa cương bóng đẹp như thật
try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x9fbbd6);
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfffae8 }));
  envSun.position.set(30, 45, 35); envScene.add(envSun);
  const envWarm = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffdca8 }));
  envWarm.position.set(-20, 20, -20); envScene.add(envWarm);
  const envGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ color: 0x484232 }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -8; envScene.add(envGround);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
} catch (e) {}

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
camera.rotation.order = "YXZ";
const EYE = 1.65;
const player = { x: 0, z: 37, yaw: 0, pitch: 0.04, moving: false, phase: 0, jy: 0, vy: 0, base: 0, grounded: true };
window.player = player;
window.camera = camera;
// grounded = đang đứng trên mặt đất / bệ (không phải đang bay); nhảy được bất cứ khi nào grounded
function jump() { if (player.seat) { if (started && !infoOpen) standUp(); return; } if (started && !infoOpen && player.grounded) { player.grounded = false; player.vy = 5.6; } }
let thirdPerson = false;

/* ================= small helpers ================= */
const UI_FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const SERIF = '"Noto Serif", Georgia, serif';
const GOLD_TXT = "#e2c98a";
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function wrapLines(ctx, text, maxW) {
  const out = []; let line = "";
  for (const w of String(text).split(" ")) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line); return out;
}
// blocks: [{text, size, weight, font, color, gap, align}]  (size in px at the given ppm)
// records text that does not fit its board (shown in window.__textIssues for checking)
const TEXT_ISSUES = []; window.__textIssues = TEXT_ISSUES;
function textIssue(kind, text) { TEXT_ISSUES.push(kind + ": " + String(text).slice(0, 90)); }
function textCanvas(blocks, w, h, o = {}) {
  const ppm = o.ppm || 300;
  const cw = Math.round(ppm * w), ch = Math.round(ppm * h);
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const g = c.getContext("2d");
  g.fillStyle = o.bg || "#1c1511"; g.fillRect(0, 0, cw, ch);
  if (o.border !== false) { g.strokeStyle = o.borderColor || "rgba(201,162,74,0.85)"; g.lineWidth = Math.max(3, ppm / 90); g.strokeRect(ppm * 0.03, ppm * 0.03, cw - ppm * 0.06, ch - ppm * 0.06); }
  const pad = cw * (o.pad || 0.08);
  const top0 = o.top != null ? o.top * ch : 0;
  const room = ch - top0 - Math.max(ppm * 0.07, ch * 0.08); // keep clear of the border
  // lay the text out; if it does not fit, shrink every block a little and try again
  let k = 1, laid, total, wide;
  for (;;) {
    laid = []; total = 0; wide = false;
    for (const b of blocks) {
      const size = Math.round(b.size * k), gapB = (b.gap || 0) * k;
      g.font = `${b.weight || 500} ${size}px ${b.font || SERIF}`;
      const lines = wrapLines(g, b.text, cw - pad * 2);
      for (const l of lines) if (g.measureText(l).width > cw - pad * 2 + 1) wide = true;
      lines.forEach((l, i) => { laid.push({ b, size, l, gap: i === lines.length - 1 ? gapB : 0 }); total += size * 1.3; });
      total += gapB;
    }
    if ((total <= room && !wide) || k < 0.45) break;
    k *= 0.93;
  }
  if (total > room || wide) textIssue(wide ? "chữ dài quá khung" : "chữ tràn trên/dưới", blocks.map((b) => b.text).join(" | "));
  let y = o.top != null ? top0 : (ch - total) / 2;
  g.textBaseline = "top";
  for (const { b, size, l, gap } of laid) {
    g.font = `${b.weight || 500} ${size}px ${b.font || SERIF}`;
    g.fillStyle = b.color || "#f3ead8";
    const align = b.align || o.align || "center";
    g.textAlign = align;
    g.fillText(l, align === "left" ? pad : cw / 2, y + size * 0.1);
    y += size * 1.3 + gap;
  }
  return c;
}
function textPlane(blocks, w, h, o) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas(blocks, w, h, o)) }));
}
function placeAt(obj, x, y, z, ry) { obj.position.set(x, y, z); obj.rotation.y = ry || 0; scene.add(obj); return obj; }
// put an object flat on a wall: wall = {x, z, ry}; offset runs left->right as seen by the viewer facing the wall
function onWall(obj, wall, offset, y, out = 0.03) {
  const cx = Math.cos(wall.ry), sx = Math.sin(wall.ry);
  return placeAt(obj, wall.x + cx * offset + sx * out, y, wall.z - sx * offset + cx * out, wall.ry);
}
function prismGeo(w, h, d) { // triangle (base w, height h) in x-y, extruded along +z by d
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
}
let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ================= procedural textures (with rich grain & bump detail) ================= */
function grassCanvas() {
  // Cỏ nhiệt đới ngoài đời: xanh ô-liu ngả vàng, có mảng đậm/nhạt và lấm tấm cỏ úa, không xanh đều như nhựa
  const S = 512;
  const c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
  g.fillStyle = "#3d5424"; g.fillRect(0, 0, S, S);
  // mảng lớn đậm nhạt (vẽ lặp ở 4 góc để ô texture nối liền mạch)
  for (let i = 0; i < 26; i++) {
    const x = rand() * S, y = rand() * S, r = 40 + rand() * 110;
    const tone = rand() < 0.5 ? "rgba(28,44,14,0.28)" : "rgba(120,132,58,0.22)";
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      rg.addColorStop(0, tone); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const bladeTones = ["#4a6429", "#567232", "#3a5121", "#62803a", "#2f441a", "#6f8a42", "#50692c", "#43592a", "#7d8a48", "#8f8f55"];
  for (let i = 0; i < 22000; i++) {
    g.fillStyle = bladeTones[i % bladeTones.length];
    g.globalAlpha = 0.55 + (i % 4) * 0.12;
    g.fillRect(rand() * S, rand() * S, 1 + (i % 2) * 0.8, 2.6 + (i % 3) * 1.3);
  }
  g.globalAlpha = 1;
  return c;
}

function stoneCanvas(colorA, colorB) {
  // Đá phiến lát sân hoa văn so le (running-bond granite pavers) phong cách quảng trường di sản
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d");
  g.fillStyle = "#36312a"; g.fillRect(0, 0, 512, 512); // mạch vữa sâu
  const rows = 4, rowH = 128, blockW = 256;
  const tones = [colorA || "#9a9284", colorB || "#8b8376", "#948c7f", "#a29a8c", "#827a6e"];
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const shift = (r % 2) * (blockW / 2);
    for (let col = -1; col <= 3; col++) {
      const x = col * blockW + shift;
      const baseCol = tones[(r * 3 + col + 12) % tones.length];
      g.fillStyle = baseCol;
      g.fillRect(x + 2, y + 2, blockW - 4, rowH - 4);

      // Gờ vát mép nổi khối 3D (beveled edge highlight & shadow)
      g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 1.5;
      g.strokeRect(x + 3, y + 3, blockW - 6, rowH - 6);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x + blockW - 4, y + 2, 2, rowH - 4);
      g.fillRect(x + 2, y + rowH - 4, blockW - 4, 2);

      // Hạt khoáng thạch tự nhiên của đá granite (thạch anh & mica)
      for (let s = 0; s < 45; s++) {
        g.fillStyle = s % 2 ? "rgba(0,0,0,0.11)" : "rgba(255,255,255,0.13)";
        g.fillRect(x + 4 + rand() * (blockW - 8), y + 4 + rand() * (rowH - 8), 2, 2);
      }
    }
  }
  return c;
}

function plasterCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#cca03c"; g.fillRect(0, 0, 256, 256); // Sơn vôi vàng hoàng gia di sản Đông Dương
  const tones = ["#d8ad46", "#bf9230", "#c79634", "#dfb652", "#b38324"];
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  for (let i = 0; i < 200; i++) {
    g.fillStyle = "rgba(60,40,10,0.06)";
    g.fillRect(rand() * 256, rand() * 256, 3, 2);
  }
  return c;
}

function limestoneCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#eae2cf"; g.fillRect(0, 0, 256, 256); // Đá vôi / sa thạch kem ngà thanh lịch, ấm áp
  const tones = ["#ded5c1", "#f2ebd9", "#d8cdb6", "#ede5d4", "#cfc2a8"];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  for (let i = 0; i < 150; i++) {
    g.fillStyle = "rgba(80,70,55,0.06)";
    g.fillRect(rand() * 256, rand() * 256, 4, 1.5);
  }
  return c;
}

function graniteCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#4a4640"; g.fillRect(0, 0, 256, 256); // Đá hoa cương khối đen xám bóng mờ
  const specks = ["#262422", "#666158", "#827c70", "#383531", "#9e978a", "#1b1917"];
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = specks[i % specks.length];
    g.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  for (let i = 0; i < 80; i++) {
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(rand() * 256, rand() * 256, 1, 1);
  }
  return c;
}

function marbleCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d");
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const light = (i + j) % 2 === 1;
    g.fillStyle = light ? "#e7dec8" : "#7a2e22";
    g.fillRect(i * 256, j * 256, 256, 256);
    // Vân đá cẩm thạch tự nhiên
    g.strokeStyle = light ? "rgba(160,140,110,0.22)" : "rgba(235,205,165,0.16)";
    g.lineWidth = 1.6;
    for (let v = 0; v < 5; v++) {
      g.beginPath();
      let vx = i * 256 + rand() * 256, vy = j * 256;
      g.moveTo(vx, vy);
      for (let st = 1; st <= 4; st++) {
        vx += (rand() - 0.5) * 70;
        g.lineTo(Math.max(i * 256, Math.min((i + 1) * 256, vx)), j * 256 + st * 64);
      }
      g.stroke();
    }
  }
  g.strokeStyle = "rgba(185,148,72,0.65)"; g.lineWidth = 4;
  g.strokeRect(0, 0, 512, 512);
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  return c;
}
function plankCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d");
  const tones = ["#6a4429", "#734a2d", "#62402a", "#7a5132", "#5d3c24"];
  for (let r = 0; r < 8; r++) {
    let x = -((r * 97) % 256);
    while (x < 512) {
      const len = 180 + ((x * 7 + r * 31) % 140 + 140) % 140;
      g.fillStyle = tones[(r + Math.abs(x)) % tones.length]; g.fillRect(x, r * 64, len, 64);
      // Vân sớ gỗ dọc
      g.fillStyle = "rgba(30,15,5,0.12)";
      for (let gr = 0; gr < 6; gr++) g.fillRect(x, r * 64 + 8 + gr * 9, len, 1.5);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, r * 64, 2, 64);
      x += len;
    }
    g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(0, r * 64, 512, 2);
  }
  return c;
}
const BUA_LIEM_IMG = new Image();
BUA_LIEM_IMG.src = "images/bua_liem.png";

function flagCanvas() {
  const c = document.createElement("canvas"); c.width = 300; c.height = 200; const g = c.getContext("2d");
  g.fillStyle = "#da251d"; g.fillRect(0, 0, 300, 200);
  starPath(g, 150, 100, 60, 23); g.fillStyle = "#ffcd00"; g.fill();
  return c;
}
function partyFlagCanvas() {
  const c = document.createElement("canvas"); c.width = 300; c.height = 200; const g = c.getContext("2d");
  g.fillStyle = "#da251d"; g.fillRect(0, 0, 300, 200);
  g.save();
  g.translate(150, 100);
  // Biểu tượng Búa Liềm chuẩn Quy định 99-QĐ/TW (đường kính 4/10 chiều ngang lá cờ)
  const targetH = 80;
  const aspect = (BUA_LIEM_IMG.naturalWidth && BUA_LIEM_IMG.naturalHeight) ? (BUA_LIEM_IMG.naturalWidth / BUA_LIEM_IMG.naturalHeight) : (440 / 384);
  const targetW = targetH * aspect;
  if (BUA_LIEM_IMG.complete && BUA_LIEM_IMG.naturalWidth > 0) {
    g.drawImage(BUA_LIEM_IMG, -targetW / 2, -targetH / 2, targetW, targetH);
  }
  g.restore();
  return c;
}
function starPath(g, cx, cy, R, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath();
}

/* ================= PBR materials (MeshStandardMaterial) ================= */
const pbr = (color, rough = 0.72, metal = 0.04, map = null) => new THREE.MeshStandardMaterial({
  color, roughness: rough, metalness: metal, map: map || null,
});
const lam = (color, map) => pbr(color, 0.7, 0.05, map);

const plasterTex = canvasTex(plasterCanvas(), [6, 4]);
const limeTex = canvasTex(limestoneCanvas(), [4, 4]);
const graniteTex = canvasTex(graniteCanvas(), [2, 2]);
const woodTex = canvasTex(plankCanvas(), [2, 2]);

const M = {
  ochre: new THREE.MeshStandardMaterial({
    map: plasterTex, bumpMap: plasterTex, bumpScale: 0.016, roughness: 0.74, metalness: 0.02, color: 0xcaa03c,
  }),
  ochreDark: new THREE.MeshStandardMaterial({
    map: plasterTex, bumpMap: plasterTex, bumpScale: 0.022, roughness: 0.72, metalness: 0.03, color: 0xb48226,
  }),
  white: new THREE.MeshStandardMaterial({
    map: limeTex, bumpMap: limeTex, bumpScale: 0.012, roughness: 0.62, metalness: 0.02, color: 0xeadecb,
  }),
  roof: pbr(0x7a3b2a, 0.62, 0.05),
  cream: new THREE.MeshStandardMaterial({
    map: limeTex, bumpMap: limeTex, bumpScale: 0.01, roughness: 0.66, metalness: 0.02, color: 0xf0e7d5,
  }),
  wood: new THREE.MeshStandardMaterial({
    map: woodTex, bumpMap: woodTex, bumpScale: 0.02, roughness: 0.45, metalness: 0.06, color: 0x6e4125,
  }),
  glass: new THREE.MeshStandardMaterial({ color: 0x244258, roughness: 0.08, metalness: 0.88 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf5eedc, emissive: 0x423824, roughness: 0.82 }),
  dark: pbr(0x1e1b18, 0.52, 0.15),
  trunk: pbr(0x4a3525, 0.85, 0.02),
  leaf: pbr(0x2f4a24, 0.8, 0.0),
  leaf2: pbr(0x3e5c2e, 0.78, 0.0),
  olive: pbr(0x3a4a28, 0.42, 0.36),
  metal: pbr(0x323530, 0.32, 0.78),
  gold: new THREE.MeshStandardMaterial({ color: 0xd9b352, roughness: 0.22, metalness: 0.88 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff3d0 }),
  shutter: pbr(0x1d462c, 0.58, 0.04),
  shutterDark: pbr(0x143420, 0.62, 0.04),
  door: new THREE.MeshStandardMaterial({
    map: woodTex, bumpMap: woodTex, bumpScale: 0.025, roughness: 0.42, metalness: 0.08, color: 0x482412,
  }),
  doorDark: new THREE.MeshStandardMaterial({
    map: woodTex, bumpMap: woodTex, bumpScale: 0.025, roughness: 0.44, metalness: 0.08, color: 0x36190a,
  }),
  granite: new THREE.MeshStandardMaterial({
    map: graniteTex, bumpMap: graniteTex, bumpScale: 0.024, roughness: 0.52, metalness: 0.08, color: 0x6e685f,
  }),
  graniteDark: new THREE.MeshStandardMaterial({
    map: graniteTex, bumpMap: graniteTex, bumpScale: 0.03, roughness: 0.36, metalness: 0.12, color: 0x322f2b,
  }),
  flowerR: pbr(0xb81424, 0.52, 0.02),
  flowerY: pbr(0xf5b722, 0.52, 0.02),
  soil: pbr(0x2c1e14, 0.95, 0.0),
  hedge: pbr(0x2d4823, 0.8, 0.0),
};
function tileCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#6e2516"; g.fillRect(0, 0, 256, 256); // ngói đất nung Bát Tràng
  for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) {
    const x = k * 32 + (r % 2) * 16, y = r * 32;
    g.fillStyle = ["#9c3420", "#8e2f1c", "#ab3e26"][(r + k + 9) % 3];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 32, y); g.lineTo(x + 32, y + 22); g.quadraticCurveTo(x + 16, y + 34, x, y + 22); g.closePath(); g.fill();
    g.strokeStyle = "rgba(40,10,5,0.55)"; g.lineWidth = 2; g.stroke();
    g.strokeStyle = "rgba(255,200,180,0.18)"; g.lineWidth = 1;
    g.beginPath(); g.arc(x + 16, y + 18, 12, 0, Math.PI); g.stroke();
  }
  return c;
}
{
  const rt = canvasTex(tileCanvas(), [0.35, 0.35]);
  M.roof = new THREE.MeshStandardMaterial({ map: rt, bumpMap: rt, bumpScale: 0.035, roughness: 0.52, metalness: 0.04 });
}
const roomMats = DATA.rooms.map((r) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(r.color).multiplyScalar(0.84), roughness: 0.62, metalness: 0.03,
}));

/* ================= construction helpers ================= */
const solids = [];      // walls etc. (block the 3rd-person camera and picking)
const interactive = []; // meshes with userData.ex
function box(w, h, d, x, y, z, mat, solid) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  if (solid) solids.push(m);
  return m;
}
const T = 0.4;
// wall along x at constant z; matPos faces +z, matNeg faces -z; openings [{c, w, h, y0?}] (y0 = đáy ô cửa, mặc định 0 = tới sàn)
function wallX(z, xa, xb, h, matPos, matNeg, openings = []) {
  const mats = [matNeg, matNeg, M.dark, M.dark, matPos, matNeg];
  const seg = (a, b, y0, y1) => { if (b - a > 0.01 && y1 - y0 > 0.01) box(b - a, y1 - y0, T, (a + b) / 2, (y0 + y1) / 2, z, mats, true); };
  let cur = xa;
  for (const o of openings) { seg(cur, o.c - o.w / 2, 0, h); if (o.y0) seg(o.c - o.w / 2, o.c + o.w / 2, 0, o.y0); seg(o.c - o.w / 2, o.c + o.w / 2, o.h, h); cur = o.c + o.w / 2; }
  seg(cur, xb, 0, h);
}
// wall along z at constant x; matPos faces +x, matNeg faces -x
function wallZ(x, za, zb, h, matPos, matNeg, openings = []) {
  const mats = [matPos, matNeg, M.dark, M.dark, matNeg, matNeg];
  const seg = (a, b, y0, y1) => { if (b - a > 0.01 && y1 - y0 > 0.01) box(T, y1 - y0, b - a, x, (y0 + y1) / 2, (a + b) / 2, mats, true); };
  let cur = za;
  for (const o of openings) { seg(cur, o.c - o.w / 2, 0, h); if (o.y0) seg(o.c - o.w / 2, o.c + o.w / 2, 0, o.y0); seg(o.c - o.w / 2, o.c + o.w / 2, o.h, h); cur = o.c + o.w / 2; }
  seg(cur, zb, 0, h);
}
function slab(x0, x1, z0, z1, y, mat, up = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = up;
  scene.add(m);
  return m;
}
function texMat(canvasEl, rep, rough = 0.78, bump = 0.015) {
  const t = canvasTex(canvasEl, rep);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: bump, roughness: rough, metalness: 0.03 });
}

/* ================= collision ================= */
const RECTS = [
  { x0: -29, x1: 29, z0: 0.6, z1: 61 },          // sân (trong lũy tre)
  { x0: -1.6, x1: 1.6, z0: -0.8, z1: 0.8 },      // cửa chính
  { x0: -11.4, x1: 11.4, z0: -23.4, z1: -0.6 },  // sảnh
  { x0: -12.8, x1: -11.2, z0: -6.8, z1: -5.2 }, { x0: -12.8, x1: -11.2, z0: -18.8, z1: -17.2 },
  { x0: 11.2, x1: 12.8, z0: -6.8, z1: -5.2 }, { x0: 11.2, x1: 12.8, z0: -18.8, z1: -17.2 },
  { x0: -0.8, x1: 0.8, z0: -24.8, z1: -23.2 },
  { x0: -21.4, x1: -12.6, z0: -11.4, z1: -0.6 }, { x0: -21.4, x1: -12.6, z0: -23.4, z1: -12.6 },
  { x0: -4.4, x1: 4.4, z0: -33.4, z1: -24.6 },
  { x0: 12.6, x1: 21.4, z0: -23.4, z1: -12.6 }, { x0: 12.6, x1: 21.4, z0: -11.4, z1: -0.6 },
  // hai cổng bên (mở trong lũy tre, z 6.6..10.4) + khu vui chơi (x<0) và khu parkour (x>0) bên ngoài sân
  { x0: -31.2, x1: -27.8, z0: 6.75, z1: 10.25 }, { x0: 27.8, x1: 31.2, z0: 6.75, z1: 10.25 },
  { x0: -61.6, x1: -30.8, z0: 4.2, z1: 43.4 }, { x0: 30.8, x1: 61.6, z0: 4.2, z1: 47.6 },
];
const CIRCLES = [];
const BLOCKS = [];     // vật cản hình chữ nhật dưới đất {x0,x1,z0,z1}
const PLATFORMS = [];  // bệ đứng được ở tầng trệt {x0,x1,z0,z1,top}; top tính từ mặt đất. Bước lên được nếu top <= jy + 0.35
// second floor (mezzanine along the entrance wall + balcony between the portico columns) and the glass elevator
const UP = 5.0;
const ELEV = { x0: -7.4, x1: -5.6, z0: -5.6, z1: -3.6, y: 0, target: 0, cabin: null };
const RECTS_UP = [
  { x0: -11.4, x1: 11.4, z0: -3.15, z1: -0.6 },   // hành lang tầng 2
  { x0: -7.25, x1: -5.75, z0: -3.8, z1: -3.0 },   // cầu nối ra thang máy
  { x0: -1.0, x1: 1.0, z0: -0.8, z1: 0.8 },       // cửa ra ban công
  { x0: -7.9, x1: 7.9, z0: 0.6, z1: 3.75 },       // ban công
  // 4 phòng ảnh tư liệu trên các phòng bên (cách tường 0.4 như tầng trệt) + lối qua cửa hội trường (z≈-1.9) và cửa vách ngăn z=-12
  { x0: -21.4, x1: -12.6, z0: -11.4, z1: -0.6 }, { x0: -21.4, x1: -12.6, z0: -23.4, z1: -12.6 },
  { x0: 12.6, x1: 21.4, z0: -23.4, z1: -12.6 }, { x0: 12.6, x1: 21.4, z0: -11.4, z1: -0.6 },
  { x0: -12.8, x1: -11.2, z0: -2.7, z1: -1.1 }, { x0: 11.2, x1: 12.8, z0: -2.7, z1: -1.1 },
  { x0: -17.8, x1: -16.2, z0: -12.8, z1: -11.2 }, { x0: 16.2, x1: 17.8, z0: -12.8, z1: -11.2 },
];
const inElev = (x, z, m = 0) => x > ELEV.x0 + m && x < ELEV.x1 - m && z > ELEV.z0 + m && z < ELEV.z1 - m;
const levelOf = () => (player.base > UP / 2 ? 1 : 0);
// mặt đứng cao nhất của các bệ dưới chân (0 nếu không có); chỉ áp dụng ở tầng trệt
const groundAt = (x, z) => { if (player.base > UP / 2) return 0; let g = 0; for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > g) g = p.top; return g; };
function free(x, z) {
  const lvl = levelOf();
  if (inElev(player.x, player.z) && ELEV.y !== ELEV.target) return inElev(x, z, 0.2); // stay inside while it moves
  if (inElev(x, z, -0.05)) return Math.abs(ELEV.y - (lvl ? UP : 0)) < 0.05;
  if (lvl) { for (const r of RECTS_UP) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true; return false; }
  for (const c of CIRCLES) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return false;
  for (const b of BLOCKS) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return false;
  for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > player.jy + 0.35) return false; // bệ quá cao so với chân
  for (const r of RECTS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  return false;
}

/* ================= rooms geometry ================= */
const PI = Math.PI, H2 = PI / 2;
const ROOM_GEO = [
  { rect: [-21.8, -12.2, -11.8, -0.2], c: [-17, -6], face: H2, walls: [{ x: -17, z: -0.2, ry: PI }, { x: -21.8, z: -6, ry: H2 }, { x: -17, z: -11.8, ry: 0 }], sign: { x: -11.8, z: -6, ry: H2 } },
  { rect: [-21.8, -12.2, -23.8, -12.2], c: [-17, -18], face: H2, walls: [{ x: -17, z: -12.2, ry: PI }, { x: -21.8, z: -18, ry: H2 }, { x: -17, z: -23.8, ry: 0 }], sign: { x: -11.8, z: -18, ry: H2 } },
  { rect: [-4.8, 4.8, -33.8, -24.2], c: [0, -29], face: 0, walls: [{ x: -4.8, z: -29, ry: H2 }, { x: 0, z: -33.8, ry: 0 }, { x: 4.8, z: -29, ry: -H2 }], sign: { x: 0, z: -23.8, ry: 0 } },
  { rect: [12.2, 21.8, -23.8, -12.2], c: [17, -18], face: -H2, walls: [{ x: 17, z: -23.8, ry: 0 }, { x: 21.8, z: -18, ry: -H2 }, { x: 17, z: -12.2, ry: PI }], sign: { x: 11.8, z: -18, ry: -H2 } },
  { rect: [12.2, 21.8, -11.8, -0.2], c: [17, -6], face: -H2, walls: [{ x: 17, z: -11.8, ry: 0 }, { x: 21.8, z: -6, ry: -H2 }, { x: 17, z: -0.2, ry: PI }], sign: { x: 11.8, z: -6, ry: -H2 } },
];
// Phòng ảnh tư liệu tầng 2: nằm trên ROOM_GEO[0,1,3,4]. off = vị trí các khung ảnh dọc tường (trái -> phải khi nhìn vào tường).
// walls: [chỉ số tường trong ROOM_GEO[src].walls, các off]; door.wall = tường vách ngăn có cửa sang phòng bên cạnh;
// hall = mặt trong tường hội trường (door = vị trí cửa từ hành lang tầng 2 theo off, title = off của biển tên phòng)
const UP_CEIL = 8.9;
const S3 = [-3.1, 0, 3.1], S3L = [-3.6, 0, 3.6], S2 = [-3.1, 3.1];
const UPPER_GEO = [
  { src: 0, walls: [[0, S3], [1, S3L], [2, S2]], door: 2, hall: { x: -12.2, z: -6, ry: -H2, door: 4.1, title: -1.4 } },
  { src: 1, walls: [[0, S2], [1, S3L], [2, S3]], door: 0, hall: { x: -12.2, z: -18, ry: -H2, door: null, title: 0 } },
  { src: 3, walls: [[0, S3], [1, S3L], [2, S2]], door: 2, hall: { x: 12.2, z: -18, ry: H2, door: null, title: 0 } },
  { src: 4, walls: [[0, S2], [1, S3L], [2, S3]], door: 0, hall: { x: 12.2, z: -6, ry: H2, door: -4.1, title: 1.4 } },
];
UPPER_GEO.forEach((u) => { const g = ROOM_GEO[u.src]; u.rect = g.rect; u.c = g.c; u.walls = u.walls.map(([i, off]) => ({ ...g.walls[i], off })); });
const UPPER = () => DATA.upperRooms || [];
function zoneName(x, z, y = 0) {
  // khu ngoài trời (bên ngoài lũy tre) xét trước, rồi mới tới tầng 2
  if (z > 2.5 && x < -30.5) return "Khu vui chơi";
  if (z > 2.5 && x > 30.5) return "Khu parkour";
  if (y > UP / 2 && !inElev(x, z)) {
    for (let i = 0; i < UPPER_GEO.length; i++) { const [x0, x1, z0, z1] = UPPER_GEO[i].rect; const r = UPPER()[i]; if (r && x > x0 && x < x1 && z > z0 && z < z1) return `Phòng ${r.num} · ${r.name}`; }
    return z > 0.2 ? "Ban công tầng 2" : "Tầng 2 · Hành lang";
  }
  if (inElev(x, z)) return "Thang máy";
  if (z > 0.2) return "Sân bảo tàng";
  for (let i = 0; i < 5; i++) { const [x0, x1, z0, z1] = ROOM_GEO[i].rect; if (x > x0 && x < x1 && z > z0 && z < z1) { const r = DATA.rooms[i]; return `Phòng ${r.num} · ${r.period}`; } }
  return DATA.hall.name;
}

/* ================= outdoor ================= */
const flags = [];
const spinners = [];
function buildOutdoor() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), texMat(grassCanvas(), [44, 44]));
  ground.rotation.x = -PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  slab(-2.5, 2.5, 6, 58.2, 0.012, texMat(stoneCanvas("#b9ad97", "#a89c86"), [1.2, 13]));
  slab(-13, 13, 5.4, 13, 0.006, texMat(stoneCanvas("#c8bca4", "#b6aa92"), [6.5, 2]));
  // portico floor + steps
  box(19, 0.16, 5.4, 0, 0.08, 2.7, M.granite);

  // gate
  for (const s of [-1, 1]) { box(1, 3.8, 1, s * 4.4, 1.9, 30, M.ochreDark); box(1.2, 0.3, 1.2, s * 4.4, 3.95, 30, M.gold); CIRCLES.push([s * 4.4, 30, 0.9]); }
  box(9.8, 0.9, 0.8, 0, 4.4, 30, M.ochreDark);
  const gs = textPlane([{ text: "BẢO TÀNG LỊCH SỬ ĐẢNG", size: 64, weight: 700, color: GOLD_TXT }], 8.4, 0.62, { bg: "#681313", borderColor: "#cfa84a", ppm: 160 });
  placeAt(gs, 0, 4.4, 30.41, 0);
  const gs2 = gs.clone(); placeAt(gs2, 0, 4.4, 29.59, PI);

  // flags: Bên trái (s = -1) là Cờ Đảng, Bên phải (s = 1) là Cờ Tổ quốc
  const vnFlagTex = canvasTex(flagCanvas());
  const partyFallbackTex = canvasTex(partyFlagCanvas());
  for (const s of [-1, 1]) {
    const x = s * 6.5, z = 15;
    box(0.12, 11, 0.12, x, 5.5, z, M.white); box(0.5, 0.3, 0.5, x, 0.15, z, M.white);
    const geo = new THREE.PlaneGeometry(3, 2, 18, 8);
    const initialTex = (s === -1) ? partyFallbackTex : vnFlagTex;
    const fMat = new THREE.MeshLambertMaterial({ map: initialTex, side: THREE.DoubleSide });
    const fm = new THREE.Mesh(geo, fMat);
    fm.position.set(x + 1.56, 9.8, z); scene.add(fm);
    if (s === -1) {
      loadImg("images/sanh/co_dang.png").then((im) => {
        if (!im) return;
        const t = new THREE.Texture(im);
        t.encoding = THREE.sRGBEncoding;
        t.needsUpdate = true;
        fMat.map = t;
        fMat.needsUpdate = true;
      });
    }
    flags.push({ geo, base: Float32Array.from(geo.attributes.position.array), ph: s });
    CIRCLES.push([x, z, 0.5]);
  }
  // lamps along the path
  for (let z = 18; z <= 54; z += 9) for (const s of [-1, 1]) {
    const x = s * 3.4; box(0.12, 3.4, 0.12, x, 1.7, z, M.dark);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), M.lamp); bulb.position.set(x, 3.5, z); scene.add(bulb);
    CIRCLES.push([x, z, 0.35]);
  }
  buildLandscape();
}

/* ---- geometry merge helper & procedural botanical generators ---- */
function mergeGeos(geos) {
  const pos = [], norm = [], uv = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) norm.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) uv.push(u.getX(i), u.getY(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (norm.length) out.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  else out.computeVertexNormals();
  if (uv.length) out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function bambooCulmCanvas() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "#2c4f1c"); grad.addColorStop(0.35, "#3e6d28"); grad.addColorStop(0.75, "#4c8332"); grad.addColorStop(1, "#284719");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  for (let x = 0; x < 64; x += 3) {
    g.fillStyle = x % 6 === 0 ? "rgba(20,40,10,0.18)" : "rgba(180,240,130,0.12)";
    g.fillRect(x, 0, 1, 512);
  }
  for (let y = 56; y < 512; y += 64) {
    g.fillStyle = "#1b3310"; g.fillRect(0, y - 4, 64, 6);
    g.fillStyle = "#8aa948"; g.fillRect(0, y + 2, 64, 2);
  }
  return c;
}

function makeBambooCulmGeo() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.032, 0.068, 1, 8, 6);
  stem.translate(0, 0.5, 0);
  parts.push(stem);
  for (const ny of [0.16, 0.32, 0.48, 0.64, 0.80, 0.92]) {
    const r = 0.068 - ny * 0.034;
    const node = new THREE.TorusGeometry(r * 1.05, 0.008, 5, 8);
    node.rotateX(H2); node.scale(1, 0.08, 1); node.translate(0, ny, 0);
    parts.push(node);
    if (ny >= 0.48) {
      const side = (Math.round(ny * 100) % 2 ? 1 : -1);
      const twig = new THREE.CylinderGeometry(0.004, 0.009, 0.14, 5);
      twig.translate(0, 0.07, 0); twig.rotateZ(side * 0.65); twig.rotateY(ny * 9);
      twig.translate(0, ny, 0);
      parts.push(twig);
    }
  }
  return mergeGeos(parts);
}

function makeBambooSprayGeo() {
  const parts = [];
  // 11 slender pointed arching bamboo leaf blades radiating from a branchlet
  const angles = [
    [0, 0.35, 0], [0.55, 0.48, 0.25], [-0.55, 0.48, -0.25],
    [1.05, 0.62, 0.4], [-1.05, 0.62, -0.4], [1.55, 0.72, 0.3], [-1.55, 0.72, -0.3],
    [2.15, 0.65, 0.2], [-2.15, 0.65, -0.2], [2.75, 0.52, 0.15], [-2.75, 0.52, -0.15],
  ];
  for (let i = 0; i < angles.length; i++) {
    const [ay, droop, roll] = angles[i];
    const len = 0.55 + (i % 3) * 0.14;
    const w = 0.065 + (i % 2) * 0.015;
    // Two joined cones back-to-back form a sharp diamond/lance bamboo leaf blade
    const baseBlade = new THREE.ConeGeometry(w, len * 0.72, 4);
    baseBlade.scale(1, 1, 0.14);
    baseBlade.translate(0, len * 0.36 + 0.12, 0);
    const petiole = new THREE.ConeGeometry(w, len * 0.28, 4);
    petiole.scale(1, 1, 0.14);
    petiole.rotateX(PI);
    petiole.translate(0, 0.12, 0);
    const blade = mergeGeos([baseBlade, petiole]);
    blade.rotateX(droop);
    blade.rotateZ(roll);
    blade.rotateY(ay);
    blade.translate(0, (i % 3) * 0.05, 0);
    parts.push(blade);
  }
  return mergeGeos(parts);
}

function barkCanvas() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#4d3828"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = i % 2 ? "rgba(35,22,14,0.45)" : "rgba(95,72,52,0.35)";
    g.fillRect(rand() * 128, rand() * 256, 2 + rand() * 4, 18 + rand() * 40);
  }
  return c;
}

function makeOrganicFoliageGeo() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    // Deterministic bumpy leaf-cluster silhouette
    const n = 0.86 + 0.18 * Math.sin(vx * 5.1 + vy * 3.7) * Math.cos(vz * 4.9 - vx * 2.3);
    p.setXYZ(i, vx * n, vy * (vy > 0 ? n * 0.88 : n * 0.68), vz * n);
  }
  g.computeVertexNormals();
  return g;
}

/* ---- walkways, golden bamboo, ornamental shade trees, fish pond ---- */
const fishes = [];
let pondWater = null;
function buildLandscape() {
  const walk = texMat(stoneCanvas("#c3b79f", "#b2a68e"), [1, 1]);
  const stripe = (x0, x1, z0, z1) => { const m = slab(x0, x1, z0, z1, 0.011, walk.clone()); m.material.map = m.material.map.clone(); m.material.map.repeat.set((x1 - x0) / 2.4, (z1 - z0) / 2.4); m.material.map.needsUpdate = true; };
  stripe(-14.2, -11.8, 12.4, 58.2); stripe(11.8, 14.2, 12.4, 58.2);   // side walkways
  stripe(-14.2, -2.5, 12.4, 14.8); stripe(2.5, 14.2, 12.4, 14.8);     // from the plaza to the walkways
  stripe(-14.2, 14.2, 55.8, 58.2);                                    // far cross path
  // spurs from the walkways to every exhibit
  for (const z of EXHIBIT_Z) { stripe(-17.2, -14.2, z - 0.9, z + 0.9); stripe(14.2, 17.2, z - 0.9, z + 0.9); }

  // golden bamboo (tre ngà): realistic segmented culms with nodes + pointed leaf sprays attached to actual culm nodes
  const spots = [];
  const line = (x0, z0, x1, z1, step) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / step); for (let i = 0; i <= n; i++) spots.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  line(-30, 3, -30, 61, 2.2); line(30, 3, 30, 61, 2.2); line(-30, 62, 30, 62, 2.2);
  line(-30, 3, -23, 3, 2.2); line(23, 3, 30, 3, 2.2);
  for (let i = spots.length - 1; i >= 0; i--) if (Math.abs(spots[i][0]) > 29.9 && Math.abs(spots[i][1] - GATE_Z) < 2.3) spots.splice(i, 1); // mở hai cổng bên (xem buildGates)

  const bTex = canvasTex(bambooCulmCanvas());
  const culmGeo = makeBambooCulmGeo();
  const culmMat = new THREE.MeshStandardMaterial({ map: bTex, bumpMap: bTex, bumpScale: 0.01, roughness: 0.42, metalness: 0.05 });
  const leafGeo = makeBambooSprayGeo();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide });
  const BAMBOO_GREENS = [0x2f4a22, 0x3b5a2a, 0x4a6b34, 0x5a7b3c, 0x6b7f3e];

  const culmsPerClump = 8, spraysPerCulm = 3;
  const nC = spots.length * culmsPerClump, nL = nC * spraysPerCulm;
  const culms = new THREE.InstancedMesh(culmGeo, culmMat, nC);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, nL);
  culms.castShadow = true; culms.receiveShadow = true;
  leaves.castShadow = true; leaves.receiveShadow = true;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), upVec = new THREE.Vector3(), col = new THREE.Color();
  let ci = 0, li = 0;
  for (const [cx, cz] of spots) {
    for (let k = 0; k < culmsPerClump; k++) {
      const h = 6.2 + rand() * 3.8, lean = 0.04 + rand() * 0.11, dir = (k / culmsPerClump) * PI * 2 + (rand() - 0.5) * 0.5;
      const bx = cx + Math.cos(dir) * (0.18 + rand() * 0.42);
      const bz = cz + Math.sin(dir) * (0.18 + rand() * 0.42);
      p.set(bx, 0, bz);
      e.set(Math.sin(dir) * lean, rand() * PI * 2, -Math.cos(dir) * lean);
      q.setFromEuler(e);
      const thick = 0.85 + rand() * 0.35;
      s.set(thick, h, thick);
      culms.setMatrixAt(ci++, m4.compose(p, q, s));

      // Attach pointed bamboo leaf sprays directly onto the upper nodes of this exact culm!
      upVec.set(0, 1, 0).applyQuaternion(q);
      for (const frac of [0.62, 0.81, 0.98]) {
        const lx = bx + upVec.x * (h * frac);
        const ly = upVec.y * (h * frac);
        const lz = bz + upVec.z * (h * frac);
        p.set(lx, ly, lz);
        e.set((rand() - 0.5) * 0.35, rand() * PI * 2, (rand() - 0.5) * 0.35);
        const lq = new THREE.Quaternion().setFromEuler(e);
        const ls = (frac > 0.9 ? 1.15 : 0.95) + rand() * 0.35;
        s.set(ls, ls * (0.85 + rand() * 0.3), ls);
        leaves.setMatrixAt(li, m4.compose(p, lq, s));
        col.setHex(BAMBOO_GREENS[Math.floor(rand() * BAMBOO_GREENS.length)]);
        leaves.setColorAt(li, col);
        li++;
      }
    }
    CIRCLES.push([cx, cz, 1.0]);
  }
  culms.count = ci; leaves.count = li;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  scene.add(culms, leaves);

  // Ornamental shade trees (Cây cổ thụ & cây xanh bóng mát sân bảo tàng)
  buildCourtyardTrees();

  // fish pond between the main path and the left walkway
  const px = -6.8, pz = 41.5, rx = 3.6, rz = 6;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 10, 48), M.granite); rim.rotation.x = -H2; rim.scale.set(rx + 0.16, rz + 0.16, 3.2); rim.position.set(px, 0.14, pz); rim.castShadow = true; rim.receiveShadow = true; scene.add(rim);
  // Decorative natural rocks around the pond edge
  const rockGeo = makeOrganicFoliageGeo();
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * PI * 2 + (rand() - 0.5) * 0.25;
    const rk = new THREE.Mesh(rockGeo, i % 2 ? M.granite : M.graniteDark);
    rk.position.set(px + Math.cos(ang) * (rx + 0.12), 0.15, pz + Math.sin(ang) * (rz + 0.12));
    rk.scale.set(0.28 + rand() * 0.22, 0.18 + rand() * 0.15, 0.25 + rand() * 0.2);
    rk.rotation.y = rand() * PI; rk.castShadow = true; rk.receiveShadow = true;
    scene.add(rk);
  }
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lam(0x1f3b32)); bed.rotation.x = -H2; bed.scale.set(rx, rz, 1); bed.position.set(px, -0.25, pz); scene.add(bed);
  const wc = document.createElement("canvas"); wc.width = wc.height = 128;
  { const g = wc.getContext("2d"); g.fillStyle = "#2b6e7d"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "rgba(220,248,255,0.38)"; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { g.beginPath(); g.ellipse(rand() * 128, rand() * 128, 6 + rand() * 14, 3 + rand() * 5, 0, 0, PI * 2); g.stroke(); } }
  const wtex = canvasTex(wc, [3, 5]);
  pondWater = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshPhysicalMaterial({
    map: wtex, transparent: true, opacity: 0.58, roughness: 0.12, metalness: 0.1, clearcoat: 0.9,
  }));
  pondWater.rotation.x = -H2; pondWater.scale.set(rx, rz, 1); pondWater.position.set(px, 0.06, pz); scene.add(pondWater);

  // Sculpted multi-petal lotus flowers (Hoa sen hồng & đài sen vàng) + lily pads
  const padGeo = new THREE.CircleGeometry(0.38, 18, 0.22, PI * 2 - 0.22);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x356e2b, roughness: 0.65, side: THREE.DoubleSide });
  const lotusParts = [];
  for (let ring = 0; ring < 2; ring++) {
    const count = ring === 0 ? 6 : 8, rad = ring === 0 ? 0.055 : 0.095, tilt = ring === 0 ? 0.42 : 0.82;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * PI * 2 + ring * 0.4;
      const pet = new THREE.ConeGeometry(0.048, 0.18, 5);
      pet.scale(1, 1, 0.35); pet.translate(0, 0.09, 0); pet.rotateX(tilt); pet.rotateY(a);
      pet.translate(Math.sin(a) * rad * 0.3, 0, Math.cos(a) * rad * 0.3);
      lotusParts.push(pet);
    }
  }
  const lotusGeo = mergeGeos(lotusParts);
  const lotusMat = new THREE.MeshStandardMaterial({ color: 0xf48fb1, roughness: 0.45, emissive: 0x240812 });
  const podMat = new THREE.MeshStandardMaterial({ color: 0xf5c842, roughness: 0.5 });

  for (let i = 0; i < 14; i++) {
    const a = rand() * PI * 2, r = 0.28 + rand() * 0.58;
    const x = px + Math.cos(a) * rx * r, z = pz + Math.sin(a) * rz * r;
    const m = new THREE.Mesh(padGeo, padMat);
    const scPad = 0.75 + rand() * 0.5;
    m.scale.set(scPad, scPad, 1); m.rotation.x = -H2; m.rotation.z = rand() * 6; m.position.set(x, 0.075, z); scene.add(m);
    if (i % 2 === 0) {
      const flw = new THREE.Group();
      const petMesh = new THREE.Mesh(lotusGeo, lotusMat);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 0.07, 10), podMat);
      pod.position.y = 0.06;
      flw.add(petMesh, pod);
      flw.position.set(x + (rand() - 0.5) * 0.12, 0.09, z + (rand() - 0.5) * 0.12);
      flw.rotation.y = rand() * PI * 2;
      scene.add(flw);
    }
  }
  // koi fish with dorsal & pectoral fins
  const koiMats = [
    new THREE.MeshStandardMaterial({ color: 0xf26419, roughness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0xfaf6f0, roughness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0xf6ae2d, roughness: 0.25 }),
  ];
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Group();
    const mat = koiMats[i % 4], mat2 = koiMats[(i + 1) % 4];
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), mat); body.scale.set(0.75, 0.55, 2.7); f.add(body);
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), mat2); spot.scale.set(0.8, 0.5, 1.4); spot.position.set(0, 0.025, 0.04); f.add(spot);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), mat2); tail.scale.set(0.35, 1, 1); tail.rotation.x = -H2; tail.position.z = -0.32; f.add(tail);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 3), mat2);
      fin.rotation.z = s * 1.2; fin.rotation.x = -0.4; fin.position.set(s * 0.08, -0.01, 0.05); f.add(fin);
    }
    f.position.y = -0.01; scene.add(f);
    fishes.push({ f, tail, cx: px, cz: pz, ax: rx * (0.32 + rand() * 0.48), az: rz * (0.32 + rand() * 0.48), sp: (0.25 + rand() * 0.35) * (rand() > 0.5 ? 1 : -1), ph: rand() * 6 });
  }
  for (let a = 0; a < 16; a++) { const t = a / 16 * PI * 2; CIRCLES.push([px + Math.cos(t) * (rx - 0.6), pz + Math.sin(t) * (rz - 0.6), 1.2]); }
  CIRCLES.push([px, pz, Math.min(rx, rz)]);
  const sign = textPlane([{ text: "HỒ CÁ", size: 46, weight: 700, color: GOLD_TXT, gap: 4 }, { text: "Ao sen, cá chép", size: 30, font: UI_FONT }], 1.4, 0.55, { ppm: 260 });
  const sg = new THREE.Group(); box(0.06, 0.9, 0.06, px + rx + 0.5, 0.45, pz - 2, M.dark); sg.add(sign); sign.position.y = 1.05; placeAt(sg, px + rx + 0.5, 0, pz - 2, H2);
}

function buildCourtyardTrees() {
  const bTex = canvasTex(barkCanvas());
  const barkMat = new THREE.MeshStandardMaterial({ map: bTex, bumpMap: bTex, bumpScale: 0.025, roughness: 0.88, metalness: 0.02 });
  const foliageGeo = makeOrganicFoliageGeo();
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2a4320, roughness: 0.82, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x35532a, roughness: 0.8, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x436433, roughness: 0.78, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x557540, roughness: 0.76, metalness: 0.0 }),
  ];
  // Positions in courtyard grass clear of walkways and vehicle pads
  const treeSpots = [
    [-19.5, 6.2, 1.15], [19.5, 6.2, 1.15],
    [-26.2, 11.0, 1.25], [26.2, 11.0, 1.25],
    [-26.8, 27.0, 1.2], [26.8, 27.0, 1.2],
    [-26.8, 43.0, 1.25], [26.8, 43.0, 1.25],
    [-8.2, 29.5, 0.95], [8.2, 29.5, 0.95],
    [-7.5, 51.5, 1.05], [7.5, 51.5, 1.05],
  ];
  const crownOffsets = [
    [0, 3.8, 0, 1.55, 1.15, 1.55, 2],
    [-0.95, 3.35, 0.55, 1.25, 0.95, 1.25, 1],
    [0.95, 3.4, -0.5, 1.25, 0.95, 1.25, 1],
    [0.5, 3.3, 0.95, 1.18, 0.9, 1.18, 0],
    [-0.55, 3.25, -0.95, 1.2, 0.9, 1.2, 0],
    [-0.45, 4.35, -0.35, 1.15, 0.92, 1.15, 3],
    [0.55, 4.4, 0.4, 1.1, 0.88, 1.1, 3],
    [0, 4.75, 0, 0.95, 0.78, 0.95, 3],
  ];
  const treeGroups = [];
  for (const [tx, tz, sc] of treeSpots) {
    const g = new THREE.Group();
    g.position.set(tx, 0, tz);
    g.scale.setScalar(sc);
    treeGroups.push(g);
    // Stone planter ring at base
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.24, 16), M.granite);
    ring.position.y = 0.12; ring.castShadow = true; ring.receiveShadow = true;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.26, 14), M.soil);
    soil.position.y = 0.13;
    g.add(ring, soil);
    // Tapered trunk + root flare + 4 main branches
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 2.9, 10), barkMat);
    trunk.position.y = 1.45; trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);
    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * PI * 2 + 0.4;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 1.65, 7), barkMat);
      br.position.set(Math.cos(ba) * 0.42, 2.55, Math.sin(ba) * 0.42);
      br.rotation.z = -Math.cos(ba) * 0.62;
      br.rotation.x = Math.sin(ba) * 0.62;
      br.castShadow = true;
      g.add(br);
    }
    // Billowy organic foliage puffs
    for (const [ox, oy, oz, sx, sy, sz, mi] of crownOffsets) {
      const puff = new THREE.Mesh(foliageGeo, leafMats[mi]);
      puff.position.set(ox, oy, oz);
      puff.scale.set(sx, sy, sz);
      puff.rotation.y = rand() * PI * 2;
      puff.castShadow = true; puff.receiveShadow = true;
      g.add(puff);
    }
    scene.add(g);
    CIRCLES.push([tx, tz, 1.15 * sc]);
  }
  // Có mô hình cây thật thì thay thân + tán dựng bằng khối (giữ bồn đá dưới gốc).
  const cfg = (window.REAL_MODELS || {}).tree;
  if (!cfg) return;
  loadGlbOnce(cfg.url).then((src) => {
    const proto = fitModel(src.clone(true), cfg.size, { fit: "height", yOffset: 0.18 });
    centerOnBase(proto);
    treeGroups.forEach((g, i) => {
      for (const ch of [...g.children]) if (ch.material === barkMat || leafMats.includes(ch.material)) g.remove(ch);
      const t = proto.clone(true);
      t.rotation.y = (i * 2.399) % (PI * 2); // xoay mỗi cây một góc khác nhau cho đỡ giống nhau
      t.scale.setScalar(0.9 + ((i * 37) % 10) / 40);
      g.add(t);
    });
  }).catch((e) => console.info("Giữ cây dựng bằng code:", e && e.message));
}
function animatePond(t, dt) {
  if (pondWater) pondWater.material.map.offset.set(t * 0.01, t * 0.006);
  for (const k of fishes) {
    const a = k.ph + t * k.sp, x = k.cx + Math.cos(a) * k.ax, z = k.cz + Math.sin(a) * k.az;
    const dx = -Math.sin(a) * k.ax * k.sp, dz = Math.cos(a) * k.az * k.sp;
    k.f.position.x = x; k.f.position.z = z; k.f.rotation.y = Math.atan2(dx, dz);
    k.tail.rotation.y = Math.sin(t * 9 + k.ph) * 0.5;
  }
}

/* ================= building ================= */
function buildBuilding() {
  const H = 9, HA = 6, r = roomMats;
  const door = (c, w, h) => ({ c, w, h });
  const upDoor = (c) => ({ c, w: 2.4, h: UP + 3.0, y0: UP }); // cửa lên các phòng tầng 2 (sàn y=5, cao 3 m)
  // facade
  wallX(0, -22.2, -12, H, M.ochre, r[0]);
  wallX(0, -12, -1.8, H, M.ochre, M.cream); wallX(0, 1.8, 12, H, M.ochre, M.cream);
  { const fm = [M.cream, M.cream, M.dark, M.dark, M.ochre, M.cream];
    const piece = (a, b, y0, y1) => box(b - a, y1 - y0, T, (a + b) / 2, (y0 + y1) / 2, 0, fm, true);
    piece(-1.8, 1.8, 4.6, 5.0); piece(-1.8, -1.2, 5.0, 7.4); piece(1.2, 1.8, 5.0, 7.4); piece(-1.8, 1.8, 7.4, H); }
  wallX(0, 12, 22.2, H, M.ochre, r[4]);
  // sides
  wallZ(-22, -12, 0, H, r[0], M.ochre); wallZ(-22, -24.2, -12, H, r[1], M.ochre);
  wallZ(22, -12, 0, H, M.ochre, r[4]); wallZ(22, -24.2, -12, H, M.ochre, r[3]);
  // back
  wallX(-24, -22.2, -12, H, r[1], M.ochre);
  wallX(-24, -12, -5, H, M.cream, M.ochre);
  wallX(-24, -5, 5, H, M.cream, r[2], [door(0, 2.4, 3.4)]);
  wallX(-24, 5, 12, H, M.cream, M.ochre);
  wallX(-24, 12, 22.2, H, r[3], M.ochre);
  // annex (room III)
  wallZ(-5, -34.2, -24, HA, r[2], M.ochre); wallZ(5, -34.2, -24, HA, M.ochre, r[2]); wallX(-34, -5.2, 5.2, HA, r[2], M.ochre);
  // hall side walls with room doors + partitions
  wallZ(-12, -12, 0, H, M.cream, r[0], [door(-6, 2.4, 3.4), upDoor(-1.9)]);
  wallZ(-12, -24, -12, H, M.cream, r[1], [door(-18, 2.4, 3.4)]);
  wallZ(12, -12, 0, H, r[4], M.cream, [door(-6, 2.4, 3.4), upDoor(-1.9)]);
  wallZ(12, -24, -12, H, r[3], M.cream, [door(-18, 2.4, 3.4)]);
  wallX(-12, -22, -12, H, r[0], r[1], [upDoor(-17)]);
  wallX(-12, 12, 22, H, r[4], r[3], [upDoor(17)]);

  // roofs
  box(45.2, 0.4, 25.2, 0, H + 0.2, -12, M.white);
  const roof = new THREE.Mesh(prismGeo(25.2, 4.2, 45.2), M.roof); roof.rotation.y = H2; roof.position.set(-22.6, H + 0.4, -12); scene.add(roof);
  box(10.8, 0.4, 10.2, 0, HA + 0.2, -29.3, M.white);
  const roof2 = new THREE.Mesh(prismGeo(10.8, 2.6, 10.2), M.roof); roof2.position.set(0, HA + 0.4, -34.4); scene.add(roof2);

  // facade trim: plinth + cornice + pilasters
  box(44.6, 0.7, 0.3, 0, 0.35, 0.3, M.ochreDark);
  box(44.8, 0.5, 0.6, 0, H - 0.25, 0.3, M.white);
  box(44.6, 0.25, 0.3, 0, 4.9, 0.3, M.white);
  for (const x of [-21.8, -12, 12, 21.8]) box(0.7, H - 0.5, 0.3, x, (H - 0.5) / 2, 0.3, M.white);
  // windows: arched, with shutters, sills and keystones; small balconies upstairs
  const half = new THREE.CircleGeometry(0.65, 20, 0, PI);
  const halfFrame = new THREE.CircleGeometry(0.8, 20, 0, PI);
  for (const x of [-19.5, -16.5, -13.8, -10.6, 10.6, 13.8, 16.5, 19.5]) {
    for (const [y, h, upper] of [[2.3, 2.2, false], [6.4, 1.9, true]]) {
      box(1.6, h + 0.2, 0.12, x, y, 0.26, M.white);
      box(1.3, h, 0.06, x, y, 0.33, M.glass);
      const af = new THREE.Mesh(halfFrame, M.white); af.position.set(x, y + h / 2 + 0.1, 0.27); scene.add(af);
      const ag = new THREE.Mesh(half, M.glass); ag.position.set(x, y + h / 2 + 0.1, 0.34); scene.add(ag);
      box(0.07, h + 0.6, 0.06, x, y + 0.3, 0.37, M.white); box(1.3, 0.07, 0.06, x, y + 0.25, 0.37, M.white);
      for (const s of [-1, 1]) {
        const sh = box(0.62, h + 0.1, 0.08, x + s * 1.15, y, 0.32, M.shutter);
        for (let k = -3; k <= 3; k++) box(0.5, 0.03, 0.04, x + s * 1.15, y + k * h / 8, 0.38, M.shutterDark);
        sh.rotation.y = s * 0.12;
      }
      box(1.9, 0.12, 0.35, x, y - h / 2 - 0.16, 0.4, M.white);
      box(0.28, 0.32, 0.12, x, y + h / 2 + 0.88, 0.32, M.ochreDark);
      if (upper) {
        box(2.1, 0.12, 0.8, x, y - h / 2 - 0.3, 0.7, M.white);
        box(2.1, 0.08, 0.08, x, y - h / 2 + 0.55, 1.06, M.white);
        for (let k = -6; k <= 6; k++) box(0.05, 0.75, 0.05, x + k * 0.16, y - h / 2 + 0.15, 1.06, M.white);
      }
    }
  }
  // dentils under the cornice
  const dent = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.22, 0.2), M.white, 140);
  const dm = new THREE.Matrix4(); let di = 0;
  for (let x = -22; x <= 22 && di < 140; x += 0.32) { dm.makeTranslation(x, H - 0.62, 0.55); dent.setMatrixAt(di++, dm); }
  dent.count = di; scene.add(dent);
  // wooden doors folded open + lanterns
  for (const s of [-1, 1]) {
    box(1.4, 4.3, 0.1, s * 2.9, 2.2, 0.32, M.door);
    for (const y of [1.2, 3.1]) box(1.1, 1.3, 0.04, s * 2.9, y, 0.39, M.doorDark);
    box(0.32, 0.5, 0.32, s * 2.55, 3.4, 0.6, M.gold);
    const lg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), M.lamp); lg.position.set(s * 2.55, 3.4, 0.6); scene.add(lg);
  }
  // portico balustrade (gap in the middle for the steps)
  for (const [a, b] of [[-9.6, -3.6], [3.6, 9.6]]) {
    box(b - a, 0.12, 0.3, (a + b) / 2, 1.05, 5.25, M.white); box(b - a, 0.12, 0.3, (a + b) / 2, 0.22, 5.25, M.white);
    for (let x = a + 0.15; x < b; x += 0.3) { const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 8), M.white); bl.position.set(x, 0.62, 5.25); scene.add(bl); }
    for (let x = a; x <= b + 0.01; x += 0.5) CIRCLES.push([x, 5.25, 0.35]);
  }
  // steps
  box(7.4, 0.12, 0.6, 0, 0.06, 5.7, M.granite); box(8.2, 0.08, 0.6, 0, 0.04, 6.3, M.granite);
  // portico
  for (const x of [-8.6, -5.8, -3, 3, 5.8, 8.6]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 7, 16), M.white); col.position.set(x, 3.66, 4.6); scene.add(col);
    box(1, 0.3, 1, x, 7.2, 4.6, M.white); box(1, 0.3, 1, x, 0.31, 4.6, M.white);
    CIRCLES.push([x, 4.6, 0.6]);
  }
  box(19.4, 0.9, 5.4, 0, 7.8, 2.7, M.white);
  const ped = new THREE.Mesh(prismGeo(19.6, 2.6, 5.4), M.white); ped.position.set(0, 8.25, 0); scene.add(ped);
  const sign = textPlane([{ text: "BẢO TÀNG LỊCH SỬ ĐẢNG CỘNG SẢN VIỆT NAM", size: 62, weight: 700, color: GOLD_TXT }], 17, 0.72, { bg: "#681313", borderColor: "#cfa84a", ppm: 110 });
  placeAt(sign, 0, 7.8, 5.42, 0);
  const emblemC = document.createElement("canvas"); emblemC.width = emblemC.height = 256;
  { const g = emblemC.getContext("2d"); g.fillStyle = "#f3ede0"; g.fillRect(0, 0, 256, 256); g.fillStyle = "#c9a24a"; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.fillStyle = "#da251d"; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill(); starPath(g, 128, 132, 80, 31); g.fillStyle = "#ffcd00"; g.fill(); }
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ map: canvasTex(emblemC) }));
  placeAt(emblem, 0, 9.25, 5.43, 0);
  // big entrance door frame
  box(0.3, 4.8, 0.5, -1.95, 2.4, 0.2, M.gold); box(0.3, 4.8, 0.5, 1.95, 2.4, 0.2, M.gold); box(4.2, 0.3, 0.5, 0, 4.75, 0.2, M.gold);
}

/* ================= statue & garden ================= */
const STATUE_EX = {
  date: "19/5/1890 – 2/9/1969", title: "Chủ tịch Hồ Chí Minh",
  text: "Lãnh tụ vĩ đại của dân tộc Việt Nam, người sáng lập Đảng Cộng sản Việt Nam (3/2/1930), khai sinh nước Việt Nam Dân chủ Cộng hòa (2/9/1945).",
  lesson: "Nguyễn Ái Quốc tìm ra con đường cứu nước theo chủ nghĩa Mác – Lênin và trực tiếp chuẩn bị về tư tưởng, chính trị, tổ chức cho sự ra đời của Đảng.",
};
function buildStatue() {
  if (!window.STATUE || window.STATUE.enabled === false) return;
  const sx = 0, sz = 11;
  const tiers = [box(4.4, 0.3, 4.4, sx, 0.15, sz, M.granite), box(3.6, 0.3, 3.6, sx, 0.45, sz, M.granite),
    box(2.4, 2.4, 2.4, sx, 1.8, sz, M.graniteDark), box(2.9, 0.3, 2.9, sx, 3.15, sz, M.granite)];
  const plq = textPlane([
    { text: "CHỦ TỊCH", size: 40, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 10 },
    { text: "HỒ CHÍ MINH", size: 64, weight: 700, color: GOLD_TXT, gap: 14 },
    { text: "1890 – 1969", size: 38, font: UI_FONT, color: "#e8dcc4" },
  ], 2.2, 1.2, { bg: "#3b3935", borderColor: "#c9a24a", ppm: 260, pad: 0.05 });
  placeAt(plq, sx, 1.85, sz + 1.21, 0);
  [...tiers, plq].forEach((m) => { m.userData.ex = STATUE_EX; interactive.push(m); });
  CIRCLES.push([sx, sz, 2.5]);
  const spot = new THREE.PointLight(0xfff0d0, 0.6, 9, 1.5); spot.position.set(sx, 7.5, sz + 2.5); scene.add(spot);

  const cfg = window.STATUE || {};
  const useImage = () => { if (cfg.image) statueFromImage(cfg, sx, sz); };
  if (!cfg.url || !THREE.GLTFLoader) { useImage(); return; }
  new THREE.GLTFLoader().load(cfg.url, (gltf) => {
    const m = gltf.scene;
    m.rotation.y = cfg.rotationY || 0;
    const b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3());
    m.scale.setScalar((cfg.height || 3.4) / (size.y || 1));
    b.setFromObject(m);
    const c = b.getCenter(new THREE.Vector3());
    m.position.set(m.position.x + sx - c.x, m.position.y + 3.3 - b.min.y, m.position.z + sz - c.z);
    m.traverse((o) => { if (o.isMesh) { o.userData.ex = STATUE_EX; interactive.push(o); } });
    scene.add(m);
  }, undefined, useImage);
}
// Tượng từ ảnh chụp mô hình của nhóm: tách nền (loang từ mép ảnh), cắt bỏ bệ trong ảnh, dựng đứng và luôn quay về người xem.
let statueBoard = null;
// cut the statue out of a render: returns an upscaled canvas with transparent background
function cutout(img, crop, tolerance, fill, keepLargest, trim) {
  {
    const W = img.width, Hh = Math.round(img.height * (crop || 1));
    const c = document.createElement("canvas"); c.width = W; c.height = Hh;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, Hh), p = d.data;
    const bg = new Uint8Array(W * Hh), q = [];
    const tol = tolerance || 6;
    const diff = (a, b) => Math.abs(p[a] - p[b]) + Math.abs(p[a + 1] - p[b + 1]) + Math.abs(p[a + 2] - p[b + 2]);
    for (let x = 0; x < W; x++) { q.push(x, (Hh - 1) * W + x); }
    for (let y = 0; y < Hh; y++) { q.push(y * W, y * W + W - 1); }
    for (const i of q) bg[i] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i - x) / W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        const j = ny * W + nx; if (bg[j]) continue;
        if (diff(i * 4, j * 4) < tol) { bg[j] = 1; q.push(j); }
      }
    }
    // keep only the biggest piece (drops labels such as "36°" printed on the sheet)
    if (keepLargest) {
      const lab = new Int32Array(W * Hh); let best = 0, bestId = 0, id = 0;
      for (let s = 0; s < W * Hh; s++) {
        if (bg[s] || lab[s]) continue;
        id++; let n = 0; const st = [s]; lab[s] = id;
        while (st.length) { const i = st.pop(); n++; const x = i % W, y = (i - x) / W;
          for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < Hh - 1 ? i + W : -1]) if (j >= 0 && !bg[j] && !lab[j]) { lab[j] = id; st.push(j); } }
        if (n > best) { best = n; bestId = id; }
      }
      for (let i = 0; i < W * Hh; i++) if (!bg[i] && lab[i] !== bestId) bg[i] = 1;
    }
    // close small gaps along the outline: grow the statue R px (copying colour from its neighbours), then shrink back
    const R = fill || 4;
    const nb = (i, x, y) => [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < Hh - 1 ? i + W : -1];
    for (let k = 0; k < R; k++) {
      const grow = [];
      for (let i = 0; i < W * Hh; i++) {
        if (!bg[i]) continue;
        const x = i % W, y = (i - x) / W;
        let r = 0, gg = 0, b = 0, n = 0;
        for (const j of nb(i, x, y)) if (j >= 0 && !bg[j]) { r += p[j * 4]; gg += p[j * 4 + 1]; b += p[j * 4 + 2]; n++; }
        if (n) grow.push(i, r / n, gg / n, b / n);
      }
      for (let t = 0; t < grow.length; t += 4) { const i = grow[t]; bg[i] = 0; p[i * 4] = grow[t + 1]; p[i * 4 + 1] = grow[t + 2]; p[i * 4 + 2] = grow[t + 3]; }
    }
    for (let k = 0; k < R + (trim || 0); k++) { // undo the growth (trim > 0 also removes a background fringe)
      const shrink = [];
      for (let i = 0; i < W * Hh; i++) {
        if (bg[i]) continue;
        const x = i % W, y = (i - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === Hh - 1 || nb(i, x, y).some((j) => j >= 0 && bg[j])) shrink.push(i);
      }
      for (const i of shrink) bg[i] = 1;
    }
    let minX = W, maxX = 0, minY = Hh, maxY = 0;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (bg[y * W + x]) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    // spread statue colours a few px into the background, so smoothing never pulls background colour into the edge
    const known = new Uint8Array(W * Hh); for (let i = 0; i < W * Hh; i++) known[i] = bg[i] ? 0 : 1;
    for (let k = 0; k < 4; k++) {
      const add = [];
      for (let i = 0; i < W * Hh; i++) {
        if (known[i]) continue;
        const x = i % W, y = (i - x) / W; let r = 0, gg = 0, b = 0, n = 0;
        for (const j of nb(i, x, y)) if (j >= 0 && known[j]) { r += p[j * 4]; gg += p[j * 4 + 1]; b += p[j * 4 + 2]; n++; }
        if (n) add.push(i, r / n, gg / n, b / n);
      }
      for (let t = 0; t < add.length; t += 4) { const i = add[t]; known[i] = 1; p[i * 4] = add[t + 1]; p[i * 4 + 1] = add[t + 2]; p[i * 4 + 2] = add[t + 3]; }
    }
    for (let i = 0; i < W * Hh; i++) p[i * 4 + 3] = 255;
    g.putImageData(d, 0, 0);
    // upscale x3 (colour and mask separately), then smooth the mask into a clean anti-aliased outline
    const pad = 4, S = 3, cw = maxX - minX + 1 + pad * 2, chh = maxY - minY + 1 + pad * 2, OW = cw * S, OH = chh * S;
    const out = document.createElement("canvas"); out.width = OW; out.height = OH;
    const og = out.getContext("2d"); og.imageSmoothingEnabled = true; og.imageSmoothingQuality = "high";
    og.drawImage(c, minX - pad, minY - pad, cw, chh, 0, 0, OW, OH);
    const mc = document.createElement("canvas"); mc.width = W; mc.height = Hh;
    const mctx = mc.getContext("2d"), md = mctx.createImageData(W, Hh);
    for (let i = 0; i < W * Hh; i++) { md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = bg[i] ? 0 : 255; }
    mctx.putImageData(md, 0, 0);
    const mo = document.createElement("canvas"); mo.width = OW; mo.height = OH;
    const moc = mo.getContext("2d"); moc.imageSmoothingEnabled = true; moc.imageSmoothingQuality = "high";
    moc.drawImage(mc, minX - pad, minY - pad, cw, chh, 0, 0, OW, OH);
    const mdat = moc.getImageData(0, 0, OW, OH).data;
    let A = new Float32Array(OW * OH); for (let i = 0; i < OW * OH; i++) A[i] = mdat[i * 4 + 3] / 255;
    const rad = S * 2;
    for (let pass = 0; pass < 2; pass++) { // separable box blur, horizontal then vertical
      const T = new Float32Array(OW * OH);
      for (let y = 0; y < OH; y++) { let s = 0; const row = y * OW;
        for (let x = -rad; x < OW; x++) { if (x + rad < OW) s += A[row + x + rad]; if (x - rad - 1 >= 0) s -= A[row + x - rad - 1]; if (x >= 0) T[row + x] = s / (2 * rad + 1); } }
      for (let x = 0; x < OW; x++) { let s = 0;
        for (let y = -rad; y < OH; y++) { if (y + rad < OH) s += T[(y + rad) * OW + x]; if (y - rad - 1 >= 0) s -= T[(y - rad - 1) * OW + x]; if (y >= 0) A[y * OW + x] = s / (2 * rad + 1); } }
    }
    const od = og.getImageData(0, 0, OW, OH);
    for (let i = 0; i < OW * OH; i++) { let t = (A[i] - 0.4) / 0.2; t = t < 0 ? 0 : t > 1 ? 1 : t; od.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255); }
    og.putImageData(od, 0, 0);
    return out;
  }
}
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
// Statue from a turntable sheet (several views around the statue): show the view that matches where the viewer stands.
let statueSprite = null;
async function statueFromSheet(cfg, sx, sz) {
  const sheet = await loadImg(cfg.sheet);
  if (!sheet) return false;
  const h = cfg.height || 3.4, views = [];
  for (const v of cfg.views) {
    const [x, y, w, hh] = v.r, ins = 6;
    const c = document.createElement("canvas"); c.width = w - ins * 2; c.height = hh - ins * 2;
    c.getContext("2d").drawImage(sheet, x + ins, y + ins, c.width, c.height, 0, 0, c.width, c.height);
    const out = cutout(c, v.crop || cfg.sheetCrop || 0.84, cfg.sheetTolerance || 8, 2, true, cfg.sheetTrim == null ? 1 : cfg.sheetTrim);
    views.push({ a: v.a, tex: canvasTex(out), aspect: out.width / out.height });
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  statueSprite = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: views[0].tex, transparent: true, alphaTest: 0.03, side: THREE.DoubleSide }));
  statueSprite.userData.views = views; statueSprite.userData.h = h; statueSprite.userData.cur = -1;
  statueSprite.position.set(sx, 3.3, sz); scene.add(statueSprite);
  statueSprite.userData.ex = STATUE_EX; interactive.push(statueSprite);
  return true;
}
function updateStatueSprite() {
  const s = statueSprite; if (!s) return;
  const face = (window.STATUE && window.STATUE.faceY) || 0;
  const a = Math.atan2(camera.position.x - s.position.x, camera.position.z - s.position.z);
  s.rotation.y = a;
  const dir = (window.STATUE && window.STATUE.turn) || 1;
  const view = ((dir * -(a - face)) * 180 / PI % 360 + 360) % 360; // 0 = front, 90 = statue's right side
  let best = 0, bd = 1e9;
  s.userData.views.forEach((v, i) => { const d = Math.abs(((view - v.a + 540) % 360) - 180); if (d < bd) { bd = d; best = i; } });
  if (best !== s.userData.cur) {
    const v = s.userData.views[best]; s.userData.cur = best;
    s.material.map = v.tex; s.material.needsUpdate = true;
    s.scale.set(s.userData.h * v.aspect, s.userData.h, 1);
  }
}
async function statueFromImage(cfg, sx, sz) {
  if (cfg.sheet && await statueFromSheet(cfg, sx, sz)) return;
  const [fi, bi] = await Promise.all([loadImg(cfg.image), loadImg(cfg.backImage)]);
  if (!fi) return;
  const out = cutout(fi, cfg.cropBottom, cfg.tolerance, cfg.fill);
  // silhouette (same shape, flat silver) for the inner layers
  const sil = document.createElement("canvas"); sil.width = out.width; sil.height = out.height;
  // inner layers keep the metal shading of the front image, toned down a little
  const sg = sil.getContext("2d"); sg.drawImage(out, 0, 0); sg.globalCompositeOperation = "source-atop"; sg.fillStyle = "rgba(110,112,118,0.45)"; sg.fillRect(0, 0, sil.width, sil.height);
  // back: the real back render if given, otherwise a plain silver silhouette
  let back;
  if (bi) back = cutout(bi, cfg.backCropBottom || cfg.cropBottom, cfg.backTolerance || cfg.tolerance, cfg.fill);
  else {
    back = document.createElement("canvas"); back.width = out.width; back.height = out.height;
    const bgc = back.getContext("2d"); bgc.translate(back.width, 0); bgc.scale(-1, 1); bgc.drawImage(out, 0, 0);
    bgc.setTransform(1, 0, 0, 1, 0, 0); bgc.globalCompositeOperation = "source-atop";
    const grad = bgc.createLinearGradient(0, 0, back.width, 0); grad.addColorStop(0, "#7d7f84"); grad.addColorStop(0.5, "#a9abb0"); grad.addColorStop(1, "#7d7f84");
    bgc.fillStyle = grad; bgc.fillRect(0, 0, back.width, back.height);
  }
  // inner layers = only where front and (mirrored) back shapes overlap, so nothing pokes out
  if (bi) {
    const bw = out.height * back.width / back.height;
    sg.globalCompositeOperation = "destination-in";
    sg.save(); sg.translate(out.width / 2 + bw / 2, 0); sg.scale(-1, 1); sg.drawImage(back, 0, 0, bw, out.height); sg.restore();
  }
  const h = cfg.height || 3.4, depth = cfg.depth || 0.3, layers = 40;
  const plane = (c) => { const w = h * c.width / c.height; const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0); return g; };
  const mk = (canvasEl, side) => new THREE.MeshBasicMaterial({ map: canvasTex(canvasEl), transparent: true, alphaTest: 0.5, side });
  const geo = plane(out);
  statueBoard = new THREE.Group();
  const front = new THREE.Mesh(geo, mk(out, THREE.FrontSide)); front.position.z = depth / 2;
  const rear = new THREE.Mesh(plane(back), mk(back, THREE.FrontSide)); rear.rotation.y = PI; rear.position.z = -depth / 2;
  statueBoard.add(front, rear);
  const silMat = mk(sil, THREE.DoubleSide);
  // layers close to the front and back are slightly narrower: rounded sides instead of a flat slab
  for (let k = 1; k < layers; k++) {
    const u = (2 * k) / layers - 1;
    const m = new THREE.Mesh(geo, silMat);
    m.position.z = depth / 2 - (depth * k) / layers;
    m.scale.x = 0.93 + 0.07 * Math.sqrt(1 - u * u);
    statueBoard.add(m);
  }
  statueBoard.position.set(sx, 3.3, sz); statueBoard.rotation.y = cfg.faceY || 0; scene.add(statueBoard);
  statueBoard.traverse((o) => { if (o.isMesh) { o.userData.ex = STATUE_EX; interactive.push(o); } });
}
function makeRoseBlossomGeo() {
  const parts = [];
  // Tight spiral bud center
  const core = new THREE.ConeGeometry(0.024, 0.055, 7);
  core.rotateX(PI); core.translate(0, 0.032, 0);
  parts.push(core);
  // 2 concentric whorls of cupped, outward-curling rose petals (5 inner + 7 outer)
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 5 : 7;
    const rad = ring === 0 ? 0.032 : 0.054;
    const tilt = ring === 0 ? 0.48 : 0.88;
    const pw = ring === 0 ? 0.038 : 0.048;
    const ph = ring === 0 ? 0.062 : 0.074;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2 + ring * 0.45;
      const pet = new THREE.SphereGeometry(1, 7, 5, 0, PI, 0, PI * 0.65);
      pet.scale(pw, ph, 0.016);
      pet.rotateX(tilt);
      pet.translate(0, 0.028 + ring * 0.004, rad);
      pet.rotateY(a);
      parts.push(pet);
    }
  }
  return mergeGeos(parts);
}

function makeTulipBlossomGeo() {
  const parts = [];
  // 6 sculpted cupped petals (3 inner + 3 outer) forming a classic tulip cup
  for (let ring = 0; ring < 2; ring++) {
    const rad = ring === 0 ? 0.026 : 0.034;
    const tilt = ring === 0 ? 0.22 : 0.34;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2 + ring * (PI / 3);
      const pet = new THREE.SphereGeometry(1, 7, 6, 0, PI, 0, PI * 0.72);
      pet.scale(0.036, 0.095, 0.022);
      pet.translate(0, 0.045, 0);
      pet.rotateX(tilt);
      pet.translate(0, 0.01, rad);
      pet.rotateY(a);
      parts.push(pet);
    }
  }
  return mergeGeos(parts);
}

function makeRoseCompoundLeafGeo() {
  const parts = [];
  // 3 pointed leaflets (1 terminal + 2 lateral)
  for (const [ang, offZ, sc] of [[0, 0.055, 1], [1.05, 0.02, 0.78], [-1.05, 0.02, 0.78]]) {
    const lf = new THREE.ConeGeometry(0.028 * sc, 0.075 * sc, 4);
    lf.scale(1, 1, 0.18);
    lf.rotateX(H2);
    lf.rotateY(ang);
    lf.translate(0, 0, offZ);
    parts.push(lf);
  }
  return mergeGeos(parts);
}

function makeTulipArchLeafGeo() {
  // Curved lance-shaped blade that arches gracefully outward
  const parts = [];
  const lower = new THREE.ConeGeometry(0.034, 0.16, 4);
  lower.scale(1, 1, 0.16); lower.translate(0, 0.08, 0); lower.rotateX(0.18);
  const upper = new THREE.ConeGeometry(0.03, 0.16, 4);
  upper.scale(1, 1, 0.15); upper.translate(0, 0.08, 0); upper.rotateX(0.52);
  upper.translate(0, 0.14, 0.025);
  parts.push(lower, upper);
  return mergeGeos(parts);
}

function makeCalyxGeo() {
  const parts = [];
  const base = new THREE.ConeGeometry(0.022, 0.035, 5);
  base.rotateX(PI); base.translate(0, 0.005, 0);
  parts.push(base);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2;
    const sep = new THREE.ConeGeometry(0.01, 0.045, 3);
    sep.scale(1, 1, 0.25); sep.translate(0, 0.022, 0);
    sep.rotateX(1.15); sep.rotateY(a);
    parts.push(sep);
  }
  return mergeGeos(parts);
}

function buildGarden() {
  // Stepped stone planters on both sides of the plaza:
  // Left bed: multi-petal velvety Roses; Right bed: 6-petal cupped Tulips
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 6); stemGeo.translate(0, 0.5, 0);
  const roseHead = makeRoseBlossomGeo();
  const calyxGeo = makeCalyxGeo();
  const roseLeaf = makeRoseCompoundLeafGeo();
  const tulipHead = makeTulipBlossomGeo();
  const tulipLeaf = makeTulipArchLeafGeo();
  const stamenGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.055, 6); stamenGeo.translate(0, 0.035, 0);
  const foliageGeo = makeOrganicFoliageGeo();

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x356e2a, roughness: 0.68 });
  const roseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0.02, side: THREE.DoubleSide });
  const tulipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.04, side: THREE.DoubleSide });
  const stamenMat = new THREE.MeshStandardMaterial({ color: 0xf7c926, roughness: 0.4, emissive: 0x261a00 });
  const roseLeafMat = new THREE.MeshStandardMaterial({ color: 0x285c22, roughness: 0.58, side: THREE.DoubleSide });
  const tulipLeafMat = new THREE.MeshStandardMaterial({ color: 0x458538, roughness: 0.52, side: THREE.DoubleSide });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f6827, roughness: 0.72 });

  const ROSE = [0xb81424, 0xd92538, 0x8a0f1d, 0xeb4d68, 0xc7182c, 0xf0788c];
  const TULIP = [0xd62828, 0xf77f00, 0xfcbf49, 0x7209b7, 0xf4f1de, 0xe63946];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

  for (const s of [-1, 1]) {
    const cx = s * 8.5, cz = 9.2, rose = s < 0;
    // Stepped stone planter with coping lip & corner finials
    box(5.25, 0.14, 3.25, cx, 0.07, cz, M.granite);
    box(5.0, 0.34, 3.0, cx, 0.21, cz, M.graniteDark);
    box(5.16, 0.07, 3.16, cx, 0.39, cz, M.granite);
    box(4.72, 0.38, 2.72, cx, 0.20, cz, M.soil);
    for (const dx of [-2.48, 2.48]) for (const dz of [-1.48, 1.48]) {
      box(0.28, 0.48, 0.28, cx + dx, 0.24, cz + dz, M.graniteDark);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.gold);
      fin.position.set(cx + dx, 0.55, cz + dz); scene.add(fin);
    }

    // Lush low groundcover foliage puffs over the soil
    for (let gx = -2.0; gx <= 2.0; gx += 0.55) for (let gz = -1.0; gz <= 1.0; gz += 0.55) {
      const puff = new THREE.Mesh(foliageGeo, shrubMat);
      puff.position.set(cx + gx + (rand() - 0.5) * 0.18, 0.41, cz + gz + (rand() - 0.5) * 0.18);
      puff.scale.set(0.24 + rand() * 0.1, 0.11 + rand() * 0.06, 0.24 + rand() * 0.1);
      puff.rotation.y = rand() * PI;
      scene.add(puff);
    }

    const N = 180;
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, N);
    const heads = new THREE.InstancedMesh(rose ? roseHead : tulipHead, rose ? roseMat : tulipMat, N);
    const extras = new THREE.InstancedMesh(rose ? calyxGeo : stamenGeo, rose ? stemMat : stamenMat, N);
    const leaves = new THREE.InstancedMesh(rose ? roseLeaf : tulipLeaf, rose ? roseLeafMat : tulipLeafMat, N * 3);
    stems.castShadow = true; heads.castShadow = true; leaves.castShadow = true;

    let i = 0, li = 0;
    for (let x = -2.18; x <= 2.18; x += 0.22) for (let z = -1.16; z <= 1.16; z += 0.22) {
      if (i >= N) break;
      const fx = cx + x + (rand() - 0.5) * 0.11, fz = cz + z + (rand() - 0.5) * 0.11;
      const h = (rose ? 0.36 : 0.32) + rand() * 0.16, tilt = (rand() - 0.5) * 0.24;
      e.set(tilt, rand() * PI, tilt * 0.6); q.setFromEuler(e);
      stems.setMatrixAt(i, m4.compose(p.set(fx, 0.38, fz), q, sc.set(1, h, 1)));

      const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(p.set(fx, 0.38, fz));
      e.set(tilt * 0.8 + (rand() - 0.5) * 0.22, rand() * PI * 2, (rand() - 0.5) * 0.22);
      const hq = new THREE.Quaternion().setFromEuler(e);
      const bScale = 0.88 + rand() * 0.32;
      heads.setMatrixAt(i, m4.compose(top, hq, sc.set(bScale, bScale, bScale)));
      col.setHex((rose ? ROSE : TULIP)[Math.floor(rand() * (rose ? ROSE.length : TULIP.length))]);
      heads.setColorAt(i, col);
      extras.setMatrixAt(i, m4.compose(top, hq, sc.set(bScale, bScale, bScale)));

      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * PI * 2 + rand() * 0.8;
        if (rose) {
          e.set(0.25, ang, (rand() - 0.5) * 0.3); q.setFromEuler(e);
          const ly = 0.38 + h * (0.28 + k * 0.22);
          leaves.setMatrixAt(li++, m4.compose(p.set(fx + Math.sin(ang) * 0.015, ly, fz + Math.cos(ang) * 0.015), q, sc.setScalar(0.85 + rand() * 0.35)));
        } else {
          e.set(0.2 + rand() * 0.25, ang, 0); q.setFromEuler(e);
          leaves.setMatrixAt(li++, m4.compose(p.set(fx, 0.38, fz), q, sc.set(0.9 + rand() * 0.3, 0.85 + rand() * 0.4, 0.9)));
        }
      }
      i++;
    }
    for (const im of [stems, heads, extras]) { im.count = i; if (im.instanceColor) im.instanceColor.needsUpdate = true; scene.add(im); }
    leaves.count = li; scene.add(leaves);

    const label = textPlane([{ text: rose ? "Vườn hoa hồng" : "Vườn hoa tulip", size: 40, weight: 700, color: GOLD_TXT }], 1.6, 0.32, { ppm: 240 });
    placeAt(label, cx, 0.22, cz + 1.64, 0);
    for (let x = -2.5; x <= 2.5; x += 0.8) for (const z of [-1.5, 0, 1.5]) CIRCLES.push([cx + x, cz + z, 0.6]);

    // Slatted wooden park benches with cast-iron legs & armrests facing the path
    for (const bz of [19, 25]) {
      const bx = s * 4.6;
      for (let slat = -1; slat <= 1; slat++) {
        box(0.16, 0.05, 2.05, bx + slat * 0.18, 0.5, bz, M.wood);
        box(0.05, 0.15, 2.05, bx + s * 0.28, 0.72 + slat * 0.16, bz, M.wood);
      }
      for (const dz of [-0.85, 0.85]) {
        box(0.56, 0.48, 0.08, bx, 0.24, bz + dz, M.dark);
        box(0.56, 0.06, 0.07, bx, 0.68, bz + dz, M.dark);
        box(0.07, 0.22, 0.07, bx - s * 0.24, 0.58, bz + dz, M.dark);
      }
      CIRCLES.push([bx, bz - 0.6, 0.5], [bx, bz + 0.6, 0.5]);
    }

    // Sculpted ornamental facade hedge planter with manicured topiary & flowering shrubs
    const hx = s * 16, hz = 1.4;
    box(7.8, 0.32, 1.0, hx, 0.16, hz, M.granite);
    box(7.5, 0.34, 0.74, hx, 0.18, hz, M.soil);
    for (let ox = -3.4; ox <= 3.4; ox += 0.68) {
      const bush = new THREE.Mesh(foliageGeo, M.hedge);
      bush.position.set(hx + ox, 0.62 + (Math.abs(Math.round(ox * 10)) % 2) * 0.06, hz);
      bush.scale.set(0.52, 0.42, 0.44);
      bush.castShadow = true; bush.receiveShadow = true;
      scene.add(bush);
    }
    // Conical topiary trees at the ends and center of the facade planter
    const topiaryMat = new THREE.MeshStandardMaterial({ color: 0x3b7a31, roughness: 0.65 });
    for (const tx of [-3.4, 0, 3.4]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 12), topiaryMat);
      cone.position.set(hx + tx, 1.15, hz); cone.castShadow = true;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), topiaryMat);
      ball.position.set(hx + tx, 1.9, hz); ball.castShadow = true;
      scene.add(cone, ball);
    }
    for (let x = 12.4; x <= 19.8; x += 0.8) CIRCLES.push([s * x, 1.4, 0.6]);
  }
}

/* ================= outdoor exhibits: tank & aircraft ================= */
const TANK_EX = {
  date: "30/4/1975", title: "Xe tăng T-54 (số 390)",
  text: "Trưa 30/4/1975, các xe tăng 843 và 390 của Lữ đoàn xe tăng 203 tiến vào Dinh Độc Lập; xe tăng 390 húc đổ cổng chính. Chính quyền Sài Gòn tuyên bố đầu hàng không điều kiện, miền Nam hoàn toàn giải phóng.",
  lesson: "Thắng lợi của Tổng tiến công và nổi dậy mùa Xuân 1975, kết thúc 21 năm kháng chiến chống Mỹ, cứu nước.",
};
const MIG_EX = {
  date: "12/1972", title: "Máy bay tiêm kích MiG-21",
  text: "Loại máy bay chủ lực của Không quân nhân dân Việt Nam. Trong 12 ngày đêm cuối năm 1972, quân dân miền Bắc đánh bại cuộc tập kích chiến lược bằng B-52 của Mỹ; đêm 27/12/1972, phi công Phạm Tuân lái MiG-21 bắn rơi một chiếc B-52.",
  lesson: "Chiến thắng “Hà Nội – Điện Biên Phủ trên không” buộc Mỹ ký Hiệp định Paris (27/1/1973).",
};
function exhibitBase(x, z, w, d, ex, ry) {
  if (ry && Math.abs(Math.sin(ry)) > 0.7) { const t = w; w = d; d = t; }
  const base = box(w, 0.24, d, x, 0.12, z, M.granite);
  const topSlab = box(w - 0.24, 0.08, d - 0.24, x, 0.28, z, M.graniteDark);
  const trim = box(w - 0.18, 0.03, d - 0.18, x, 0.25, z, M.gold);
  base.userData.ex = ex; topSlab.userData.ex = ex; trim.userData.ex = ex;
  interactive.push(base, topSlab);
  // Museum corner bollards around the plinth
  for (const sx of [-w / 2 + 0.22, w / 2 - 0.22]) for (const sz of [-d / 2 + 0.22, d / 2 - 0.22]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), M.dark);
    post.position.set(x + sx, 0.55, z + sz); post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.gold);
    cap.position.set(x + sx, 0.84, z + sz);
    scene.add(post, cap);
  }
  for (let a = -w / 2; a <= w / 2 + 0.01; a += 1) for (const b of [-d / 2, d / 2]) CIRCLES.push([x + a, z + b, 0.7]);
  for (let b = -d / 2; b <= d / 2 + 0.01; b += 1) for (const a of [-w / 2, w / 2]) CIRCLES.push([x + a, z + b, 0.7]);
  CIRCLES.push([x, z, Math.min(w, d) / 2]);
}
function exhibitSign(x, z, ry, ex) {
  box(0.08, 1.1, 0.08, x - 0.6, 0.55, z, M.dark); box(0.08, 1.1, 0.08, x + 0.6, 0.55, z, M.dark);
  const s = textPlane([
    { text: ex.date, size: 34, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 6 },
    { text: ex.title, size: 46, weight: 700 },
  ], 1.6, 0.6, { ppm: 300 });
  const g = new THREE.Group(); g.add(s); s.position.y = 1.2; placeAt(g, x, 0, z, ry);
  s.userData.ex = ex; interactive.push(s);
}
function tagAll(group, ex) { group.traverse((o) => { if (o.isMesh) { o.userData.ex = ex; interactive.push(o); } }); }

// Nạp file .glb một lần, dùng chung cho nhiều chỗ (cây, ghế...).
const GLB_CACHE = new Map();
function loadGlbOnce(url) {
  if (!GLB_CACHE.has(url)) {
    GLB_CACHE.set(url, new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) return reject(new Error("no GLTFLoader"));
      new THREE.GLTFLoader().load(url, (g) => resolve(g.scene), undefined, reject);
    }));
  }
  return GLB_CACHE.get(url);
}
// Chuẩn hoá model: xoay, co giãn theo kích thước thật, đặt tâm vào giữa và đáy chạm mặt đất.
// fit = "length" (cạnh ngang dài nhất) hoặc "height".
function fitModel(model, size, { fit = "length", rotY = 0, yOffset = 0 } = {}) {
  const wrap = new THREE.Group(); wrap.add(model);
  model.rotation.y += rotY;
  let b = new THREE.Box3().setFromObject(wrap), s = b.getSize(new THREE.Vector3());
  const cur = fit === "height" ? s.y : Math.max(s.x, s.z);
  if (cur > 1e-4) model.scale.multiplyScalar(size / cur);
  b.setFromObject(wrap); const c = b.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y += yOffset - b.min.y;
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      if (m.map) m.map.encoding = THREE.sRGBEncoding;
      if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
      if (m.roughness != null) m.roughness = Math.max(0.35, m.roughness);
      if (m.name === "normal_leaves" || (o.name && o.name.includes("leaves")) || (m.map && m.transparent)) {
        m.alphaTest = 0.42;
        m.depthWrite = true;
        m.side = THREE.DoubleSide;
      }
      m.needsUpdate = true;
    }
  });
  return wrap;
}
// Căn tâm XZ theo phần gốc (đáy ~8% chiều cao) thay vì cả hộp bao — tán lá lệch không kéo thân ra khỏi bồn.
function centerOnBase(wrap, frac = 0.08) {
  wrap.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(wrap), lim = b.min.y + (b.max.y - b.min.y) * frac;
  const base = new THREE.Box3(), v = new THREE.Vector3();
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y <= lim) base.expandByPoint(v);
    }
  });
  if (base.isEmpty()) return;
  const c = base.getCenter(v), m = wrap.children[0];
  m.position.x -= c.x; m.position.z -= c.z;
}
// Thay hiện vật dựng bằng code (nhóm có userData.key) bằng mô hình .glb thật khi tải xong.
// Tải lỗi thì giữ nguyên mô hình dựng bằng code.
function upgradeExhibit(key, url, size, opts) {
  let g = null;
  scene.traverse((o) => { if (!g && o.userData && o.userData.key === key && o.isGroup) g = o; });
  if (!g) return;
  loadGlbOnce(url).then((src) => {
    const model = fitModel(src.clone(true), size, opts);
    for (const ch of [...g.children]) {
      g.remove(ch);
      ch.traverse((o) => { const i = interactive.indexOf(o); if (i !== -1) interactive.splice(i, 1); });
    }
    g.add(model);
    tagAll(model, OUT_EX[key]);
  }).catch((e) => console.info("Giữ mô hình dựng bằng code cho", key, e && e.message));
}

/* ---- PBR military materials & procedural armor/aircraft textures ---- */
function armorPanelCanvas() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#808080"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#525252"; g.lineWidth = 2;
  for (let v = 64; v < 256; v += 64) {
    g.beginPath(); g.moveTo(0, v); g.lineTo(256, v); g.stroke();
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 256); g.stroke();
  }
  g.fillStyle = "#a8a8a8";
  for (let y = 8; y < 256; y += 64) for (let x = 8; x < 256; x += 16) {
    g.beginPath(); g.arc(x, y, 1.8, 0, PI * 2); g.fill();
  }
  for (let i = 0; i < 600; i++) {
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    g.fillRect(rand() * 256, rand() * 256, 3, 3);
  }
  return c;
}
const armorBump = canvasTex(armorPanelCanvas(), [3, 3]);
const MIL = {
  olive: new THREE.MeshStandardMaterial({ color: 0x3a4a28, bumpMap: armorBump, bumpScale: 0.012, roughness: 0.42, metalness: 0.36 }),
  oliveDark: new THREE.MeshStandardMaterial({ color: 0x243217, bumpMap: armorBump, bumpScale: 0.01, roughness: 0.55, metalness: 0.38 }),
  truckGreen: new THREE.MeshStandardMaterial({ color: 0x2e4828, bumpMap: armorBump, bumpScale: 0.008, roughness: 0.44, metalness: 0.28 }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.26, metalness: 0.85 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x626970, roughness: 0.28, metalness: 0.80 }),
  track: new THREE.MeshStandardMaterial({ color: 0x181917, bumpMap: armorBump, bumpScale: 0.02, roughness: 0.78, metalness: 0.52 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.88, metalness: 0.06 }),
  duralumin: new THREE.MeshStandardMaterial({ color: 0xd4dce4, bumpMap: armorBump, bumpScale: 0.006, roughness: 0.18, metalness: 0.88 }),
  radomeGreen: new THREE.MeshStandardMaterial({ color: 0x1e5f3b, roughness: 0.35, metalness: 0.25 }),
  noseRed: new THREE.MeshStandardMaterial({ color: 0xc81822, roughness: 0.30, metalness: 0.25 }),
  missileWhite: new THREE.MeshStandardMaterial({ color: 0xedf0eb, roughness: 0.28, metalness: 0.35 }),
  camoGreen: new THREE.MeshStandardMaterial({ color: 0x425232, bumpMap: armorBump, bumpScale: 0.006, roughness: 0.44, metalness: 0.32 }),
  camoTan: new THREE.MeshStandardMaterial({ color: 0x8a754c, bumpMap: armorBump, bumpScale: 0.006, roughness: 0.46, metalness: 0.28 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0x56633b, bumpMap: armorBump, bumpScale: 0.015, roughness: 0.86, metalness: 0.02 }),
  burlap: new THREE.MeshStandardMaterial({ color: 0xb59968, bumpMap: armorBump, bumpScale: 0.018, roughness: 0.9, metalness: 0.0 }),
  scorched: new THREE.MeshStandardMaterial({ color: 0x333638, bumpMap: armorBump, bumpScale: 0.022, roughness: 0.55, metalness: 0.65, side: THREE.DoubleSide }),
  rust: new THREE.MeshStandardMaterial({ color: 0x5a3b25, bumpMap: armorBump, bumpScale: 0.025, roughness: 0.78, metalness: 0.35 }),
  canopyGlass: new THREE.MeshPhysicalMaterial({ color: 0x1f4664, transparent: true, opacity: 0.72, roughness: 0.06, metalness: 0.18, clearcoat: 1.0 }),
  headlight: new THREE.MeshStandardMaterial({ color: 0xfff6cf, emissive: 0x776822, roughness: 0.12 }),
};

function makeVpaStarMat() {
  const ic = document.createElement("canvas"); ic.width = ic.height = 128;
  const c = ic.getContext("2d");
  c.fillStyle = "#ffcd00"; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
  c.fillStyle = "#da251d"; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.fill();
  starPath(c, 64, 67, 40, 16); c.fillStyle = "#ffcd00"; c.fill();
  return new THREE.MeshBasicMaterial({ map: canvasTex(ic), transparent: true, depthWrite: false });
}
const vpaStarMat = makeVpaStarMat();

/* ================= Bộ tải mô hình 3D thực tế (.glb) ngoài trời với fallback ================= */
function loadGltfExhibit(cfg) {
  const { url, x, z, ry, targetLength, ex, rotationOffset = 0, yOffset = 0, fallback, onModel, preRotate } = cfg;
  const mount = new THREE.Group();
  mount.position.set(x, 0.32, z);
  mount.rotation.y = ry || 0;
  scene.add(mount);

  // Hiển thị ngay mô hình PBR thủ công trong khi chờ tải file .glb
  let fallbackGrp = null;
  if (typeof fallback === "function") {
    fallbackGrp = fallback();
    if (fallbackGrp) mount.add(fallbackGrp);
  }

  if (!url || !THREE.GLTFLoader) return mount;

  const loader = new THREE.GLTFLoader();
  loader.load(url, (gltf) => {
    const model = gltf.scene;

    // Khi file 3D thật tải xong, gỡ mô hình thủ công
    if (fallbackGrp) {
      mount.remove(fallbackGrp);
      fallbackGrp.traverse((o) => {
        const idx = interactive.indexOf(o);
        if (idx !== -1) interactive.splice(idx, 1);
      });
      fallbackGrp = null;
    }

    if (preRotate) {
      if (preRotate.x) model.rotation.x += preRotate.x;
      if (preRotate.y) model.rotation.y += preRotate.y;
      if (preRotate.z) model.rotation.z += preRotate.z;
    }

    if (rotationOffset) model.rotation.y += rotationOffset;

    // Đo và căn tỉ lệ chuẩn kích thước thực tế
    let b = new THREE.Box3().setFromObject(model);
    let size = b.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    if (maxDim > 0.05 && targetLength) {
      const s = targetLength / maxDim;
      model.scale.multiplyScalar(s);
    }
    b.setFromObject(model);
    const center = b.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y = (model.position.y - b.min.y) + yOffset;

    // Bật bóng đổ, tinh chỉnh màu sắc vật liệu PBR sắc nét và gán tương tác
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.ex = ex;
        interactive.push(o);
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) {
              m.map.encoding = THREE.sRGBEncoding;
              m.map.needsUpdate = true;
            }
            if (m.roughness != null) {
              m.roughness = Math.max(0.32, Math.min(0.72, m.roughness));
            }
            m.needsUpdate = true;
          });
        }
      }
    });

    if (typeof onModel === "function") onModel(model);
    mount.add(model);
  }, undefined, (err) => {
    console.info("Dùng mô hình PBR mô phỏng cho:", url, err && err.message);
  });

  return mount;
}

function buildTank(x, z, ry) {
  exhibitBase(x, z, 9.2, 5.6, TANK_EX, ry);
  const tankUrl = (window.MODELS && window.MODELS.tank) || "models/tank_390.glb";

  loadGltfExhibit({
    url: tankUrl,
    x, z, ry,
    targetLength: 7.2,
    rotationOffset: H2,
    yOffset: 0.02,
    ex: TANK_EX,
    fallback: () => buildProceduralTank(TANK_EX),
    onModel: (model) => {
      // Bổ sung phù hiệu Sao Vàng & số hiệu 390 lịch sử lên thân xe 3D thật
      const nc = textCanvas([{ text: "390", size: 130, weight: 700, font: UI_FONT, color: "#f6f0dc" }], 1, 0.5, { bg: "#3a4a28", border: false, ppm: 300 });
      const nt = canvasTex(nc);
      const numMat = new THREE.MeshStandardMaterial({ map: nt, roughness: 0.5 });
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), numMat);
        p.position.set(0.25, 1.82, s * 1.38); p.rotation.y = s > 0 ? 0 : PI; p.rotation.x = -0.22;
        const st = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), vpaStarMat);
        st.position.set(0.85, 1.84, s * 1.36); st.rotation.y = s > 0 ? 0 : PI; st.rotation.x = -0.22;
        model.add(p, st);
      }
    }
  });
}

function buildProceduralTank(ex) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0, ry0 = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz); m.rotation.set(rx, ry0, rz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };
  // Sloped armor hull (T-54B profile) with lower hull tub, glacis splash board, and rear engine deck
  const hp = new THREE.Shape();
  hp.moveTo(-3.15, 0.05); hp.lineTo(2.45, 0.05); hp.lineTo(3.32, 0.56); hp.lineTo(2.25, 1.08);
  hp.lineTo(-2.95, 1.08); hp.lineTo(-3.2, 0.72); hp.lineTo(-3.15, 0.05);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hp, { depth: 2.24, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), MIL.olive);
  hull.position.set(0, 0.72, -1.12); hull.castShadow = true; hull.receiveShadow = true; g.add(hull);

  // Glacis wave deflector, driver's hatch, periscope, headlights with cages, tow hooks
  add(bx(0.08, 0.14, 2.1), MIL.oliveDark, 2.72, 1.56, 0, 0, 0, 0.45);
  add(cyl(0.28, 0.3, 0.08, 12), MIL.oliveDark, 1.85, 1.82, -0.52);
  add(bx(0.16, 0.12, 0.26), MIL.gunmetal, 2.12, 1.84, -0.52);
  for (const s of [-1, 1]) {
    add(cyl(0.11, 0.11, 0.14, 12), MIL.oliveDark, 2.85, 1.48, s * 0.82, 0, 0, H2);
    add(cyl(0.09, 0.09, 0.03, 12), MIL.headlight, 2.93, 1.48, s * 0.82, 0, 0, H2);
    add(bx(0.18, 0.08, 0.12), MIL.gunmetal, 3.22, 1.18, s * 0.75); // tow hooks
  }
  // Engine deck grilles, exhaust port, unditching log, and 2 rear external cylindrical fuel drums
  add(bx(1.35, 0.05, 1.7), MIL.gunmetal, -1.95, 1.81, 0);
  add(bx(0.35, 0.14, 0.55), MIL.gunmetal, -2.55, 1.83, -0.65);
  add(cyl(0.11, 0.11, 2.85, 10), M.wood, -3.05, 1.42, 0, H2, 0, 0); // unditching log
  for (const dz of [-0.68, 0.68]) {
    add(cyl(0.26, 0.26, 1.15, 16), MIL.oliveDark, -3.28, 1.68, dz, 0, 0, 0.25);
    for (const end of [-0.58, 0.58]) add(cyl(0.27, 0.27, 0.03, 16), MIL.gunmetal, -3.28 - end * Math.sin(0.25), 1.68 + end * Math.cos(0.25), dz, 0, 0, 0.25);
  }

  // Detailed tracks, fenders, toolboxes, 5 dual road wheels (characteristic T-54 gap after 1st wheel), idler & sprocket
  const wheelXs = [-2.25, -1.25, -0.32, 0.62, 1.78];
  for (const s of [-1, 1]) {
    const zt = s * 1.48;
    // Upper and lower track runs + rounded ends
    add(bx(5.85, 0.11, 0.58), MIL.track, 0, 1.18, zt);
    add(bx(5.45, 0.12, 0.58), MIL.track, 0, 0.36, zt);
    add(cyl(0.42, 0.42, 0.58, 16), MIL.track, -2.85, 0.82, zt, H2, 0, 0);
    add(cyl(0.38, 0.38, 0.58, 16), MIL.track, 2.85, 0.86, zt, H2, 0, 0);
    // Fender + front/rear mudguards + storage toolboxes
    add(bx(6.65, 0.06, 0.72), MIL.oliveDark, 0, 1.32, zt);
    add(bx(0.45, 0.32, 0.72), MIL.oliveDark, 3.25, 1.18, zt, 0, 0, -0.65);
    add(bx(0.42, 0.3, 0.72), MIL.oliveDark, -3.25, 1.16, zt, 0, 0, 0.65);
    add(bx(0.95, 0.28, 0.42), MIL.olive, -0.4 + s * 0.3, 1.48, s * 1.38);
    add(bx(0.85, 0.26, 0.42), MIL.olive, 1.1, 1.47, s * 1.38);
    // 5 road wheels with black rubber outer ring, olive dished rim & bolted hubcap
    for (const wx of wheelXs) {
      add(cyl(0.43, 0.43, 0.34, 22), MIL.tyre, wx, 0.74, zt, H2, 0, 0);
      add(cyl(0.33, 0.33, 0.36, 20), MIL.olive, wx, 0.74, zt, H2, 0, 0);
      add(cyl(0.12, 0.12, 0.4, 12), MIL.oliveDark, wx, 0.74, zt, H2, 0, 0);
    }
    // Rear drive sprocket & front idler wheel
    add(cyl(0.34, 0.34, 0.36, 16), MIL.oliveDark, -2.85, 0.82, zt, H2, 0, 0);
    add(cyl(0.31, 0.31, 0.36, 16), MIL.olive, 2.85, 0.86, zt, H2, 0, 0);
  }

  // Iconic T-54 cast dome turret („bánh bao“ dome profile)
  const tur = add(new THREE.SphereGeometry(1.32, 32, 16, 0, PI * 2, 0, PI * 0.52), MIL.olive, -0.15, 1.76, 0);
  tur.scale.set(1.12, 0.64, 1.02);
  // Turret ring & bustle handrail
  add(cyl(1.26, 1.28, 0.12, 28), MIL.oliveDark, -0.15, 1.78, 0);
  for (const s of [-1, 1]) {
    add(cyl(0.022, 0.022, 1.35, 8), MIL.oliveDark, -0.45, 2.18, s * 1.26, 0, 0, H2);
  }
  // Commander's cupola (left) + Loader's hatch (right) + 12.7mm DShK AA heavy machine gun
  add(cyl(0.32, 0.35, 0.24, 18), MIL.oliveDark, -0.55, 2.6, 0.42);
  add(cyl(0.28, 0.3, 0.16, 16), MIL.oliveDark, -0.48, 2.56, -0.44);
  // DShK 12.7mm AA Machine Gun on loader's cupola
  add(cyl(0.04, 0.05, 0.36, 8), MIL.gunmetal, -0.35, 2.78, -0.44);
  add(bx(0.48, 0.14, 0.12), MIL.gunmetal, -0.25, 2.96, -0.44);
  add(bx(0.18, 0.22, 0.26), MIL.oliveDark, -0.28, 2.92, -0.62); // ammo box
  add(cyl(0.025, 0.032, 1.05, 10), MIL.gunmetal, 0.42, 3.0, -0.44, 0, 0, -H2 + 0.08);
  add(cyl(0.048, 0.042, 0.14, 10), MIL.gunmetal, 0.92, 3.04, -0.44, 0, 0, -H2 + 0.08); // DShK muzzle brake

  // Gun mantlet with canvas weather cover + IR searchlight + 100mm D-10T rifled main gun with fume extractor
  const mantlet = add(new THREE.SphereGeometry(0.42, 18, 12), MIL.canvas, 1.02, 2.14, 0);
  mantlet.scale.set(0.95, 0.72, 1.05);
  add(cyl(0.18, 0.18, 0.22, 14), MIL.oliveDark, 1.05, 2.38, -0.42, 0, 0, H2); // Luna IR searchlight
  add(cyl(0.16, 0.16, 0.03, 14), MIL.gunmetal, 1.16, 2.38, -0.42, 0, 0, H2);
  add(cyl(0.095, 0.125, 4.35, 18), MIL.oliveDark, 3.12, 2.18, 0, 0, 0, -H2 + 0.03);
  add(cyl(0.155, 0.155, 0.56, 18), MIL.olive, 3.72, 2.2, 0, 0, 0, -H2 + 0.03); // bore evacuator
  add(cyl(0.075, 0.075, 0.08, 14), M.dark, 5.28, 2.24, 0, 0, 0, -H2 + 0.03); // dark gun bore

  // Turret insignia: Red-Yellow Star + bold "390" on both sides of the turret
  const nc = textCanvas([{ text: "390", size: 130, weight: 700, font: UI_FONT, color: "#f6f0dc" }], 1, 0.5, { bg: "#3a4a28", border: false, ppm: 300 });
  const nt = canvasTex(nc);
  const numMat = new THREE.MeshStandardMaterial({ map: nt, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const p = add(new THREE.PlaneGeometry(0.76, 0.38), numMat, 0.08, 2.08, s * 1.29, -s * 0.26, s > 0 ? 0 : PI, 0);
    const st = add(new THREE.CircleGeometry(0.22, 24), vpaStarMat, -0.58, 2.1, s * 1.25, -s * 0.26, s > 0 ? 0 : PI, 0);
    p.castShadow = false; st.castShadow = false;
  }
  tagAll(g, ex);
  return g;
}

function buildMig(x, z, ry) {
  exhibitBase(x, z, 8.6, 10.8, MIG_EX, ry);
  const migUrl = (window.MODELS && window.MODELS.mig21) || "models/mig21.glb";

  loadGltfExhibit({
    url: migUrl,
    x, z, ry,
    targetLength: 8.6,
    rotationOffset: 0,
    yOffset: 0.1,
    ex: MIG_EX,
    fallback: () => buildProceduralMig(MIG_EX),
    onModel: (model) => {
      // Bổ sung phù hiệu Sao Vàng Không quân & số hiệu 5121 lên cánh và mũi
      const numC = textCanvas([{ text: "5121", size: 110, weight: 700, font: UI_FONT, color: "#da251d" }], 1.1, 0.42, { bg: "#d4dce4", border: false, ppm: 280 });
      const numMat = new THREE.MeshStandardMaterial({ map: canvasTex(numC), roughness: 0.3, metalness: 0.6 });
      for (const s of [-1, 1]) {
        const stW = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), vpaStarMat);
        stW.rotation.x = -H2; stW.position.set(s * 2.2, 1.85, -0.8);
        const plN = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.32), numMat);
        plN.position.set(s * 0.52, 1.95, 3.8); plN.rotation.y = s * (H2 - 0.06);
        model.add(stW, plN);
      }
    }
  });
}

function buildProceduralMig(ex) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0, ry0 = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz); m.rotation.set(rx, ry0, rz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };
  // Contoured MiG-21PFM/bis fuselage profile along +z (LatheGeometry rotated to +z)
  const fusePts = [
    [0.44, -5.2], [0.52, -4.6], [0.58, -3.2], [0.64, -1.2], [0.65, 1.2],
    [0.62, 3.2], [0.56, 4.8], [0.47, 5.95], [0.42, 6.0],
  ].map(([r, z0]) => new THREE.Vector2(r, z0));
  const fuseGeo = new THREE.LatheGeometry(fusePts, 28);
  fuseGeo.rotateX(H2);
  add(fuseGeo, MIL.duralumin, 0, 1.92, 0);

  // Red nose intake lip ring, dark air intake cavity, green conical radar shock-cone (RP-21 Sapfir) & pitot boom
  add(new THREE.TorusGeometry(0.44, 0.04, 10, 28), MIL.noseRed, 0, 1.92, 6.0);
  add(new THREE.CircleGeometry(0.43, 24), M.dark, 0, 1.92, 5.96);
  add(new THREE.ConeGeometry(0.27, 1.35, 22), MIL.radomeGreen, 0, 1.92, 6.28, H2, 0, 0);
  add(cyl(0.018, 0.028, 1.55, 8), MIL.steel, 0, 1.62, 6.65, H2, 0, 0); // nose pitot boom

  // Dorsal spine fairing running from cockpit canopy to vertical tail fin + ventral keel fin underneath
  const spinePts = new THREE.Shape();
  spinePts.moveTo(-4.6, 0); spinePts.lineTo(2.4, 0); spinePts.lineTo(1.8, 0.36); spinePts.lineTo(-4.2, 0.28); spinePts.lineTo(-4.6, 0);
  const spineGeo = new THREE.ExtrudeGeometry(spinePts, { depth: 0.34, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  spineGeo.rotateY(-H2);
  add(spineGeo, MIL.duralumin, 0.17, 2.42, 0);

  // Tail afterburner exhaust nozzle + glowing turbine core + ventral fin
  add(cyl(0.46, 0.41, 0.65, 24), MIL.gunmetal, 0, 1.92, -5.45, H2, 0, 0);
  add(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: 0x3a2210 }), 0, 1.92, -5.76, 0, PI, 0);
  add(bx(0.06, 0.42, 1.8), MIL.duralumin, 0, 1.25, -3.6, 0.12, 0, 0);

  // Cockpit interior (pilot ejection seat + HUD) & framed bubble glass canopy
  add(bx(0.38, 0.52, 0.42), MIL.gunmetal, 0, 2.35, 2.85, -0.2, 0, 0);
  add(bx(0.28, 0.18, 0.16), MIL. noseRed, 0, 2.66, 2.76); // ejection seat headrest
  const canopy = add(new THREE.SphereGeometry(0.44, 22, 14), MIL.canopyGlass, 0, 2.54, 3.25);
  canopy.scale.set(0.82, 0.76, 2.15);
  for (const cz of [2.55, 3.35, 4.0]) {
    const arch = add(new THREE.TorusGeometry(0.34, 0.022, 8, 18, PI), MIL.duralumin, 0, 2.48, cz);
    arch.scale.set(0.95, 0.85, 1);
  }

  // 57° swept Delta Wings + swept all-moving tailplanes + underwing K-13 (AA-2 Atoll) missiles
  const wing = new THREE.Shape();
  wing.moveTo(0, 1.75); wing.lineTo(3.75, -1.55); wing.lineTo(3.75, -2.35); wing.lineTo(0, -2.35); wing.lineTo(0, 1.75);
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  const tailPlaneGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.045, bevelEnabled: false });

  for (const s of [-1, 1]) {
    const w = add(wingGeo, MIL.duralumin, 0, 1.82, -0.15, -H2, 0, 0); w.scale.x = s;
    const st = add(tailPlaneGeo, MIL.duralumin, 0, 1.88, -4.35, -H2, 0, 0); st.scale.set(s * 0.46, 0.46, 1);
    // Underwing pylon + K-13 (AA-2 Atoll) infrared air-to-air missile
    const mx = s * 1.95, my = 1.48, mz = -0.75;
    add(bx(0.06, 0.26, 0.95), MIL.duralumin, mx, my + 0.18, mz);
    add(cyl(0.065, 0.065, 2.15, 12), MIL.missileWhite, mx, my, mz, H2, 0, 0);
    add(new THREE.SphereGeometry(0.065, 10, 8), MIL.gunmetal, mx, my, mz + 1.08);
    for (let f = 0; f < 4; f++) {
      const fa = f * H2 + PI / 4;
      add(bx(0.28, 0.015, 0.22), MIL.gunmetal, mx, my, mz + 0.72, 0, 0, fa);
      add(bx(0.42, 0.018, 0.38), MIL.missileWhite, mx, my, mz - 0.85, 0, 0, fa);
    }
  }
  // Centerline drop fuel tank (Thùng dầu phụ dưới bụng)
  add(cyl(0.22, 0.22, 2.8, 16), MIL.duralumin, 0, 1.12, 0.3, H2, 0, 0);
  add(new THREE.ConeGeometry(0.22, 0.75, 16), MIL.duralumin, 0, 1.12, 2.05, H2, 0, 0);
  add(new THREE.ConeGeometry(0.22, 0.85, 16), MIL.duralumin, 0, 1.12, -1.5, -H2, 0, 0);

  // Broad chord swept vertical tail fin + radio antenna fairing at tip
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(-2.75, 0); fin.lineTo(-3.65, 2.45); fin.lineTo(-2.55, 2.45); fin.lineTo(0, 0);
  const fm = add(new THREE.ExtrudeGeometry(fin, { depth: 0.09, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015 }), MIL.duralumin, -0.045, 2.42, -1.5, 0, -H2, 0);
  add(bx(0.11, 0.14, 1.15), MIL.radomeGreen, 0, 4.86, -4.55);

  // VPAF Red Star roundels on tail & wings + iconic red number "5121" on nose
  const numC = textCanvas([{ text: "5121", size: 110, weight: 700, font: UI_FONT, color: "#da251d" }], 1.1, 0.42, { bg: "#c8cfd6", border: false, ppm: 280 });
  const numMat = new THREE.MeshStandardMaterial({ map: canvasTex(numC), roughness: 0.3, metalness: 0.6 });
  for (const s of [-1, 1]) {
    add(new THREE.CircleGeometry(0.44, 24), vpaStarMat, s * 0.075, 3.65, -4.35, 0, s * H2, 0);
    add(new THREE.CircleGeometry(0.52, 24), vpaStarMat, s * 2.25, 1.9, -1.35, -H2, 0, 0);
    add(new THREE.PlaneGeometry(0.85, 0.32), numMat, s * 0.56, 1.95, 4.35, 0, s * (H2 - 0.06), 0);
  }
  // Tricycle landing gear with oleo struts, wheel hubs, and open gear doors
  for (const [gx, gz, r] of [[0, 4.35, 0.26], [-1.45, -0.85, 0.35], [1.45, -0.85, 0.35]]) {
    add(cyl(0.055, 0.065, 1.25, 10), MIL.steel, gx, 0.95, gz);
    add(bx(0.04, 0.55, 0.65), MIL.duralumin, gx + (gx === 0 ? 0.22 : Math.sign(gx) * 0.25), 1.15, gz);
    add(cyl(r, r, 0.22, 20), MIL.tyre, gx, r, gz, 0, 0, H2);
    add(cyl(r * 0.52, r * 0.52, 0.24, 14), MIL.radomeGreen, gx, r, gz, 0, 0, H2);
  }
  tagAll(g, ex);
  return g;
}

/* ---- more outdoor exhibits (high-detail historical military models) ---- */
const OUT_EX = {
  xe_tang_390: TANK_EX, mig21: MIG_EX,
  phao_cao_xa_37: { date: "1954", title: "Pháo cao xạ 37 mm",
    text: "Pháo cao xạ 37 mm lần đầu được bộ đội ta sử dụng trong chiến dịch Điện Biên Phủ, cùng các lực lượng phòng không khống chế bầu trời lòng chảo, hạn chế tiếp tế đường không của địch.",
    lesson: "Sự phát triển của lực lượng vũ trang dưới sự lãnh đạo của Đảng trong kháng chiến chống Pháp." },
  luu_phao_105: { date: "1/1954", title: "Lựu pháo 105 mm",
    text: "Bộ đội ta kéo lựu pháo 105 mm bằng sức người vượt núi cao, vào trận địa trên các sườn núi bao quanh lòng chảo Điện Biên Phủ.",
    lesson: "Phương châm “đánh chắc, tiến chắc” và tinh thần kháng chiến toàn dân." },
  sung_coi_120: { date: "1954", title: "Súng cối 120 mm",
    text: "Súng cối cùng lựu pháo tạo thành hỏa lực pháo binh chế áp các cứ điểm của tập đoàn cứ điểm Điện Biên Phủ.",
    lesson: "Sức mạnh tổng hợp của các binh chủng trong chiến dịch lớn." },
  xe_dap_tho: { date: "1954", title: "Xe đạp thồ",
    text: "Hơn 20.000 xe đạp thồ cùng hàng chục vạn dân công vận chuyển lương thực, đạn dược phục vụ chiến dịch Điện Biên Phủ.",
    lesson: "Đường lối kháng chiến toàn dân, dựa vào sức mình là chính." },
  pt76: { date: "6 – 7/2/1968", title: "Xe tăng PT-76",
    text: "Trận Làng Vây (Quảng Trị) là trận đầu tiên bộ đội xe tăng Việt Nam phối hợp với bộ binh tiến công, tiêu diệt cứ điểm Làng Vây.",
    lesson: "Sự trưởng thành của Quân đội nhân dân trong kháng chiến chống Mỹ." },
  xe_tai_truong_son: { date: "1959 – 1975", title: "Xe vận tải Trường Sơn",
    text: "Hàng vạn lượt xe vận tải chở vũ khí, lương thực trên tuyến đường Trường Sơn, chi viện cho chiến trường miền Nam.",
    lesson: "Miền Bắc là hậu phương lớn, miền Nam là tiền tuyến lớn." },
  sam2: { date: "18 – 29/12/1972", title: "Tên lửa phòng không SAM-2",
    text: "Trong 12 ngày đêm cuối năm 1972, bộ đội tên lửa phòng không dùng tên lửa SAM-2 là vũ khí chủ lực đánh trả cuộc tập kích chiến lược bằng B-52 của Mỹ.",
    lesson: "Chiến thắng “Hà Nội – Điện Biên Phủ trên không”." },
  xac_b52: { date: "27/12/1972", title: "Xác máy bay B-52",
    text: "Một chiếc B-52 bị bắn rơi xuống hồ Hữu Tiệp (Hà Nội) đêm 27/12/1972; phần xác máy bay vẫn còn nằm giữa hồ đến ngày nay.",
    lesson: "Ý chí độc lập, tự chủ và sức mạnh của chiến tranh nhân dân." },
  phao_130: { date: "1972 – 1975", title: "Pháo 130 mm",
    text: "Pháo 130 mm có tầm bắn xa, được sử dụng trong các chiến dịch lớn những năm 1972 – 1975, trong đó có Chiến dịch Hồ Chí Minh.",
    lesson: "Sức mạnh tổng hợp trong cuộc Tổng tiến công và nổi dậy mùa Xuân 1975." },
  f5e: { date: "8/4/1975", title: "Máy bay F-5E",
    text: "Ngày 8/4/1975, phi công Nguyễn Thành Trung lái máy bay F-5E ném bom Dinh Độc Lập, góp phần làm rung chuyển chính quyền Sài Gòn.",
    lesson: "Kết hợp đấu tranh quân sự với binh vận trong Tổng tiến công 1975." },
};
const olive = MIL.olive, oliveDark = MIL.oliveDark, steel = MIL.steel, tyre = MIL.tyre;
function grp(x, z, ry, key, baseW, baseD) {
  exhibitBase(x, z, baseW, baseD, OUT_EX[key], ry);
  const g = new THREE.Group(); g.position.set(x, 0.32, z); g.rotation.y = ry; scene.add(g);
  g.userData.key = key; return g;
}
function part(g, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m); return m;
}
const cyl = (r1, r2, h, s) => new THREE.CylinderGeometry(r1, r2, h, s || 16);
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function wheelPair(g, x, z, r, w, mat, rimMat) {
  for (const s of [-1, 1]) {
    part(g, cyl(r, r, w, 22), mat || MIL.tyre, x, r, s * z, H2, 0, 0);
    part(g, cyl(r * 0.56, r * 0.56, w + 0.03, 16), rimMat || MIL.oliveDark, x, r, s * z, H2, 0, 0);
    part(g, cyl(r * 0.2, r * 0.2, w + 0.06, 12), MIL.gunmetal, x, r, s * z, H2, 0, 0);
  }
}

function buildAA37(x, z, ry) {
  const g = grp(x, z, ry, "phao_cao_xa_37", 6.2, 6.2);
  // Cruciform outrigger carriage with leveling jacks
  for (let k = 0; k < 4; k++) {
    const a = k * H2 + PI / 4;
    part(g, bx(4.4, 0.16, 0.32), MIL.oliveDark, 0, 0.22, 0, 0, a, 0);
    const jx = Math.cos(a) * 2.0, jz = -Math.sin(a) * 2.0;
    part(g, cyl(0.18, 0.22, 0.08, 12), MIL.gunmetal, jx, 0.04, jz);
    part(g, cyl(0.05, 0.05, 0.38, 10), MIL.steel, jx, 0.24, jz);
  }
  part(g, cyl(0.88, 0.98, 0.42, 24), MIL.olive, 0, 0.48, 0);
  part(g, bx(1.25, 0.85, 1.05), MIL.olive, 0, 1.12, 0);
  // Angled armor shield with sighting ports
  part(g, bx(0.08, 1.15, 1.55), MIL.olive, 0.58, 1.65, 0, 0, 0, 0.28);
  // 37mm 61-K barrel, recoil cradle, flash suppressor cone & ammo clip tray
  const b = part(g, cyl(0.055, 0.08, 2.95, 16), MIL.gunmetal, 1.05, 2.35, 0, 0, 0, -0.75);
  part(g, cyl(0.09, 0.055, 0.26, 14), MIL.gunmetal, 2.18, 3.38, 0, 0, 0, -0.75); // conical flash hider
  part(g, cyl(0.14, 0.14, 0.85, 14), MIL.oliveDark, 0.32, 1.68, 0, 0, 0, -0.75);
  part(g, bx(0.35, 0.28, 0.24), MIL.steel, 0.18, 1.85, 0, 0, 0, -0.75);
  // Twin gunner seats, backrests & elevating/traversing handwheels
  for (const s of [-1, 1]) {
    part(g, bx(0.82, 0.55, 0.08), MIL.olive, 0.25, 1.65, s * 0.56);
    part(g, cyl(0.22, 0.22, 0.06, 14), MIL.oliveDark, -0.48, 1.42, s * 0.78);
    part(g, bx(0.06, 0.35, 0.32), MIL.oliveDark, -0.68, 1.62, s * 0.78);
    part(g, new THREE.TorusGeometry(0.16, 0.02, 8, 16), MIL.gunmetal, 0.08, 1.58, s * 0.68);
  }
  return b;
}

function buildFieldGun(x, z, ry, key, barrel, wheelR, shieldH) {
  const real = (window.REAL_MODELS || {})[key];
  const g = grp(x, z, ry, key, (real && real.baseW) || 3.6 + barrel * 0.9, (real && real.baseD) || 4.8);
  wheelPair(g, 0, 1.02, wheelR, 0.34);
  part(g, cyl(0.08, 0.08, 2.1, 12), MIL.gunmetal, 0, wheelR, 0, H2, 0, 0); // axle
  part(g, bx(0.75, 0.42, 1.55), MIL.oliveDark, 0, wheelR + 0.14, 0);
  // Split trails (2 càng pháo) with trail spades at the rear
  for (const s of [-1, 1]) {
    part(g, bx(3.35, 0.18, 0.2), MIL.olive, -1.75, 0.42, s * 0.52, 0, s * 0.26, 0.13);
    part(g, bx(0.45, 0.32, 0.48), MIL.oliveDark, -3.28, 0.18, s * 0.92, 0, s * 0.26, 0);
    part(g, new THREE.TorusGeometry(0.16, 0.02, 8, 16), MIL.gunmetal, -0.15, wheelR + 0.45, s * 0.65);
  }
  // Barrel, hydro-pneumatic recoil cylinder, breech block & muzzle brake (for 130mm M-46)
  part(g, cyl(0.11, 0.15, barrel, 18), MIL.oliveDark, barrel / 2 - 0.15, wheelR + 0.62, 0, 0, 0, -H2 + 0.12);
  part(g, cyl(0.09, 0.09, barrel * 0.48, 14), MIL.steel, 0.55, wheelR + 0.84, 0, 0, 0, -H2 + 0.12);
  part(g, bx(0.65, 0.36, 0.42), MIL.gunmetal, -0.45, wheelR + 0.5, 0, 0, 0, 0.12);
  if (barrel > 4) {
    // Pepperpot muzzle brake of 130mm M-46 artillery piece
    part(g, cyl(0.17, 0.16, 0.48, 16), MIL.gunmetal, barrel - 0.22, wheelR + 0.62 + (barrel - 0.22) * 0.12, 0, 0, 0, -H2 + 0.12);
  }
  if (shieldH) {
    part(g, bx(0.07, shieldH * 0.65, 1.98), MIL.olive, 0.28, wheelR + 0.42, 0);
    part(g, bx(0.07, shieldH * 0.52, 1.98), MIL.olive, 0.16, wheelR + 0.92, 0, 0, 0, 0.38);
  }
}

function buildMortar(x, z, ry) {
  const g = grp(x, z, ry, "sung_coi_120", 4.6, 4.6);
  // Heavy circular stamped steel baseplate (Bàn đế súng cối 120mm) with ribs
  part(g, cyl(0.62, 0.68, 0.1, 20), MIL.oliveDark, -0.58, 0.05, 0);
  for (let r = 0; r < 4; r++) part(g, bx(1.2, 0.14, 0.08), MIL.oliveDark, -0.58, 0.08, 0, 0, r * PI / 4, 0);
  // 120mm smoothbore mortar tube with shock absorber & bipod legs
  part(g, cyl(0.105, 0.115, 2.05, 18), MIL.gunmetal, 0.08, 0.96, 0, 0, 0, -0.65);
  part(g, cyl(0.13, 0.13, 0.18, 16), MIL.olive, 0.35, 1.32, 0, 0, 0, -0.65); // collar clamp
  for (const s of [-1, 1]) {
    part(g, cyl(0.032, 0.038, 1.38, 10), MIL.steel, 0.62, 0.64, s * 0.34, s * 0.36, 0, 0.18);
    part(g, cyl(0.09, 0.09, 0.04, 10), MIL.gunmetal, 0.72, 0.02, s * 0.56);
  }
  // Two-wheeled artillery limber/transport axle parked behind
  wheelPair(g, -1.65, 0.68, 0.42, 0.18);
  part(g, cyl(0.045, 0.045, 1.4, 10), MIL.oliveDark, -1.65, 0.42, 0, H2, 0, 0);
}

function buildBicycle(x, z, ry) {
  const g = grp(x, z, ry, "xe_dap_tho", 3.8, 2.8);
  const frame = MIL.oliveDark, bamboo = new THREE.MeshStandardMaterial({ color: 0xc8a44b, roughness: 0.55 });
  // Spoked bicycle wheels with hubs and fenders
  for (const wx of [-0.62, 0.62]) {
    part(g, new THREE.TorusGeometry(0.36, 0.032, 10, 28), MIL.tyre, wx, 0.38, 0);
    part(g, new THREE.TorusGeometry(0.33, 0.012, 8, 24), MIL.steel, wx, 0.38, 0);
    part(g, cyl(0.04, 0.04, 0.1, 10), MIL.steel, wx, 0.38, 0, H2, 0, 0);
    for (let sp = 0; sp < 8; sp++) part(g, cyl(0.005, 0.005, 0.66, 4), MIL.steel, wx, 0.38, 0, 0, 0, sp * PI / 8);
  }
  // Diamond bicycle frame, handlebars, leather saddle & rear rack
  part(g, cyl(0.022, 0.022, 1.15, 8), frame, 0, 0.68, 0, 0, 0, H2);
  part(g, cyl(0.022, 0.022, 0.68, 8), frame, -0.22, 0.52, 0, 0, 0, 0.58);
  part(g, cyl(0.022, 0.022, 0.65, 8), frame, 0.25, 0.52, 0, 0, 0, -0.62);
  part(g, cyl(0.022, 0.022, 0.76, 8), frame, 0.58, 0.68, 0, 0, 0, 0.22);
  part(g, cyl(0.018, 0.018, 0.58, 8), MIL.steel, 0.64, 1.02, 0, H2, 0, 0);
  part(g, bx(0.24, 0.06, 0.16), M.wood, -0.15, 0.78, 0); // saddle
  // Iconic Điện Biên Phủ bamboo steering pole ("tay ngai") & vertical bamboo brace ("cọc thồ")
  part(g, cyl(0.026, 0.028, 1.55, 8), bamboo, -0.15, 1.08, 0.18, 0, 0, -1.15);
  part(g, cyl(0.028, 0.03, 1.15, 8), bamboo, -0.15, 0.88, -0.16, 0, 0, 0.08);
  // Heavy burlap rice sacks (Bao gạo Điện Biên) tied on both sides and top with bamboo/rope bands
  for (const s of [-1, 1]) {
    const b1 = part(g, new THREE.SphereGeometry(0.32, 16, 12), MIL.burlap, -0.08, 0.78, s * 0.32); b1.scale.set(1.55, 0.85, 0.78);
    const b2 = part(g, new THREE.SphereGeometry(0.28, 14, 10), MIL.burlap, -0.08, 1.12, s * 0.28); b2.scale.set(1.45, 0.75, 0.72);
  }
  const top = part(g, new THREE.SphereGeometry(0.32, 16, 12), MIL.burlap, -0.08, 1.42, 0); top.scale.set(1.65, 0.72, 1.05);
  // Camouflage foliage branch on top of the rice load
  const cam = part(g, makeOrganicFoliageGeo(), MIL.olive, -0.08, 1.72, 0); cam.scale.set(0.35, 0.18, 0.32);
}

function buildPT76(x, z, ry) {
  const g = grp(x, z, ry, "pt76", 8.4, 5.2);
  // Boat-shaped amphibious hull with sloped bow, trim vane (tấm chắn sóng) & rear water-jet ports
  const hp = new THREE.Shape();
  hp.moveTo(-3.2, 0.15); hp.lineTo(2.4, 0.15); hp.lineTo(3.55, 0.72); hp.lineTo(2.35, 1.12);
  hp.lineTo(-3.1, 1.12); hp.lineTo(-3.35, 0.65); hp.lineTo(-3.2, 0.15);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hp, { depth: 2.6, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025 }), MIL.olive);
  hull.position.set(0, 0.42, -1.3); hull.castShadow = true; hull.receiveShadow = true; g.add(hull);
  part(g, bx(0.06, 0.32, 2.4), MIL.oliveDark, 3.15, 1.25, 0, 0, 0, -0.45); // bow trim vane

  for (const s of [-1, 1]) {
    const zt = s * 1.45;
    part(g, bx(6.4, 0.1, 0.46), MIL.track, 0, 1.02, zt);
    part(g, bx(5.8, 0.1, 0.46), MIL.track, 0, 0.24, zt);
    for (let k = 0; k < 6; k++) {
      const wx = -2.45 + k * 0.98;
      part(g, cyl(0.35, 0.35, 0.26, 18), MIL.tyre, wx, 0.56, zt, H2, 0, 0);
      part(g, cyl(0.25, 0.25, 0.28, 16), MIL.oliveDark, wx, 0.56, zt, H2, 0, 0);
    }
    part(g, cyl(0.18, 0.18, 0.08, 14), MIL.gunmetal, -3.28, 1.15, s * 0.75, 0, 0, H2); // waterjet ports
  }
  // Conical PT-76 turret + 76.2mm D-56T gun with double-baffle muzzle brake + VPA star
  part(g, cyl(0.84, 1.12, 0.62, 24), MIL.olive, 0.38, 1.82, 0);
  part(g, cyl(0.32, 0.34, 0.14, 16), MIL.oliveDark, 0.25, 2.18, 0);
  part(g, cyl(0.068, 0.085, 3.15, 16), MIL.oliveDark, 2.38, 1.86, 0, 0, 0, -H2);
  part(g, cyl(0.13, 0.13, 0.34, 16), MIL.gunmetal, 3.92, 1.86, 0, 0, 0, -H2); // muzzle brake
  for (const s of [-1, 1]) {
    part(g, new THREE.CircleGeometry(0.22, 24), vpaStarMat, 0.38, 1.84, s * 1.02, -s * 0.35, s > 0 ? 0 : PI, 0);
  }
}

function buildTruck(x, z, ry) {
  const ex = OUT_EX["xe_tai_truong_son"];
  exhibitBase(x, z, 9.2, 4.8, ex, ry);
  const real = (window.REAL_MODELS || {}).truck;
  if (real) {
    // ZIL-157: xe tải chủ lực trên đường Trường Sơn (mô hình Sketchfab, xem README)
    loadGltfExhibit({
      url: real.url, x, z, ry,
      targetLength: real.size, rotationOffset: real.rotY || 0, yOffset: 0.02,
      ex, fallback: () => buildProceduralTruck(ex),
    });
    return;
  }
  const truckUrl = (window.MODELS && window.MODELS.truck) || "models/truck.glb";

  loadGltfExhibit({
    url: truckUrl,
    x, z, ry,
    targetLength: 7.2,
    preRotate: { x: -H2 }, // truck.glb được xuất theo trục Z-up từ Blender
    rotationOffset: 0,
    yOffset: 0.05,
    ex: ex,
    fallback: () => buildProceduralTruck(ex),
    onModel: (model) => {
      // Đổi màu thân xe sang màu xanh bảo vệ quân sự Trường Sơn đặc trưng
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.name === "Default" || m.name === "AlternateColour" || m.name === "Mpdn_Logo") {
              m.color.setHex(0x3a4c28);
              m.roughness = 0.52;
              m.metalness = 0.22;
              if (m.emissive) m.emissive.setHex(0x000000);
            }
          });
        }
      });
      // Gắn phù hiệu Sao Vàng lên hai bên cửa xe
      for (const s of [-1, 1]) {
        const star = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), vpaStarMat);
        star.position.set(0.6, 1.45, s * 1.22);
        star.rotation.y = s > 0 ? 0 : PI;
        model.add(star);
      }
    }
  });
}

function buildProceduralTruck(ex) {
  const g = new THREE.Group();
  // ZIL-157 / Giải Phóng Trường Sơn 6x6 military transport truck
  part(g, bx(6.8, 0.22, 1.1), MIL.gunmetal, 0.2, 0.78, 0); // chassis frame
  // Rounded cab, engine hood with radiator louvers, front grille, bumper with winch
  part(g, bx(1.55, 1.25, 2.24), MIL.truckGreen, 2.15, 1.62, 0);
  part(g, cyl(1.1, 1.1, 1.52, 16, 1, false, 0, PI), MIL.truckGreen, 2.15, 2.18, 0, 0, 0, H2).scale.set(0.18, 1, 1.02);
  part(g, bx(1.35, 0.86, 1.62), MIL.truckGreen, 3.45, 1.42, 0); // tapered hood
  part(g, bx(0.08, 0.72, 1.38), MIL.gunmetal, 4.14, 1.42, 0); // radiator grille
  part(g, bx(0.28, 0.22, 2.38), MIL.gunmetal, 4.25, 0.88, 0); // heavy front bumper + winch
  // Split windshield + side windows + side mirrors + caged headlights ("đèn gầm Trường Sơn")
  part(g, bx(0.06, 0.48, 1.96), MIL.canopyGlass, 2.91, 1.94, 0);
  part(g, bx(0.95, 0.46, 2.28), MIL.canopyGlass, 2.15, 1.94, 0);
  part(g, bx(0.08, 0.5, 0.06), MIL.truckGreen, 2.93, 1.94, 0); // center windshield divider
  for (const s of [-1, 1]) {
    part(g, bx(0.95, 0.12, 0.42), MIL.oliveDark, 3.35, 1.12, s * 1.02); // front fenders
    part(g, bx(0.75, 0.08, 0.32), MIL.gunmetal, 2.15, 0.92, s * 1.18); // running step board
    part(g, cyl(0.12, 0.12, 0.14, 14), MIL.oliveDark, 4.08, 1.32, s * 0.88, 0, 0, H2);
    part(g, cyl(0.09, 0.09, 0.04, 14), MIL.headlight, 4.16, 1.32, s * 0.88, 0, 0, H2);
    part(g, new THREE.CircleGeometry(0.18, 20), vpaStarMat, 2.15, 1.45, s * 1.13, 0, s > 0 ? 0 : PI, 0);
  }
  // Wooden slatted cargo bed + ribbed canvas tarpaulin cover (mui bạt) + supply crates inside
  part(g, bx(4.35, 0.62, 2.42), MIL.truckGreen, -0.92, 1.24, 0);
  for (let r = -2.8; r <= 1.0; r += 0.76) part(g, bx(0.08, 0.68, 2.48), MIL.oliveDark, r, 1.26, 0);
  const cover = part(g, new THREE.CylinderGeometry(1.21, 1.21, 4.32, 22, 1, false, 0, PI), MIL.canvas, -0.92, 1.54, 0);
  cover.rotation.set(H2, 0, H2);
  for (let r = -2.9; r <= 1.1; r += 0.8) {
    const rib = part(g, new THREE.TorusGeometry(1.22, 0.022, 6, 18, PI), MIL.oliveDark, r, 1.54, 0);
    rib.rotation.y = H2;
  }
  // 6x6 heavy off-road wheels (front + tandem rear axles)
  for (const wx of [3.35, -0.45, -1.78]) wheelPair(g, wx, 1.06, 0.56, 0.36);

  // Authentic Trường Sơn leafy camouflage branches draped over the canvas roof and hood
  const camGeo = makeOrganicFoliageGeo();
  const camMat1 = new THREE.MeshStandardMaterial({ color: 0x2e6424, roughness: 0.7 });
  const camMat2 = new THREE.MeshStandardMaterial({ color: 0x3f7b31, roughness: 0.65 });
  for (let k = 0; k < 14; k++) {
    const isHood = k < 3;
    const lx = isHood ? 3.2 + (k - 1) * 0.35 : -2.6 + (k - 3) * 0.34;
    const ly = isHood ? 1.92 : 2.74 + (k % 2) * 0.08;
    const lz = (rand() - 0.5) * (isHood ? 0.9 : 1.5);
    const l = part(g, camGeo, k % 2 ? camMat1 : camMat2, lx, ly, lz, 0, rand() * PI, 0);
    l.scale.set(0.38 + rand() * 0.15, 0.18 + rand() * 0.08, 0.35 + rand() * 0.15);
  }
  tagAll(g, ex);
  return g;
}

function buildSam2(x, z, ry) {
  const g = grp(x, z, ry, "sam2", 11.2, 5.8);
  // SM-90 Launcher rotating pedestal, azimuth ring, 4 outrigger beams & blast deflector shield
  part(g, cyl(1.38, 1.58, 0.45, 24), MIL.olive, 0, 0.24, 0);
  part(g, cyl(0.95, 1.05, 0.35, 20), MIL.oliveDark, 0, 0.62, 0);
  for (let k = 0; k < 4; k++) {
    const a = k * H2 + PI / 4;
    part(g, bx(4.8, 0.22, 0.38), MIL.oliveDark, 0, 0.16, 0, 0, a, 0);
    part(g, cyl(0.22, 0.26, 0.12, 12), MIL.gunmetal, Math.cos(a) * 2.25, 0.06, -Math.sin(a) * 2.25);
  }
  part(g, bx(1.45, 1.15, 1.15), MIL.olive, 0, 1.15, 0);
  part(g, bx(0.12, 1.35, 1.8), MIL.oliveDark, -1.35, 1.15, 0, 0, 0, -0.45); // rear blast shield

  // Elevating launch beam + V-750 (S-75 Dvina / SAM-2) Two-Stage Surface-to-Air Missile
  const rail = new THREE.Group(); rail.position.set(0, 1.72, 0); rail.rotation.z = 0.54; g.add(rail);
  part(rail, bx(7.8, 0.24, 0.36), MIL.oliveDark, 1.2, 0, 0);
  part(rail, bx(7.4, 0.12, 0.52), MIL.gunmetal, 1.2, 0.16, 0);

  // Stage 2 (Upper Sustainer): silver-white body, nose cone, fuse probe, mid-body delta wings & nose fins
  part(rail, cyl(0.25, 0.25, 6.4, 24), MIL.missileWhite, 2.25, 0.58, 0, 0, 0, -H2);
  part(rail, cyl(0.255, 0.255, 0.35, 24), MIL.noseRed, 4.6, 0.58, 0, 0, 0, -H2); // red warning band
  part(rail, new THREE.ConeGeometry(0.25, 1.35, 24), MIL.missileWhite, 6.12, 0.58, 0, 0, 0, -H2);
  part(rail, cyl(0.015, 0.025, 0.65, 8), MIL.steel, 7.05, 0.58, 0, 0, 0, -H2); // nose radio fuse probe

  // Stage 1 (Solid-Fuel Booster): olive-drab thicker cylinder, interstage adapter & flared nozzle
  part(rail, cyl(0.25, 0.34, 0.45, 20), MIL.gunmetal, -0.75, 0.58, 0, 0, 0, -H2);
  part(rail, cyl(0.34, 0.34, 2.85, 24), MIL.olive, -2.35, 0.58, 0, 0, 0, -H2);
  part(rail, cyl(0.28, 0.36, 0.42, 20), MIL.gunmetal, -3.95, 0.58, 0, 0, 0, -H2);

  // Cruciform fins: 4 large booster fins, 4 mid-body sustainer wings, 4 nose guidance canards
  for (let k = 0; k < 4; k++) {
    const a = k * H2 + PI / 4, sa = Math.sin(a), ca = Math.cos(a);
    const f1 = part(rail, bx(1.15, 0.035, 1.45), MIL.oliveDark, -2.95, 0.58 + sa * 0.68, ca * 0.68); f1.rotation.x = a;
    const f2 = part(rail, bx(1.35, 0.03, 1.05), MIL.missileWhite, 1.85, 0.58 + sa * 0.52, ca * 0.52); f2.rotation.x = a;
    const f3 = part(rail, bx(0.38, 0.022, 0.48), MIL.gunmetal, 5.2, 0.58 + sa * 0.32, ca * 0.32); f3.rotation.x = a;
  }
}

function buildB52Wreck(x, z, ry) {
  const g = grp(x, z, ry, "xac_b52", 8.4, 8.4);
  // Shallow dark reflective water pool on the plinth (evoking Hồ Hữu Tiệp in Ngọc Hà, Hà Nội)
  const pool = part(g, cyl(3.6, 3.6, 0.04, 36), new THREE.MeshPhysicalMaterial({
    color: 0x1d3b42, roughness: 0.08, metalness: 0.2, clearcoat: 1.0, transparent: true, opacity: 0.85,
  }), 0, 0.03, 0);
  pool.receiveShadow = true;

  // Torn, scorched B-52G Stratofortress fuselage section with exposed internal structural bulkhead rings
  part(g, new THREE.CylinderGeometry(1.22, 1.28, 4.6, 22, 1, true, 0, PI * 1.65), MIL.scorched, 0, 1.08, 0, 0.08, 0, H2 - 0.12);
  for (const rx of [-1.8, -0.6, 0.6, 1.8]) {
    part(g, new THREE.TorusGeometry(1.18, 0.045, 8, 20), MIL.rust, rx, 1.08 - rx * 0.1, 0, 0, H2, 0);
  }
  // Tall swept B-52 vertical tail fin with torn rudder and tactical tail stripe
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(-3.3, 0); fin.lineTo(-4.5, 4.9); fin.lineTo(-2.5, 5.1); fin.lineTo(0, 0);
  part(g, new THREE.ExtrudeGeometry(fin, { depth: 0.2, bevelEnabled: false }), MIL.scorched, 1.65, 1.75, -0.1, 0.06, 0, 0.14);

  // Twin Pratt & Whitney JT3D turbofan engine nacelles on a twisted wing pylon
  for (const ez of [-0.55, 0.55]) {
    part(g, cyl(0.42, 0.36, 2.2, 18), MIL.scorched, -1.65, 0.58, 2.15 + ez, 0.2, 0.35, H2 - 0.18);
    part(g, cyl(0.38, 0.38, 0.1, 16), MIL.rust, -0.65, 0.72, 2.5 + ez, 0.2, 0.35, H2 - 0.18);
  }
  part(g, bx(3.6, 0.14, 1.55), MIL.scorched, -2.2, 0.38, 1.9, 0.28, 0.42, 0.12);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2 + 0.3, r = 1.6 + (k % 3) * 0.75;
    part(g, bx(0.55 + (k % 3) * 0.45, 0.08, 0.38 + (k % 2) * 0.4), k % 2 ? MIL.scorched : MIL.rust, Math.cos(a) * r, 0.1, Math.sin(a) * r, 0.1, a, (k % 3 - 1) * 0.22);
  }
}

function buildF5E(x, z, ry) {
  const ex = OUT_EX["f5e"];
  exhibitBase(x, z, 7.6, 10.6, ex, ry);
  const f5eUrl = (window.MODELS && window.MODELS.f5e) || "models/f5e.glb";

  loadGltfExhibit({
    url: f5eUrl,
    x, z, ry,
    targetLength: 8.8,
    rotationOffset: 0,
    yOffset: 0.12,
    ex: ex,
    fallback: () => buildProceduralF5E(ex),
    onModel: (model) => {
      // Bổ sung phù hiệu sao vàng Không quân nhân dân Việt Nam
      for (const s of [-1, 1]) {
        const star = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), vpaStarMat);
        star.rotation.x = -H2;
        star.position.set(s * 1.9, 1.35, -0.6);
        model.add(star);
      }
    }
  });
}

function buildProceduralF5E(ex) {
  const g = new THREE.Group();
  // Contoured F-5E Tiger II "wasp-waist" area-ruled fuselage along +z
  const fusePts = [
    [0.46, -4.4], [0.54, -2.8], [0.48, -0.8], [0.56, 1.4],
    [0.52, 3.2], [0.38, 4.6], [0.18, 5.8], [0.02, 6.4],
  ].map(([r, z0]) => new THREE.Vector2(r, z0));
  const fuseGeo = new THREE.LatheGeometry(fusePts, 24);
  fuseGeo.rotateX(H2);
  const fuse = part(g, fuseGeo, MIL.camoGreen, 0, 1.62, 0);
  fuse.scale.set(1.08, 0.88, 1); // flattened shark-nose cross section

  // Black radar nose tip + pitot probe + cockpit interior & framed bubble canopy
  part(g, new THREE.ConeGeometry(0.22, 0.95, 18), MIL.gunmetal, 0, 1.6, 6.15, H2, 0, 0);
  part(g, cyl(0.015, 0.022, 0.85, 8), MIL.steel, 0, 1.6, 6.85, H2, 0, 0);
  part(g, bx(0.34, 0.48, 0.4), MIL.gunmetal, 0, 1.98, 2.65, -0.2, 0, 0);
  const can = part(g, new THREE.SphereGeometry(0.4, 20, 12), MIL.canopyGlass, 0, 2.08, 2.95);
  can.scale.set(0.82, 0.72, 2.25);

  // Twin side air intakes, LERX, tapered wings with AIM-9 Sidewinder rails, and twin J85 exhaust nozzles
  const wing = new THREE.Shape();
  wing.moveTo(0, 1.35); wing.lineTo(3.45, -0.55); wing.lineTo(3.45, -1.28); wing.lineTo(0, -1.65); wing.lineTo(0, 1.35);
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.06, bevelEnabled: false });

  for (const s of [-1, 1]) {
    part(g, bx(0.42, 0.52, 1.85), MIL.camoTan, s * 0.62, 1.56, 1.65); // side intakes
    part(g, bx(0.36, 0.44, 0.06), M.dark, s * 0.64, 1.56, 2.56);
    const w = part(g, wingGeo, MIL.camoTan, 0, 1.52, -0.55, -H2, 0, 0); w.scale.x = s;
    const st = part(g, wingGeo, MIL.camoGreen, 0, 1.56, -3.85, -H2, 0, 0); st.scale.set(s * 0.48, 0.48, 1);
    // Wingtip missile launch rail + AIM-9 Sidewinder missile
    part(g, bx(0.08, 0.1, 1.65), MIL.camoGreen, s * 3.48, 1.55, -1.45);
    part(g, cyl(0.045, 0.045, 1.85, 10), MIL.missileWhite, s * 3.54, 1.55, -1.35, H2, 0, 0);
    // Twin J85 afterburner exhaust nozzles at tail
    part(g, cyl(0.22, 0.2, 0.55, 18), MIL.gunmetal, s * 0.25, 1.62, -4.55, H2, 0, 0);
    part(g, new THREE.CircleGeometry(0.42, 24), vpaStarMat, s * 2.1, 1.59, -1.45, -H2, 0, 0);
  }
  // Tall swept F-5E vertical tail fin + VPAF star insignia
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(-2.35, 0); fin.lineTo(-3.05, 2.15); fin.lineTo(-2.15, 2.15); fin.lineTo(0, 0);
  part(g, new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false }), MIL.camoGreen, -0.04, 1.98, -1.75, 0, -H2, 0);
  for (const s of [-1, 1]) part(g, new THREE.CircleGeometry(0.36, 24), vpaStarMat, s * 0.06, 3.15, -3.85, 0, s * H2, 0);

  // Centerline bomb / drop tank + tricycle landing gear
  part(g, cyl(0.18, 0.18, 2.2, 14), MIL.oliveDark, 0, 0.98, -0.2, H2, 0, 0);
  for (const [gx, gz, r] of [[0, 3.85, 0.24], [-1.18, -0.92, 0.3], [1.18, -0.92, 0.3]]) {
    part(g, cyl(0.05, 0.055, 1.05, 10), MIL.steel, gx, 0.82, gz);
    part(g, cyl(r, r, 0.18, 18), MIL.tyre, gx, r, gz, 0, 0, H2);
    part(g, cyl(r * 0.5, r * 0.5, 0.2, 12), MIL.steel, gx, r, gz, 0, 0, H2);
  }
  tagAll(g, ex);
  return g;
}

/* ---- signs with a real photo (photos + verified texts from images/hien_vat/credits.json) ---- */
const photoSigns = [];
function drawSign(sign, img) {
  const ex = sign.ex || OUT_EX[sign.key], c = sign.canvas, g = c.getContext("2d");
  const W = c.width, H = c.height;
  g.fillStyle = "#1c1511"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(201,162,74,0.9)"; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
  const ph = H * 0.56, pw = W - 48;
  if (img) {
    const s = Math.max(pw / img.width, ph / img.height), sw = pw / s, sh = ph / s;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 24, 24, pw, ph);
  } else { g.fillStyle = "#2a201a"; g.fillRect(24, 24, pw, ph); g.fillStyle = "#b9ab94"; g.font = `500 26px ${UI_FONT}`; g.textAlign = "center"; g.fillText("Ảnh tư liệu", W / 2, 24 + ph / 2); }
  g.textAlign = "left"; g.textBaseline = "top";
  let y = ph + 44;
  g.fillStyle = GOLD_TXT; g.font = `600 30px ${UI_FONT}`; g.fillText((sign.n ? "Điểm " + sign.n + " · " : "") + ex.date, 28, y); y += 44;
  g.fillStyle = "#f3ead8"; g.font = `700 44px ${SERIF}`;
  for (const l of wrapLines(g, ex.title, W - 56)) { g.fillText(l, 28, y); y += 54; }
  if (ex.credit) { g.fillStyle = "#9c8f7a"; g.font = `400 18px ${UI_FONT}`; for (const l of wrapLines(g, "Ảnh: " + ex.credit, W - 56).slice(0, 2)) { g.fillText(l, 28, H - 58 + (y > H - 60 ? 0 : 0)); break; } }
  if (y > H - 62) textIssue("biển ảnh: tên đè lên dòng nguồn ảnh", ex.title);
  sign.tex.needsUpdate = true;
}
function photoSign(key, x, z, ry, n) {
  const c = document.createElement("canvas"); c.width = 600; c.height = 760;
  const tex = canvasTex(c);
  const g = new THREE.Group(); placeAt(g, x, 0, z, ry);
  for (const s of [-1, 1]) part(g, cyl(0.04, 0.04, 1.2, 8), M.dark, s * 0.6, 0.6, -0.02);
  const board = part(g, new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ map: tex }), 0, 2.05, 0);
  const backB = part(g, bx(1.56, 1.96, 0.04), M.dark, 0, 2.05, -0.03);
  board.userData.ex = OUT_EX[key]; backB.userData.ex = OUT_EX[key]; interactive.push(board, backB);
  CIRCLES.push([x, z, 0.5]);
  const sign = { key, canvas: c, tex, n }; photoSigns.push(sign); drawSign(sign, null);
}
async function loadExhibitCredits() {
  let list = [];
  try { const r = await fetch("images/hien_vat/credits.json", { cache: "no-store" }); if (r.ok) list = await r.json(); } catch (e) {}
  for (const it of Array.isArray(list) ? list : []) {
    const ex = OUT_EX[it.key]; if (!ex) continue;
    for (const f of ["date", "title", "text", "lesson", "credit"]) if (typeof it[f] === "string" && it[f].trim()) ex[f] = it[f].trim();
    if (it.file) ex.photo = "images/hien_vat/" + it.file;
  }
  for (const s of photoSigns) {
    const ex = OUT_EX[s.key];
    if (!ex.photo) { drawSign(s, null); continue; }
    const im = await loadImg(ex.photo); drawSign(s, im);
  }
}

// Tour order: left walkway goes away from the building (1954 → 1968), the far cross path, then the right walkway comes back (1972 → 30/4/1975).
const EXHIBIT_Z = [15, 23, 31, 39, 47, 55];
function buildVehicles() {
  const L = -22.5, R = 22.5, Z = EXHIBIT_Z;
  const signL = (key, z, n) => photoSign(key, -15.4, z + 2.3, H2, n);
  const signR = (key, z, n) => photoSign(key, 15.4, z - 2.3, -H2, n);
  buildAA37(L, Z[0], 0);                                       signL("phao_cao_xa_37", Z[0], 1);
  buildFieldGun(L, Z[1], 0, "luu_phao_105", 2.6, 0.55, 1.1);   signL("luu_phao_105", Z[1], 2);
  buildMortar(L, Z[2], 0);                                     signL("sung_coi_120", Z[2], 3);
  buildBicycle(L, Z[3], 0);                                    signL("xe_dap_tho", Z[3], 4);
  buildTruck(L, Z[4], 0);                                      signL("xe_tai_truong_son", Z[4], 5);
  buildPT76(L, Z[5], 0);                                       signL("pt76", Z[5], 6);
  buildSam2(R, Z[5], PI);                                      signR("sam2", Z[5], 7);
  buildMig(R, Z[4], -H2);                                      signR("mig21", Z[4], 8);
  buildB52Wreck(R, Z[3], 0.3);                                 signR("xac_b52", Z[3], 9);
  buildF5E(R, Z[2], -H2);                                      signR("f5e", Z[2], 10);
  buildFieldGun(R, Z[1], PI, "phao_130", 5.2, 0.6, 1.2);       signR("phao_130", Z[1], 11);
  buildTank(R, Z[0], PI);                                      signR("xe_tang_390", Z[0], 12);
  // Mô hình 3D thật từ Sketchfab (xem README, mục Nguồn mô hình). Kích thước tính theo mét ngoài đời.
  const RM = window.REAL_MODELS || {};
  if (RM.pt76) upgradeExhibit("pt76", RM.pt76.url, RM.pt76.size, RM.pt76);
  if (RM.sam2) upgradeExhibit("sam2", RM.sam2.url, RM.sam2.size, RM.sam2);
  if (RM.luu_phao_105) upgradeExhibit("luu_phao_105", RM.luu_phao_105.url, RM.luu_phao_105.size, RM.luu_phao_105);
  if (RM.sung_coi_120) upgradeExhibit("sung_coi_120", RM.sung_coi_120.url, RM.sung_coi_120.size, RM.sung_coi_120);
  // Ba hiện vật tự dựng trong Blender theo ảnh tư liệu (E:\Blender\hien_vat\hien_vat_ngoai_troi.blend)
  for (const k of ["phao_cao_xa_37", "phao_130", "xac_b52", "xe_dap_tho"]) if (RM[k]) upgradeExhibit(k, RM[k].url, RM[k].size, RM[k]);
  buildBenches();
  loadExhibitCredits();
}

// Ghế công viên dọc hai lối đi bên, đặt giữa các hiện vật, quay mặt vào lối đi.
/* ================= chỗ ngồi (ghế đá, ghế gỗ, ngựa đu quay, xích đu, bập bênh) ================= */
// Mỗi chỗ ngồi là một "mỏ neo" Object3D đặt đúng mặt ghế, trục -z của nó là hướng mặt người ngồi.
// Mỏ neo gắn vào chính vật chuyển động (ngựa gỗ, ván xích đu…) nên người ngồi tự đi theo.
const SEATS = [];
function addSeat(parent, x, y, z, ry, label, icon) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o);
  SEATS.push({ o, label, icon: icon || "chair" }); return o;
}
const _sv = new THREE.Vector3(), _sd = new THREE.Vector3();
function seatPose(seat) { seat.o.getWorldPosition(_sv); seat.o.getWorldDirection(_sd); return { x: _sv.x, y: _sv.y, z: _sv.z, yaw: Math.atan2(_sd.x, _sd.z) }; }
function seatTaken(p) { for (const [, a] of avatars) if (a.sit && Math.hypot(a.x - p.x, a.z - p.z) < 0.5) return true; return false; }
function sendSit(on) { Net.update({ emote: on ? "sit" : "stand", emoteAt: Date.now() }); }
function sitDown(seat) {
  if (follow) stopFollow();
  player.back = [player.x, player.z]; player.seat = seat; player.seatYaw = seatPose(seat).yaw; sendSit(true);
}
function standUp() {
  if (!player.seat) return;
  const p = seatPose(player.seat); player.seat = null;
  let spot = player.back && free(player.back[0], player.back[1]) ? player.back : null;
  for (let r = 0.9; !spot && r < 4; r += 0.5) for (let k = 0; k < 12 && !spot; k++) { const a = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) / 12 * PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (free(x, z) && groundAt(x, z) < 0.05) spot = [x, z]; } // ưu tiên phía trước mặt ghế
  if (spot) { player.x = spot[0]; player.z = spot[1]; }
  player.jy = groundAt(player.x, player.z); player.vy = 0; player.grounded = true; sendSit(false);
}
function seatPrompt() {
  if (player.seat) { const act = () => standUp(); act.label = "Đứng dậy"; act.icon = "directions_walk"; act.quiet = true; return act; }
  if (levelOf() || !player.grounded || player.jy > 0.3) return null;
  let best = null, bd = 1.9;
  for (const seat of SEATS) { const p = seatPose(seat), d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd && !seatTaken(p)) { bd = d; best = seat; } }
  if (!best) return null;
  const act = () => sitDown(best); act.label = best.label; act.icon = best.icon; act.quiet = true; return act;
}

function buildBenches() {
  const cfg = (window.REAL_MODELS || {}).bench;
  if (!cfg) return;
  loadGlbOnce(cfg.url).then((src) => {
    const proto = fitModel(src.clone(true), cfg.size, cfg);
    const zs = [];
    for (let i = 0; i < EXHIBIT_Z.length - 1; i++) zs.push((EXHIBIT_Z[i] + EXHIBIT_Z[i + 1]) / 2);
    for (const z of zs) for (const s of [-1, 1]) {
      const b = proto.clone(true);
      b.position.set(s * 15.1, 0, z);
      b.rotation.y = s > 0 ? -H2 : H2; // mặt ghế hướng về lối đi
      scene.add(b);
      CIRCLES.push([s * 15.1, z, 0.75]);
      for (const dz of [-0.42, 0.42]) addSeat(scene, s * 15.1, 0.46, z + dz, s * H2, "Ngồi ghế đá");
    }
  }).catch(() => {});
}

/* ================= interior ================= */
function makeLightCone(rTop, rBot, h, opacity = 0.085) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe6b0, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}
function buildHall() {
  const mTex = canvasTex(marbleCanvas(), [12, 12]);
  slab(-12, 12, -24, 0, 0.01, new THREE.MeshStandardMaterial({
    map: mTex, bumpMap: mTex, bumpScale: 0.008, roughness: 0.22, metalness: 0.08,
  }));
  slab(-12, 12, -24, 0, 8, M.ceiling, false);
  for (const [x, z] of [[0, -4], [0, -12], [0, -20]]) {
    const l = new THREE.PointLight(0xffd6a0, 0.65, 22, 1.5); l.position.set(x, 6.2, z); scene.add(l);
  }
  decorateHall();
  // skirting
  box(0.06, 0.2, 24, -11.77, 0.1, -12, M.gold); box(0.06, 0.2, 24, 11.77, 0.1, -12, M.gold); box(24, 0.2, 0.06, 0, 0.1, -23.77, M.gold);

  // centerpiece: gold star on a plinth + volumetric spotlight cone
  const cp = DATA.hall.centerpiece;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 1.1, 32), M.wood);
  plinth.position.set(0, 0.55, -12); plinth.castShadow = true; plinth.receiveShadow = true; scene.add(plinth);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 32), M.gold); rim.position.set(0, 1.12, -12); scene.add(rim);
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? 0.42 : 1; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sg = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }); sg.center();
  const star = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xffcf38, roughness: 0.16, metalness: 0.92, emissive: 0x3a2500 }));
  star.position.set(0, 2.7, -12); star.castShadow = true; scene.add(star); spinners.push({ obj: star, speed: 0.5 });
  const cone = makeLightCone(0.35, 1.85, 5.2, 0.075); cone.position.set(0, 3.8, -12); scene.add(cone);
  const pl = textPlane([{ text: cp.date, size: 40, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 6 }, { text: cp.title, size: 50, weight: 700 }], 1.9, 0.5, { ppm: 300 });
  placeAt(pl, 0, 0.62, -10.62, 0);
  [plinth, star, pl].forEach((m) => { m.userData.ex = cp; interactive.push(m); });
  CIRCLES.push([0, -12, 1.7]);

  // portrait of President Hồ Chí Minh in the middle of the back wall, facing the entrance, with the two flags
  const back = { x: 0, z: -23.8, ry: 0 };
  buildPortraitWall(back);
  // the big title hangs under the ceiling above the mezzanine edge, facing the hall, so it greets people on the way out
  // (the wall behind the mezzanine is kept free for the 1939 – 1945 photos, see MUSEUM.corridor)
  box(4.4, 0.92, 0.08, 0, 7.52, -3.42, M.dark);
  placeAt(textPlane([
    { text: "LỊCH SỬ ĐẢNG CỘNG SẢN VIỆT NAM", size: 44, weight: 700, color: GOLD_TXT, gap: 10 },
    { text: "1930 – nay", size: 34, font: UI_FONT, color: "#f3ead8" },
  ], 4.3, 0.85, { bg: "#6e1414", ppm: 230, pad: 0.05 }), 0, 7.52, -3.47, PI);
  onWall(textPlane([
    { text: "“Không có gì quý hơn độc lập, tự do.”", size: 64, weight: 700, gap: 18 },
    { text: "Hồ Chí Minh, 1966", size: 40, font: UI_FONT, color: GOLD_TXT },
  ], 4.2, 1.8, { ppm: 200 }), back, -7, 2.6);
  onWall(textPlane([
    { text: "“Đảng ta là đạo đức, là văn minh.”", size: 64, weight: 700, gap: 18 },
    { text: "Hồ Chí Minh, 1960", size: 40, font: UI_FONT, color: GOLD_TXT },
  ], 4.2, 1.8, { ppm: 200 }), back, 7, 2.6);

  // map + welcome on the inside of the facade
  const front = { x: 0, z: -0.2, ry: PI };
  const mapLines = [{ text: "SƠ ĐỒ THAM QUAN", size: 40, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 16 }];
  DATA.rooms.forEach((r, i) => mapLines.push({ text: `Phòng ${r.num} (${["bên trái, phía trước", "bên trái, phía sau", "cuối sảnh", "bên phải, phía sau", "bên phải, phía trước"][i]}): ${r.period}`, size: 30, font: UI_FONT, align: "left", gap: 6 }));
  onWall(textPlane(mapLines, 3.8, 2.4, { ppm: 220 }), front, 7, 2.6);
  onWall(textPlane([
    { text: "Chào mừng đến Bảo tàng số", size: 40, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 10 },
    { text: "Sảnh chính trưng bày giai đoạn 1930 – 1945: Đảng ra đời và lãnh đạo Cách mạng Tháng Tám. Đi theo chiều kim đồng hồ để xem theo thứ tự thời gian.", size: 34, align: "left" },
  ], 3.8, 2.4, { ppm: 220 }), front, -7, 2.6);

  // 1930–1945 panels on the side walls
  const spots = [[-11.8, -2.4, H2], [-11.8, -12, H2], [-11.8, -21.6, H2], [11.8, -21.6, -H2], [11.8, -12, -H2], [11.8, -2.4, -H2]];
  DATA.hall.panels.forEach((p, i) => {
    const [x, z, ry] = spots[i];
    const m = infoPanel(p, 2.7, 2.1);
    onWall(m, { x, z, ry }, 0, 2.5);
    m.userData.ex = p; interactive.push(m);
  });

  // door signs
  DATA.rooms.forEach((r, i) => {
    const g = ROOM_GEO[i];
    onWall(textPlane([
      { text: `PHÒNG ${r.num} · ${r.period}`, size: 42, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 8 },
      { text: r.name, size: 54, weight: 700 },
    ], i === 2 ? 3.6 : 4.2, i === 2 ? 0.6 : 1.05, { bg: "#" + r.color.toString(16).padStart(6, "0"), ppm: 200 }), g.sign, 0, i === 2 ? 3.68 : 4.3);
  });
}

const PORTRAIT_EX = {
  date: "19/5/1890 – 2/9/1969", title: "Chủ tịch Hồ Chí Minh",
  text: "Lãnh tụ của cách mạng Việt Nam, người sáng lập Đảng Cộng sản Việt Nam (3/2/1930) và khai sinh nước Việt Nam Dân chủ Cộng hòa (2/9/1945). Ảnh chân dung chụp khoảng năm 1946.",
  lesson: "Nguyễn Ái Quốc – Hồ Chí Minh tìm ra con đường cứu nước theo chủ nghĩa Mác – Lênin và trực tiếp chuẩn bị về tư tưởng, chính trị, tổ chức cho sự ra đời của Đảng.",
  credit: "Không rõ tác giả – Public domain – Wikimedia Commons",
  photo: "images/sanh/bac_ho_1946.jpg",
};
function vnFlagCanvas() {
  const c = document.createElement("canvas"); c.width = 960; c.height = 640; const g = c.getContext("2d");
  g.fillStyle = "#da251d"; g.fillRect(0, 0, 960, 640);
  starPath(g, 480, 330, 192, 74); g.fillStyle = "#ffff00"; g.fill(); // star: 3/5 of the flag height across
  return c;
}
function buildPortraitWall(wall) {
  const cy = 5.88, fw = 3.0, fh = 3.85;
  // gold frame, dark red mat, photo, name band
  onWall(new THREE.Mesh(bx(fw, fh, 0.1), DECO.gold), wall, 0, cy, 0.05);
  onWall(new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.2, fh - 0.2), lam(0x4a0e0e)), wall, 0, cy, 0.105);
  const pw = 2.3, ph = pw / 0.711;
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  onWall(photo, wall, 0, cy + 0.2, 0.11);
  loadImg(PORTRAIT_EX.photo).then((im) => { if (!im) return; const t = new THREE.Texture(im); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; photo.material.map = t; photo.material.needsUpdate = true; });
  const band = textPlane([{ text: "CHỦ TỊCH HỒ CHÍ MINH", size: 54, weight: 700, color: GOLD_TXT, gap: 4 }, { text: "1890 – 1969", size: 32, font: UI_FONT, color: "#e8dcc4" }], 2.6, 0.38, { bg: "#4a0e0e", border: false, ppm: 260 });
  onWall(band, wall, 0, cy - fh / 2 + 0.3, 0.112);
  // light bar above the frame and a warm spotlight
  onWall(new THREE.Mesh(bx(1.4, 0.08, 0.3), DECO.gold), wall, 0, cy + fh / 2 + 0.22, 0.2);
  onWall(new THREE.Mesh(bx(1.3, 0.03, 0.22), DECO.glow), wall, 0, cy + fh / 2 + 0.17, 0.2);
  const spot = new THREE.PointLight(0xffe2b0, 0.55, 7, 1.6); spot.position.set(wall.x, cy + 0.6, wall.z + 1.6); scene.add(spot);
  [photo, band].forEach((m) => { m.userData.ex = PORTRAIT_EX; interactive.push(m); });
  // the national flag (left) and the Party flag (right), each on a gold rod
  const flagW = 1.95, flagH = 1.3;
  const mk = (c) => new THREE.MeshLambertMaterial({ map: canvasTex(c), side: THREE.DoubleSide });
  const vn = new THREE.Mesh(new THREE.PlaneGeometry(flagW, flagH), mk(vnFlagCanvas()));
  onWall(vn, wall, -3.25, cy + 0.6, 0.09);
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(flagW, flagH), new THREE.MeshLambertMaterial({ color: 0xda251d, side: THREE.DoubleSide }));
  onWall(pf, wall, 3.25, cy + 0.6, 0.09);
  loadImg("images/sanh/co_dang.png").then((im) => { if (!im) return; const t = new THREE.Texture(im); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; pf.material.map = t; pf.material.color.set(0xffffff); pf.material.needsUpdate = true; });
  for (const x of [-3.25, 3.25]) {
    onWall(new THREE.Mesh(bx(flagW + 0.2, 0.05, 0.05), DECO.gold), wall, x, cy + 0.6 + flagH / 2 + 0.05, 0.1);
    for (const s of [-1, 1]) onWall(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), DECO.gold), wall, x + s * (flagW / 2 + 0.12), cy + 0.6 + flagH / 2 + 0.05, 0.1);
  }
}

function infoPanel(p, w, h) {
  return textPlane([
    { text: p.date, size: 36, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 8, align: "left" },
    { text: p.title, size: 50, weight: 700, gap: 14, align: "left" },
    { text: p.text, size: 30, font: UI_FONT, color: "#e8dcc4", align: "left" },
  ], w, h, { ppm: 270, top: 0.08 });
}

function buildRooms() {
  const loader = new THREE.TextureLoader();
  const pTex = canvasTex(plankCanvas(), [2.5, 2.5]);
  const woodFloorMat = new THREE.MeshStandardMaterial({
    map: pTex, bumpMap: pTex, bumpScale: 0.012, roughness: 0.34, metalness: 0.05,
  });
  DATA.rooms.forEach((room, i) => {
    const g = ROOM_GEO[i];
    const [x0, x1, z0, z1] = g.rect;
    slab(x0, x1, z0, z1, 0.01, woodFloorMat);
    decorateRoom(g, room);
    slab(x0, x1, z0, z1, 5, M.ceiling, false);
    const light = new THREE.PointLight(0xffd6a0, 0.55, 15, 1.5); light.position.set(g.c[0], 4.2, g.c[1]); scene.add(light);

    if (room.items.some((it) => it.img)) {
      // photo room: 3 per wall
      room.items.forEach((it, k) => {
        const wall = g.walls[Math.floor(k / 3)], off = [-3.1, 0, 3.1][k % 3];
        loader.load("images/" + it.img + ".jpeg", (tex) => {
          tex.encoding = THREE.sRGBEncoding;
          const asp = tex.image.width / tex.image.height;
          let h = it.big ? 2.0 : 1.55, w = h * asp; const mw = it.big ? 2.9 : 2.6; if (w > mw) { w = mw; h = w / asp; }
          const grp = new THREE.Group();
          const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), M.gold); frame.position.z = 0.03;
          const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); pic.position.z = 0.065;
          const plq = textPlane([{ text: it.date, size: 34, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 4 }, { text: it.title, size: 46, weight: 700 }], 1.8, 0.42, { ppm: 300 });
          plq.position.set(0, -h / 2 - 0.4, 0.02);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.22), M.gold); lamp.position.set(0, h / 2 + 0.3, 0.12);
          grp.add(frame, pic, plq, lamp);
          onWall(grp, wall, off, 2.5, 0.06);
          [frame, pic, plq].forEach((m) => { m.userData.ex = it; interactive.push(m); });
        });
      });
      if (room.walls) room.walls.forEach((t, k) => onWall(textPlane([{ text: t, size: 44, weight: 700, color: GOLD_TXT }], 6.4, 0.42, { bg: "#3a1512", border: false, ppm: 160, pad: 0.03 }), g.walls[k], 0, 4.3));
    } else {
      // text room: 2 + title + 2 + 2
      const slots = [[0, -2.35], [0, 2.35], [1, -3.45], [1, 3.45], [2, -2.35], [2, 2.35]];
      room.items.forEach((it, k) => {
        const [wi, off] = slots[k];
        const m = infoPanel(it, 2.3, 2.1);
        onWall(m, g.walls[wi], off, 2.2);
        m.userData.ex = it; interactive.push(m);
      });
      onWall(textPlane([
        { text: `PHÒNG ${room.num}`, size: 46, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 8 },
        { text: room.period, size: 70, weight: 700, gap: 14 },
        { text: room.name, size: 46, weight: 500, color: "#e8dcc4" },
      ], 2.4, 1.9, { ppm: 240 }), g.walls[1], 0, 3.15);
    }
  });
}

function buildPedestal(ex, g) {
  const [cx, cz] = g.c;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1, 28), M.wood); base.position.set(cx, 0.5, cz); scene.add(base);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 28), M.gold); rim.position.set(cx, 1.0, cz); scene.add(rim);
  const obj = new THREE.Group(); obj.position.set(cx, 1.03, cz); obj.rotation.y = g.face; scene.add(obj);
  const parts = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); obj.add(m); parts.push(m); return m; };
  if (ex.kind === "jar") {
    const prof = [[0, 0], [0.26, 0], [0.34, 0.12], [0.38, 0.32], [0.34, 0.52], [0.22, 0.66], [0.2, 0.74], [0.25, 0.78]].map(([x, y]) => new THREE.Vector2(x, y));
    const jarMat = new THREE.MeshLambertMaterial({ color: 0x8a5634, side: THREE.DoubleSide });
    add(new THREE.LatheGeometry(prof, 32), jarMat, 0, 0, 0);
    const rice = add(new THREE.CircleGeometry(0.2, 20), lam(0xf1ead8), 0, 0.72, 0); rice.rotation.x = -H2;
  } else if (ex.kind === "cannon") {
    const barrel = add(new THREE.CylinderGeometry(0.07, 0.1, 1.3, 14), M.olive, 0, 0.42, 0.15); barrel.rotation.x = -1.2;
    add(new THREE.BoxGeometry(0.34, 0.16, 0.7), M.olive, 0, 0.22, 0.05);
    for (const s of [-1, 1]) { const w = add(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 18), M.metal, s * 0.24, 0.26, 0); w.rotation.z = H2; }
  } else if (ex.kind === "helmet") {
    add(new THREE.SphereGeometry(0.3, 20, 10, 0, PI * 2, 0, PI / 2), M.olive, 0, 0.12, 0);
    const brim = add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24), M.olive, 0, 0.12, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.13, 0.03, 0.32), M.dark, s * 0.32, 0.02, 0.32);
    brim.scale.z = 1.1;
  } else if (ex.kind === "ration") {
    const tc = textCanvas([{ text: "TEM PHIẾU", size: 46, weight: 700, color: "#7a1f1b", gap: 6 }, { text: "GẠO · 1 kg", size: 36, font: UI_FONT, color: "#3a2a1a" }], 0.6, 0.4, { bg: "#efe2bf", borderColor: "#7a1f1b", ppm: 400 });
    const tm = [lam(0xefe2bf), lam(0xefe2bf), new THREE.MeshLambertMaterial({ map: canvasTex(tc) }), lam(0xefe2bf), lam(0xefe2bf), lam(0xefe2bf)];
    for (let k = 0; k < 3; k++) { const b = add(new THREE.BoxGeometry(0.6, 0.03, 0.4), tm, (k - 1) * 0.06, 0.02 + k * 0.035, (k - 1) * 0.04); b.rotation.y = (k - 1) * 0.25; }
    add(new THREE.BoxGeometry(0.34, 0.05, 0.46), lam(0x4b5d3a), 0.05, 0.14, 0.02);
  } else if (ex.kind === "globe") {
    const sph = add(new THREE.SphereGeometry(0.42, 24, 16), lam(0x3f6f8f), 0, 0.62, 0);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.425, 12, 8)), new THREE.LineBasicMaterial({ color: 0xc9a24a }));
    sph.add(wire); spinners.push({ obj: sph, speed: 0.4 });
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), M.gold, 0, 0.12, 0);
    add(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 20), M.gold, 0, 0.02, 0);
  }
  const plq = textPlane([{ text: "HIỆN VẬT", size: 30, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 6 }, { text: ex.title, size: 52, weight: 700 }], 1.1, 0.42, { ppm: 300 });
  const nx = Math.sin(g.face), nz = Math.cos(g.face);
  plq.position.set(cx + nx * 0.64, 0.62, cz + nz * 0.64); plq.rotation.y = g.face; scene.add(plq);
  [base, plq, ...parts].forEach((m) => { m.userData.ex = ex; interactive.push(m); });
  CIRCLES.push([cx, cz, 1.05]);
}

/* ================= interior decor: wainscot, mouldings, cove lights, chandeliers, carpet ================= */
const DECO = {
  wainscot: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.38, metalness: 0.08 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8b256, roughness: 0.2, metalness: 0.88, emissive: 0x160f00 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffe4ad }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
  carpet: new THREE.MeshStandardMaterial({ color: 0x731414, roughness: 0.88, metalness: 0.0 }),
  velvet: new THREE.MeshStandardMaterial({ color: 0x5e1218, roughness: 0.82, metalness: 0.04 }),
  caseWood: new THREE.MeshStandardMaterial({ color: 0x2e1d12, roughness: 0.3, metalness: 0.1 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xdff2fc, transparent: true, opacity: 0.26, roughness: 0.06, metalness: 0.12, reflectivity: 0.9, depthWrite: false,
  }),
};
function wallLen(w, rect) { return Math.abs(Math.sin(w.ry)) > 0.5 ? rect[3] - rect[2] : rect[1] - rect[0]; }
function trimWall(w, len, ceil) {
  onWall(new THREE.Mesh(bx(len, 1.0, 0.05), DECO.wainscot), w, 0, 0.5, 0.045);
  onWall(new THREE.Mesh(bx(len, 0.06, 0.07), DECO.gold), w, 0, 1.03, 0.035);
  onWall(new THREE.Mesh(bx(len, 0.14, 0.12), DECO.gold), w, 0, ceil - 0.08, 0.06);
  onWall(new THREE.Mesh(bx(len, 0.04, 0.03), DECO.glow), w, 0, ceil - 0.2, 0.12);
}
function chandelier(x, y, z, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
  part(g, cyl(0.02, 0.02, 1.2, 6), DECO.gold, 0, 0.6, 0);
  part(g, new THREE.TorusGeometry(r, 0.04, 8, 32), DECO.gold, 0, 0, 0, H2, 0, 0);
  part(g, new THREE.TorusGeometry(r * 0.55, 0.03, 8, 24), DECO.gold, 0, -0.25, 0, H2, 0, 0);
  for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; part(g, new THREE.SphereGeometry(0.07, 10, 8), DECO.bulb, Math.cos(a) * r, 0.06, Math.sin(a) * r); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2 + 0.3; part(g, new THREE.SphereGeometry(0.055, 10, 8), DECO.bulb, Math.cos(a) * r * 0.55, -0.2, Math.sin(a) * r * 0.55); }
  part(g, new THREE.SphereGeometry(0.12, 12, 10), DECO.bulb, 0, -0.45, 0);
}
function decorateHall() {
  // red carpet from the entrance to room III, with gold borders
  slab(-1.3, 1.3, -23.6, -0.4, 0.02, DECO.carpet);
  slab(-1.3, -1.18, -23.6, -0.4, 0.025, DECO.gold); slab(1.18, 1.3, -23.6, -0.4, 0.025, DECO.gold);
  // wainscot + mouldings on the four hall walls (skipping the door openings)
  // wainscot stops at the doors; the ceiling moulding and cove light run the full length of each wall
  const segs = (wallX, ry, list) => list.forEach(([a, b]) => trimWallPart({ x: wallX, z: (a + b) / 2, ry }, b - a, 8, true, false));
  segs(-11.8, H2, [[-4.8, -0.2], [-16.8, -7.2], [-23.8, -19.2]]);
  segs(11.8, -H2, [[-4.8, -0.2], [-16.8, -7.2], [-23.8, -19.2]]);
  for (const [a, b] of [[-11.8, -1.2], [1.2, 11.8]]) trimWallPart({ x: (a + b) / 2, z: -23.8, ry: 0 }, b - a, 8, true, false);
  for (const [a, b] of [[-11.8, -1.8], [1.8, 11.8]]) trimWallPart({ x: (a + b) / 2, z: -0.2, ry: PI }, b - a, 8, true, false);
  for (const w of [{ x: 0, z: -23.8, ry: 0 }, { x: 0, z: -0.2, ry: PI }]) trimWallPart(w, 23.6, 8, false, true);
  // hai tường bên: phào trần dừng trước cửa lên phòng ảnh tầng 2 (z -3.1…-0.7)
  trimWallPart({ x: -11.8, z: -13.6, ry: H2 }, 20.4, 8, false, true); trimWallPart({ x: 11.8, z: -13.6, ry: -H2 }, 20.4, 8, false, true);
  // pilasters between panels and doors
  for (const sx of [-1, 1]) for (const z of [-9, -15]) {
    const w = { x: sx * 11.8, z, ry: -sx * H2 };
    onWall(new THREE.Mesh(bx(0.55, 7.7, 0.22), M.cream), w, 0, 3.85, 0.11);
    onWall(new THREE.Mesh(bx(0.75, 0.3, 0.3), DECO.gold), w, 0, 7.55, 0.15);
    onWall(new THREE.Mesh(bx(0.75, 0.25, 0.3), DECO.gold), w, 0, 0.12, 0.15);
    CIRCLES.push([sx * 11.4, z, 0.35]);
  }
  chandelier(0, 6.6, -6, 0.95); chandelier(0, 6.6, -18, 0.95);
}
function trimWallPart(w, len, ceil, low = true, high = true) {
  if (low) {
    onWall(new THREE.Mesh(bx(len, 1.0, 0.05), DECO.wainscot), w, 0, 0.5, 0.045);
    onWall(new THREE.Mesh(bx(len, 0.06, 0.07), DECO.gold), w, 0, 1.03, 0.035);
  }
  if (high) {
    onWall(new THREE.Mesh(bx(len, 0.16, 0.14), DECO.gold), w, 0, ceil - 0.09, 0.07);
    onWall(new THREE.Mesh(bx(len, 0.04, 0.03), DECO.glow), w, 0, ceil - 0.24, 0.14);
  }
}
function decorateRoom(g, room) {
  for (const w of g.walls) trimWall(w, wallLen(w, g.rect), 5);
  // round ceiling light with a glowing ring
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), DECO.glow); disc.rotation.x = H2; disc.position.set(g.c[0], 4.97, g.c[1]); scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), DECO.gold); ring.rotation.x = H2; ring.position.set(g.c[0], 4.95, g.c[1]); scene.add(ring);
}

/* ================= second floor: mezzanine, balcony, glass elevator ================= */
let elevAction = null;
function buildUpperFloor() {
  const woodTop = new THREE.MeshPhongMaterial({ color: 0x5a3a24, shininess: 40, specular: 0x2a1c10 });
  // mezzanine along the entrance wall (z -3.4 … -0.2), and a little bridge to the elevator
  box(23.6, 0.3, 3.2, 0, UP - 0.15, -1.8, [M.cream, M.cream, woodTop, M.ceiling, M.cream, M.cream], true);
  box(1.8, 0.3, 0.45, -6.5, UP - 0.15, -3.62, [M.cream, M.cream, woodTop, M.ceiling, M.cream, M.cream], true);
  // glass railing with a gold handrail (gap where the elevator opens)
  for (const [a, b] of [[-11.8, -7.4], [-5.6, 11.8]]) {
    const g = box(b - a, 0.95, 0.04, (a + b) / 2, UP + 0.48, -3.38, DECO.glass); g.renderOrder = 2;
    box(b - a, 0.06, 0.08, (a + b) / 2, UP + 0.98, -3.38, DECO.gold);
    for (let x = a; x <= b + 0.01; x += 1.6) box(0.05, 0.95, 0.05, x, UP + 0.48, -3.38, DECO.gold);
  }
  for (const x of [-7.4, -5.6]) { const g = box(0.04, 0.95, 0.4, x, UP + 0.48, -3.6, DECO.glass); g.renderOrder = 2; box(0.08, 0.06, 0.45, x, UP + 0.98, -3.6, DECO.gold); }
  // glow strip under the mezzanine edge
  box(23.4, 0.04, 0.06, 0, UP - 0.32, -3.36, DECO.glow);
  // balcony between the portico columns, with a white balustrade
  box(16.6, 0.3, 3.85, 0, UP - 0.15, 2.12, [M.white, M.white, new THREE.MeshPhongMaterial({ color: 0xe9e1cf, shininess: 30 }), M.white, M.white, M.white], true);
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const top = box(0.14, 0.1, len, mx, UP + 1.0, mz, M.white); top.rotation.y = ang;
    const bot = box(0.14, 0.08, len, mx, UP + 0.06, mz, M.white); bot.rotation.y = ang;
    const n = Math.round(len / 0.3);
    for (let i = 0; i <= n; i++) { const b = new THREE.Mesh(cyl(0.045, 0.065, 0.9, 8), M.white); b.position.set(x0 + (x1 - x0) * i / n, UP + 0.5, z0 + (z1 - z0) * i / n); scene.add(b); }
  };
  rail(-8.25, 4.02, 8.25, 4.02); rail(-8.25, 0.25, -8.25, 4.02); rail(8.25, 0.25, 8.25, 4.02);
  // gold frame around the balcony door
  box(0.2, 2.5, 0.5, -1.3, UP + 1.2, 0.05, M.gold); box(0.2, 2.5, 0.5, 1.3, UP + 1.2, 0.05, M.gold); box(2.8, 0.2, 0.5, 0, UP + 2.45, 0.05, M.gold);
  // signs
  onWall(textPlane([{ text: "BAN CÔNG NGẮM CẢNH", size: 52, weight: 700, color: GOLD_TXT, gap: 6 }, { text: "Cửa giữa ra ban công · Hai đầu hành lang vào Phòng ảnh tư liệu", size: 30, font: UI_FONT }], 2.6, 0.9, { ppm: 240 }), { x: 0, z: -0.2, ry: PI }, -9.9, 6.3);

  // glass elevator shaft: three glass sides, open towards +z at both floors
  const top = UP + 2.7, cx = (ELEV.x0 + ELEV.x1) / 2, cz = (ELEV.z0 + ELEV.z1) / 2, w = ELEV.x1 - ELEV.x0, d = ELEV.z1 - ELEV.z0;
  for (const [gx, gz, gw, gd] of [[cx, ELEV.z0, w, 0.04], [ELEV.x0, cz, 0.04, d], [ELEV.x1, cz, 0.04, d]]) { const g = box(gw, top, gd, gx, top / 2, gz, DECO.glass); g.renderOrder = 2; }
  for (const x of [ELEV.x0, ELEV.x1]) for (const z of [ELEV.z0, ELEV.z1]) box(0.08, top, 0.08, x, top / 2, z, DECO.gold);
  box(w + 0.3, 0.2, d + 0.3, cx, top + 0.1, cz, DECO.gold);
  CIRCLES.push([ELEV.x0, ELEV.z0, 0.12], [ELEV.x1, ELEV.z0, 0.12]);
  // the cabin (moves up and down)
  const cab = new THREE.Group(); cab.position.set(cx, 0, cz); scene.add(cab); ELEV.cabin = cab;
  part(cab, bx(w - 0.08, 0.12, d - 0.08), woodTop, 0, 0.06, 0);
  part(cab, bx(w - 0.08, 0.08, d - 0.08), DECO.caseWood, 0, 2.5, 0);
  part(cab, new THREE.PlaneGeometry(w - 0.4, d - 0.4), DECO.glow, 0, 2.45, 0, H2);
  for (const [px, pz, pw, pd] of [[0, -d / 2 + 0.06, w - 0.1, 0.05], [-w / 2 + 0.06, 0, 0.05, d - 0.1], [w / 2 - 0.06, 0, 0.05, d - 0.1]]) part(cab, bx(pw, 0.06, pd), DECO.gold, px, 1.0, pz);
  const pnl = part(cab, bx(0.04, 0.5, 0.3), DECO.caseWood, w / 2 - 0.1, 1.3, -0.3);
  for (const [by, col] of [[1.42, 0xffe2a6], [1.2, 0xffe2a6]]) part(cab, cyl(0.04, 0.04, 0.02, 12), new THREE.MeshBasicMaterial({ color: col }), w / 2 - 0.13, by, -0.3, 0, 0, H2);
  const lab = textPlane([{ text: "THANG MÁY", size: 46, weight: 700, color: GOLD_TXT, gap: 4 }, { text: "Tầng 1 ⇅ Tầng 2 · Phòng ảnh & ban công", size: 28, font: UI_FONT }], 1.7, 0.4, { ppm: 260 });
  placeAt(lab, cx, 2.95, ELEV.z1 + 0.03, 0);
  const lab2 = lab.clone(); placeAt(lab2, cx, UP + 2.95 - 0.35, ELEV.z1 + 0.03, 0);
}
function updateElevator(dt) {
  if (!ELEV.cabin) return;
  const inside = inElev(player.x, player.z);
  if (ELEV.y !== ELEV.target) {
    const dy = ELEV.target - ELEV.y, step = Math.sign(dy) * Math.min(Math.abs(dy), 1.8 * dt);
    ELEV.y += step; if (Math.abs(ELEV.target - ELEV.y) < 1e-3) ELEV.y = ELEV.target;
  }
  ELEV.cabin.position.y = ELEV.y;
  if (inside) player.base = ELEV.y;
  else player.base = player.base > UP / 2 ? UP : 0;
}
function elevatorPrompt() {
  if (!ELEV.cabin || ELEV.y !== ELEV.target) return null;
  const lvlY = levelOf() ? UP : 0;
  if (inElev(player.x, player.z)) {
    const up = ELEV.y < UP / 2;
    const act = () => { ELEV.target = up ? UP : 0; };
    act.label = up ? "Lên tầng 2 · Phòng ảnh tư liệu & ban công" : "Xuống tầng 1";
    return act;
  }
  const cx = (ELEV.x0 + ELEV.x1) / 2, cz = ELEV.z1 + 0.6;
  if (Math.hypot(player.x - cx, player.z - cz) < 1.6 && Math.abs(ELEV.y - lvlY) > 0.05) {
    const act = () => { ELEV.target = lvlY; };
    act.label = "Gọi thang máy";
    return act;
  }
  return null;
}

/* ================= tầng 2: bốn phòng ảnh tư liệu ================= */
// Dữ liệu ở content.js (MUSEUM.upperRooms); bố cục tường/khung ở UPPER_GEO. Mở trang với ?slots=1 để hiện mã khung (U1-01…) trên biển tên.
const SHOW_SLOT_IDS = /[?&]slots=1/.test(location.search);
// hộp phụ trợ cho đồ trang trí: mặc định không đổ bóng (đỡ nặng máy yếu)
function mbox(w, h, d, x, y, z, mat, cast = false, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function buildUpperRooms() {
  const rooms = UPPER(); if (!rooms.length) return;
  const loader = new THREE.TextureLoader();
  const pTex = canvasTex(plankCanvas(), [2.5, 2.5]);
  const floorMat = new THREE.MeshStandardMaterial({ map: pTex, bumpMap: pTex, bumpScale: 0.012, roughness: 0.34, metalness: 0.05 });
  // khung trống dùng chung: ảnh giữ chỗ + biển tên trống (mọi khung trống chia sẻ hình học và vật liệu)
  const phC = document.createElement("canvas"); phC.width = 580; phC.height = 440;
  { const g = phC.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 440); gr.addColorStop(0, "#3b2c22"); gr.addColorStop(1, "#241a14");
    g.fillStyle = gr; g.fillRect(0, 0, 580, 440); g.strokeStyle = "rgba(201,162,74,0.55)"; g.lineWidth = 3; g.strokeRect(22, 22, 536, 396);
    g.textAlign = "center"; g.fillStyle = "rgba(226,201,138,0.82)"; g.font = `600 40px ${UI_FONT}`; g.fillText("Ảnh tư liệu", 290, 215);
    g.fillStyle = "rgba(226,201,138,0.5)"; g.font = `400 26px ${UI_FONT}`; g.fillText("Sắp cập nhật", 290, 262); }
  const phMat = new THREE.MeshBasicMaterial({ map: canvasTex(phC) });
  const blankPlq = new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas([], 1.5, 0.34, { ppm: 200 })) });
  const gFrame = new THREE.BoxGeometry(1.61, 1.26, 0.06), gPic = new THREE.PlaneGeometry(1.45, 1.1), gPlq = new THREE.PlaneGeometry(1.5, 0.34), gLamp = new THREE.BoxGeometry(0.5, 0.06, 0.22);
  const FY = UP + 2.55;
  // L = bố cục một khung: y tâm ảnh, h cao ảnh, mw rộng tối đa, small = hàng đôi (biển tên 1 dòng, không đèn)
  const BIG = { y: FY, h: 1.4, mw: 1.5 }, TOP = { y: UP + 3.02, h: 0.78, mw: 1.5, small: true }, BOT = { y: UP + 1.84, h: 0.78, mw: 1.5, small: true };
  const TOPD = { ...TOP, mw: 1.25, pw: 1.3 }, BOTD = { ...BOT, mw: 1.25, pw: 1.3 };
  const holder = (wall, off, id, L = BIG) => {
    const g = new THREE.Group(), k = L.h / 1.1;
    const f = new THREE.Mesh(gFrame, M.gold); f.position.z = 0.03; f.scale.set(k, k, 1);
    const p = new THREE.Mesh(gPic, phMat); p.position.z = 0.065; p.scale.set(k, k, 1);
    g.add(f, p); g.userData.slot = id;
    if (SHOW_SLOT_IDS || !L.small) { const q = new THREE.Mesh(gPlq, SHOW_SLOT_IDS ? new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas([{ text: id, size: 46, weight: 700, color: GOLD_TXT }], 1.5, 0.34, { ppm: 200 })) }) : blankPlq); q.position.set(0, -L.h / 2 - 0.32, 0.02); if (L.small) q.scale.set(0.8, 0.7, 1); g.add(q); }
    return onWall(g, wall, off, L.y, 0.06);
  };
  const photo = (wall, off, fr, id, L = BIG) => {
    const h0 = holder(wall, off, id, L);
    const src = /\.\w{2,4}$/.test(fr.img) ? "images/" + fr.img : "images/" + fr.img + ".jpeg";
    loader.load(src, (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      const asp = tex.image.width / tex.image.height; let h = L.h, w = h * asp; if (w > L.mw) { w = L.mw; h = w / asp; }
      const grp = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), M.gold); frame.position.z = 0.03;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); pic.position.z = 0.065;
      const plq = L.small
        ? textPlane([{ text: fr.title || "", size: 38, weight: 700 }], L.pw || 1.5, 0.26, { ppm: 300, pad: 0.04 })
        : textPlane([{ text: fr.date || "", size: 30, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 4 }, { text: fr.title || "", size: 42, weight: 700 }], 1.6, 0.42, { ppm: 300, pad: 0.05 });
      plq.position.set(0, L.small ? -L.h / 2 - 0.24 : -h / 2 - 0.38, 0.02);
      grp.add(frame, pic, plq);
      if (!L.small) { const lamp = new THREE.Mesh(gLamp, M.gold); lamp.position.set(0, h / 2 + 0.2, 0.12); grp.add(lamp); }
      scene.remove(h0); onWall(grp, wall, off, L.y, 0.06);
      const ex = { title: "Ảnh tư liệu", ...fr, photo: src, text: fr.text || "" };
      [frame, pic, plq].forEach((m) => { m.userData.ex = ex; interactive.push(m); });
    }, undefined, () => {});
  };
  // vị trí khung trên một tường (cols = các off có thể treo): n ảnh -> 1 hàng lớn (n <= số cột) hoặc 2 hàng nhỏ
  const DOOR_COLS = [-3.95, -2.3, 2.3, 3.95]; // vách ngăn có cửa ở giữa: 2 cột mỗi bên
  const plainCols = (len, sp) => { const c = Math.floor((len - 0.6) / sp); return Array.from({ length: c }, (_, i) => (i - (c - 1) / 2) * sp); };
  // tường phía hội trường: chừa cửa ra hành lang (±1.45) và biển tên phòng (±1.2), xếp cột vào các đoạn còn trống
  const hallCols = (hw, len, sp) => {
    const blocks = [[hw.title - 1.2, hw.title + 1.2]]; if (hw.door != null) blocks.push([hw.door - 1.45, hw.door + 1.45]);
    blocks.sort((a, b) => a[0] - b[0]);
    const out = []; let a = -len / 2 + 0.3;
    for (const [b0, b1] of [...blocks, [len / 2 - 0.3, 99]]) {
      const c = Math.floor((b0 - a + 1e-6) / sp); for (let i = 0; i < c; i++) out.push((a + b0) / 2 + (i - (c - 1) / 2) * sp);
      a = Math.max(a, b1);
    }
    return out;
  };
  const rowOffs = (n, cols, sp, plain) => n >= cols.length ? cols : plain ? Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * sp)
    : cols === DOOR_COLS ? [1, 2, 0, 3].slice(0, n).sort().map((i) => cols[i]) : cols.slice(0, n);
  const hang = (w, cols, sp, plain, list, dense) => {
    const put = (fr, off, L) => fr.img ? photo(w, off, fr, fr.id, L) : holder(w, off, fr.id, L);
    if (!dense && list.length <= cols.length) { rowOffs(list.length, cols, sp, plain).forEach((off, i) => put(list[i], off, BIG)); return; }
    const nTop = Math.min(cols.length, Math.ceil(list.length / 2)), nBot = Math.min(cols.length, list.length - nTop);
    rowOffs(nTop, cols, sp, plain).forEach((off, i) => put(list[i], off, dense ? TOPD : TOP));
    rowOffs(nBot, cols, sp, plain).forEach((off, i) => put(list[nTop + i], off, dense ? BOTD : BOT));
  };
  // trang trí tường: ốp chân tường + phào trần; doors = vị trí các ô cửa (theo off) để ốp chân tường chừa ra
  const trimUp = (w, len, doors) => {
    let a = -len / 2; const segs = [];
    for (const d of doors.slice().sort((p, q) => p - q)) { if (d - 1.55 > a) segs.push([a, d - 1.55]); a = d + 1.55; }
    if (len / 2 > a) segs.push([a, len / 2]);
    for (const [s0, s1] of segs) { const l = s1 - s0, c = (s0 + s1) / 2;
      onWall(new THREE.Mesh(bx(l, 1.0, 0.05), DECO.wainscot), w, c, UP + 0.5, 0.045);
      onWall(new THREE.Mesh(bx(l, 0.06, 0.07), DECO.gold), w, c, UP + 1.03, 0.035); }
    onWall(new THREE.Mesh(bx(len, 0.16, 0.14), DECO.gold), w, 0, UP_CEIL - 0.09, 0.07);
    onWall(new THREE.Mesh(bx(len, 0.04, 0.03), DECO.glow), w, 0, UP_CEIL - 0.24, 0.14);
  };
  const doorFrame = (w, d) => {
    for (const s of [-1, 1]) onWall(new THREE.Mesh(bx(0.14, 3.05, 0.12), DECO.gold), w, d + s * 1.27, UP + 1.52, 0.06);
    onWall(new THREE.Mesh(bx(2.68, 0.14, 0.12), DECO.gold), w, d, UP + 3.07, 0.06);
  };
  const doorSign = (w, d, text) => onWall(textPlane([{ text, size: 40, weight: 700, color: GOLD_TXT }], 2.6, 0.4, { bg: "#3a1512", ppm: 200, pad: 0.03 }), w, d, UP + 3.4, 0.04);
  UPPER_GEO.forEach((u, i) => {
    const r = rooms[i]; if (!r) return;
    const [x0, x1, z0, z1] = u.rect, cx = u.c[0], cz = u.c[1], partner = rooms[i ^ 1];
    slab(x0, x1, z0, z1, UP + 0.005, floorMat);
    slab(x0, x1, z0, z1, UP_CEIL, M.ceiling, false);
    // thảm đỏ viền vàng giữa phòng + đèn trần tròn
    slab(cx - 2, cx + 2, cz - 2.8, cz + 2.8, UP + 0.02, DECO.carpet);
    for (const s of [-1, 1]) slab(cx + s * 2 - 0.06, cx + s * 2 + 0.06, cz - 2.8, cz + 2.8, UP + 0.025, DECO.gold);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), DECO.glow); disc.rotation.x = H2; disc.position.set(cx, UP_CEIL - 0.03, cz); scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), DECO.gold); ring.rotation.x = H2; ring.position.set(cx, UP_CEIL - 0.05, cz); scene.add(ring);
    // tường: ốp chân tường (chừa cửa), khung cửa + biển "sang phòng bên" trên cửa vách ngăn
    u.walls.forEach((w, k) => {
      trimUp(w, wallLen(w, u.rect), k === u.door ? [0] : []);
      if (k === u.door) { doorFrame(w, 0); if (partner) doorSign(w, 0, `Sang Phòng ${partner.num}`); }
    });
    // tường hội trường (mặt trong phòng): cửa từ hành lang tầng 2 (nếu có), biển tên phòng
    const hw = u.hall;
    trimUp(hw, wallLen(hw, u.rect), hw.door != null ? [hw.door] : []);
    if (hw.door != null) { doorFrame(hw, hw.door); doorSign(hw, hw.door, "Ra hành lang tầng 2"); }
    onWall(textPlane([
      { text: `PHÒNG ${r.num}`, size: 44, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 8 },
      { text: r.period, size: 66, weight: 700, gap: 12 },
      { text: "Ảnh tư liệu", size: 44, weight: 500, color: "#e8dcc4" },
    ], 2.4, 1.6, { ppm: 240 }), hw, hw.title, UP + 2.5, 0.04);
    // các khung ảnh: chia cho các tường theo tỉ lệ số cột (tối đa 2 hàng mỗi tường), lần lượt trái -> phải, hàng trên rồi hàng dưới.
    // Phòng quá 30 ảnh chuyển sang kiểu "dày": khung nhỏ hơn, cách nhau 1.4 m và treo thêm lên tường phía hội trường.
    const frames = (r.frames || []).map((fr, n) => ({ ...fr, id: fr.id || `U${i + 1}-${String(n + 1).padStart(2, "0")}` }));
    const mk = (sp, withHall) => {
      const ws = u.walls.map((w, k) => ({ w, cols: k === u.door ? DOOR_COLS : plainCols(wallLen(w, u.rect), sp), plain: k !== u.door }));
      if (withHall) ws.push({ w: u.hall, cols: hallCols(u.hall, wallLen(u.hall, u.rect), sp), plain: false });
      return ws;
    };
    let ws = mk(1.75, false), sp = 1.75, dense = false;
    if (frames.length > ws.reduce((a, x) => a + x.cols.length, 0) * 2) { ws = mk(1.4, true); sp = 1.4; dense = true; }
    const caps = ws.map((x) => x.cols.length), capSum = caps.reduce((a, b) => a + b, 0);
    const N = Math.min(frames.length, capSum * 2);
    const share = caps.map((c) => Math.min(c * 2, Math.floor(N * c / capSum)));
    for (let left = N - share.reduce((a, b) => a + b, 0); left > 0;) {
      const k = caps.map((c, j) => share[j] < c * 2 ? N * c / capSum - share[j] : -9).reduce((b, v, j, arr) => v > arr[b] ? j : b, 0);
      share[k]++; left--;
    }
    let n = 0;
    ws.forEach((x, k) => { hang(x.w, x.cols, sp, x.plain, frames.slice(n, n + share[k]), dense); n += share[k]; });
    if (frames.length > N) console.warn(`Phòng ${r.num}: có ${frames.length} ảnh nhưng tường chỉ treo được ${N}`);
    // đèn: mỗi cặp phòng chung một đèn đặt trên vách ngăn
    if (i % 2 === 0) { const l = new THREE.PointLight(0xffd6a0, 0.75, 15, 1.5); l.position.set(cx, UP + 2.9, -12); scene.add(l); }
  });
  // hành lang tầng 2 (mặt trong tường mặt tiền, hai bên cửa ra ban công): ảnh tư liệu 1939 – 1945, dữ liệu ở MUSEUM.corridor.
  // Vị trí lần lượt trái -> phải khi đứng trong hành lang nhìn ra ban công; tối đa 9 ảnh (từ 8 ảnh trở xuống thì ô đầu là biển tiêu đề).
  const cor = DATA.corridor;
  if (cor && cor.frames && cor.frames.length) {
    const cw = { x: 0, z: -0.2, ry: PI }, CL = { y: UP + 2.0, h: 1.3, mw: 1.5 }, all = [-7.7, -6.0, -4.3, -2.6, 2.6, 4.35, 6.1, 7.85, 9.6], head = cor.frames.length < all.length, offs = head ? all.slice(1) : all;
    cor.frames.slice(0, offs.length).forEach((fr, n) => { const id = fr.id || `H2-0${n + 1}`; if (fr.img) photo(cw, offs[n], fr, id, CL); else holder(cw, offs[n], id, CL); });
    if (cor.frames.length > offs.length) console.warn(`Hành lang tầng 2: có ${cor.frames.length} ảnh nhưng chỉ treo được ${offs.length}`);
    if (head) onWall(textPlane([
      { text: "ẢNH TƯ LIỆU", size: 40, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 8 },
      { text: cor.period, size: 64, weight: 700, gap: 12 },
      { text: cor.name, size: 40, weight: 500, color: "#e8dcc4" },
    ], 1.5, 1.3, { ppm: 240 }), cw, all[0], UP + 2.0, 0.04);
  }
  // mặt hành lang (trong hội trường): khung cửa vàng + biển chỉ dẫn bên cạnh mỗi cửa lên phòng ảnh
  UPPER_GEO.forEach((u, i) => {
    const r = rooms[i]; if (!r || u.hall.door == null) return;
    const s = u.hall.x < 0 ? -1 : 1, hx = s * 11.72, ry = s < 0 ? H2 : -H2;
    for (const dz of [-1.27, 1.27]) mbox(0.16, 3.05, 0.14, hx, UP + 1.52, -1.9 + dz, DECO.gold);
    mbox(0.16, 0.14, 2.68, hx, UP + 2.93, -1.9, DECO.gold);
    const sign = textPlane([
      { text: "TẦNG 2", size: 32, weight: 600, font: UI_FONT, color: GOLD_TXT, gap: 4 },
      { text: `PHÒNG ${r.num}`, size: 52, weight: 700, gap: 6 },
      { text: "Ảnh tư liệu", size: 30, font: UI_FONT, color: "#e8dcc4", gap: 4 },
      { text: r.period, size: 36, weight: 600, color: GOLD_TXT },
    ], 1.9, 1.3, { bg: "#681313", borderColor: "#cfa84a", ppm: 220 });
    placeAt(sign, s * 11.77, UP + 2.25, -5.4, ry);
  });
}

/* ================= mở rộng ngoài trời: cổng bên, khu vui chơi (x<0), khu parkour (x>0) ================= */
const GATE_Z = 8.5;     // hai cổng bên mở trong lũy tre tại x = ±30
const anims = [];       // hàm hoạt hoạ theo thời gian: (t, dt) => …
const FUN = [0xe63946, 0xf4a261, 0xffd166, 0x2a9d8f, 0x4361ee, 0x7b2cbf, 0xff6fb5];
const fmats = {};
const fmat = (c, r = 0.6, m = 0.05) => fmats[c + "|" + r + "|" + m] || (fmats[c + "|" + r + "|" + m] = pbr(c, r, m));
const FLOWERS = [], FENCE_POSTS = [], TREE_SPOTS = []; // gom lại rồi dựng một lần bằng InstancedMesh
function rod(parent, a, b, r, mat) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 6), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.receiveShadow = true; parent.add(m); return m;
}
function flowerBed(x0, x1, z0, z1) {
  mbox(x1 - x0, 0.34, z1 - z0, (x0 + x1) / 2, 0.17, (z0 + z1) / 2, M.wood);
  mbox(x1 - x0 - 0.14, 0.05, z1 - z0 - 0.14, (x0 + x1) / 2, 0.345, (z0 + z1) / 2, M.soil);
  BLOCKS.push({ x0, x1, z0, z1 });
  const n = Math.round((x1 - x0) * (z1 - z0) * 14);
  for (let i = 0; i < n; i++) FLOWERS.push([x0 + 0.12 + rand() * (x1 - x0 - 0.24), 0.43 + rand() * 0.1, z0 + 0.12 + rand() * (z1 - z0 - 0.24), [0xe63946, 0xffd166, 0xff8fab, 0xf4a261, 0xffffff][Math.floor(rand() * 5)]]);
}
function bench(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  mbox(1.6, 0.08, 0.46, 0, 0.46, 0, fmat(0x9a6a3c, 0.6), false, g); mbox(1.6, 0.4, 0.06, 0, 0.74, -0.22, fmat(0x9a6a3c, 0.6), false, g);
  for (const s of [-1, 1]) { mbox(0.08, 0.46, 0.4, s * 0.7, 0.23, 0, M.dark, false, g); addSeat(g, s * 0.38, 0.5, 0.03, PI, "Ngồi ghế"); }
  CIRCLES.push([x, z, 0.8]);
}
function fence(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2);
  for (let i = 0; i <= n; i++) FENCE_POSTS.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
  for (const y of [0.45, 0.85]) { if (x0 === x1) mbox(0.08, 0.1, len, x0, y, (z0 + z1) / 2, fmat(0xf2ead8, 0.7)); else mbox(len, 0.1, 0.08, (x0 + x1) / 2, y, z0, fmat(0xf2ead8, 0.7)); }
}
// chữ nằm phẳng trên mặt bệ (ry = hướng đọc: -H2 đọc được khi nhìn về +x)
function flatText(x, y, z, w, h, blocks, o, ry) {
  const m = textPlane(blocks, w, h, o); m.rotation.order = "YXZ"; m.rotation.set(-H2, ry || 0, 0); m.position.set(x, y, z); scene.add(m); return m;
}
// bảng chỉ dẫn hai chân; ry = hướng mặt bảng (0 quay về +z)
function signBoard(x, z, ry, w, h, blocks, o) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  for (const s of [-1, 1]) mbox(0.09, 1.0 + h, 0.09, s * (w / 2 - 0.2), (1.0 + h) / 2, 0, M.dark, false, g);
  mbox(w + 0.1, h + 0.1, 0.05, 0, 1.0 + h / 2, -0.04, M.dark, false, g);
  const b = textPlane(blocks, w, h, o || { ppm: 200 }); b.position.set(0, 1.0 + h / 2, 0); g.add(b);
  const sideways = Math.abs(Math.sin(ry)) > 0.5;
  BLOCKS.push(sideways ? { x0: x - 0.25, x1: x + 0.25, z0: z - w / 2, z1: z + w / 2 } : { x0: x - w / 2, x1: x + w / 2, z0: z - 0.25, z1: z + 0.25 });
  return g;
}
function pave(x0, x1, z0, z1) {
  const m = slab(x0, x1, z0, z1, 0.012, texMat(stoneCanvas("#c3b79f", "#b2a68e"), [(x1 - x0) / 2.4, (z1 - z0) / 2.4])); return m;
}
const redMat = () => new THREE.MeshStandardMaterial({ color: 0xc8201c, emissive: 0x501010, roughness: 0.6 });

function buildGates() {
  const lanternGeo = new THREE.SphereGeometry(0.2, 10, 8), lMat = redMat();
  for (const s of [-1, 1]) {
    const x = s * 30, play = s < 0;
    for (const dz of [-2.4, 2.4]) {
      mbox(0.7, 3.6, 0.7, x, 1.8, GATE_Z + dz, M.ochreDark, true); mbox(0.95, 0.22, 0.95, x, 3.7, GATE_Z + dz, M.gold); mbox(0.92, 0.3, 0.92, x, 0.15, GATE_Z + dz, M.granite);
    }
    mbox(0.6, 0.95, 5.9, x, 3.85, GATE_Z, M.ochreDark, true); mbox(0.76, 0.1, 6.1, x, 4.37, GATE_Z, M.gold); mbox(0.9, 0.16, 6.3, x, 4.5, GATE_Z, M.roof);
    const inner = textPlane([{ text: play ? "KHU VUI CHƠI" : "KHU PARKOUR", size: 66, weight: 700, color: GOLD_TXT }], 5.2, 0.78, { bg: "#681313", borderColor: "#cfa84a", ppm: 150 });
    placeAt(inner, x - s * 0.31, 3.85, GATE_Z, -s * H2);
    const outer = textPlane([{ text: "Về sân bảo tàng", size: 52, weight: 700, color: GOLD_TXT }], 5.2, 0.78, { bg: "#681313", borderColor: "#cfa84a", ppm: 150 });
    placeAt(outer, x + s * 0.31, 3.85, GATE_Z, s * H2);
    for (const dz of [-1.6, 0, 1.6]) { const l = new THREE.Mesh(lanternGeo, lMat); l.scale.set(1, 1.35, 1); l.position.set(x, 3.0, GATE_Z + dz); scene.add(l); rod(scene, [x, 3.28, GATE_Z + dz], [x, 3.375, GATE_Z + dz], 0.015, M.gold); }
    // bồn hoa hai bên cổng (phía sân và phía trong khu mới)
    flowerBed(Math.min(s * 27.4, s * 28.8), Math.max(s * 27.4, s * 28.8), 4.3, 5.7);
    for (const [za, zb] of [[4.4, 5.8], [11.2, 12.6]]) flowerBed(Math.min(s * 31.6, s * 33), Math.max(s * 31.6, s * 33), za, zb);
  }
}

/* ---- khu vui chơi ---- */
const BALL = { x: -40.5, z: 34, y: 0.22, vx: 0, vz: 0, vy: 0, mesh: null, R: 0.22 };
const PITCH = { x0: -46.4, x1: -34.6, z0: 26, z1: 42, gx: -40.5, mouth: 1.6, depth: 1.0 };
function pitchCanvas() {
  const S = 20, W = Math.round((PITCH.x1 - PITCH.x0) * S), Hh = Math.round((PITCH.z1 - PITCH.z0) * S);
  const c = document.createElement("canvas"); c.width = W; c.height = Hh; const g = c.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#3f8f3a" : "#47993f"; g.fillRect(0, i * Hh / 8, W, Hh / 8 + 1); }
  g.strokeStyle = "rgba(255,255,255,0.92)"; g.lineWidth = 3;
  const m = 10; g.strokeRect(m, m, W - 2 * m, Hh - 2 * m);
  g.beginPath(); g.moveTo(m, Hh / 2); g.lineTo(W - m, Hh / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, Hh / 2, 2 * S, 0, PI * 2); g.stroke();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(W / 2, Hh / 2, 4, 0, PI * 2); g.fill();
  for (const top of [true, false]) {
    const y0 = top ? m : Hh - m, d = top ? 1 : -1;
    g.strokeRect(W / 2 - 3.2 * S, top ? y0 : y0 - 3 * S, 6.4 * S, 3 * S);
    g.strokeRect(W / 2 - 1.6 * S, top ? y0 : y0 - 1 * S, 3.2 * S, 1 * S);
    g.beginPath(); g.arc(W / 2, y0 + d * 2.2 * S, 3, 0, PI * 2); g.fill();
  }
  return c;
}
function buildPlayground() {
  // đường đi: trục từ cổng vào, đường từ đài phun xuống sân bóng
  pave(-57, -30.4, 7.3, 9.7); pave(-41.7, -39.3, 18.8, 24.4);
  // đài phun nước + quảng trường hoa
  const fx = -40.5, fz = 14;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.8, 40), texMat(stoneCanvas("#d0c4ab", "#bfb39a"), [2, 2])); plaza.rotation.x = -H2; plaza.position.set(fx, 0.013, fz); plaza.receiveShadow = true; scene.add(plaza);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.0, 0.5, 28), M.granite); basin.position.set(fx, 0.25, fz); basin.castShadow = true; scene.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28), new THREE.MeshStandardMaterial({ color: 0x4aa3c7, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1 }));
  water.rotation.x = -H2; water.position.set(fx, 0.46, fz); scene.add(water);
  mbox(0.5, 1.3, 0.5, fx, 0.95, fz, M.granite, true);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, 0.3, 20), M.granite); bowl.position.set(fx, 1.7, fz); scene.add(bowl);
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xcdefff, transparent: true, opacity: 0.55 });
  for (let k = 0; k < 7; k++) {
    const a = k / 6 * PI * 2, rr = k === 6 ? 0 : 1.05; const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.3, 6), jetMat);
    jet.position.set(fx + Math.cos(a) * rr * (k === 6 ? 0 : 1), k === 6 ? 2.45 : 0.9, fz + Math.sin(a) * rr * (k === 6 ? 0 : 1)); scene.add(jet);
    anims.push((t) => { const sc = 0.85 + 0.2 * Math.sin(t * 3.1 + k); jet.scale.y = sc * (k === 6 ? 1.4 : 1); });
  }
  CIRCLES.push([fx, fz, 2.1]);
  for (let k = 0; k < 8; k++) { // 6 bồn hoa tròn quanh quảng trường (chừa hai lối đi bắc – nam)
    const a = k / 8 * PI * 2; if (k === 2 || k === 6) continue;
    const px = fx + Math.cos(a) * 3.7, pz = fz + Math.sin(a) * 3.7;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.34, 12), M.wood); pot.position.set(px, 0.17, pz); scene.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 12), M.soil); soil.position.set(px, 0.35, pz); scene.add(soil);
    for (let i = 0; i < 9; i++) { const b = rand() * PI * 2, r = rand() * 0.38; FLOWERS.push([px + Math.cos(b) * r, 0.43 + rand() * 0.1, pz + Math.sin(b) * r, [0xe63946, 0xffd166, 0xff8fab, 0xf4a261, 0xffffff][Math.floor(rand() * 5)]]); }
    CIRCLES.push([px, pz, 0.6]);
  }
  for (const a of [0, PI, PI / 3, PI * 2 / 3]) bench(fx + Math.cos(a) * 4.9, fz + Math.sin(a) * 4.9, Math.atan2(-Math.cos(a), -Math.sin(a))); // quay mặt vào đài phun

  // bập bênh, xích đu, đu quay ngựa gỗ, cầu trượt
  buildCarousel(-55, 15);
  buildSwings(-54, 25);
  buildSeesaw(-54, 32);
  buildSlide(-58, 37);
  // sân bóng đá nhỏ + 2 khung thành + quả bóng đẩy/đá được (chỉ phía máy mình)
  slab(PITCH.x0, PITCH.x1, PITCH.z0, PITCH.z1, 0.014, new THREE.MeshStandardMaterial({ map: canvasTex(pitchCanvas()), roughness: 0.9 }));
  const board = fmat(0xf2ead8, 0.7);
  for (const [bx0, bx1, bz0, bz1] of [[PITCH.x0, PITCH.x0 + 0.2, PITCH.z0, PITCH.z1], [PITCH.x1 - 0.2, PITCH.x1, PITCH.z0, PITCH.z1],
    [PITCH.x0, PITCH.gx - 1.8, PITCH.z0 - 0.2, PITCH.z0], [PITCH.gx + 1.8, PITCH.x1, PITCH.z0 - 0.2, PITCH.z0],
    [PITCH.x0, PITCH.gx - 1.8, PITCH.z1, PITCH.z1 + 0.2], [PITCH.gx + 1.8, PITCH.x1, PITCH.z1, PITCH.z1 + 0.2]]) {
    PLATFORMS.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, top: 0.25 }); mbox(bx1 - bx0, 0.25, bz1 - bz0, (bx0 + bx1) / 2, 0.125, (bz0 + bz1) / 2, board);
  }
  const white = fmat(0xffffff, 0.4), net = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  for (const [zl, d] of [[PITCH.z0, -1], [PITCH.z1, 1]]) {
    const gx = PITCH.gx, m = PITCH.mouth, zb = zl + d * PITCH.depth;
    for (const s of [-1, 1]) { rod(scene, [gx + s * m, 0, zl], [gx + s * m, 1.25, zl], 0.05, white); rod(scene, [gx + s * m, 0, zb], [gx + s * m, 0.9, zb], 0.04, white); rod(scene, [gx + s * m, 1.25, zl], [gx + s * m, 0.9, zb], 0.04, white); }
    rod(scene, [gx - m, 1.25, zl], [gx + m, 1.25, zl], 0.05, white); rod(scene, [gx - m, 0.9, zb], [gx + m, 0.9, zb], 0.04, white);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * m, 0.9), net); back.position.set(gx, 0.45, zb); scene.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * m, PITCH.depth), net); top.rotation.x = -H2; top.position.set(gx, 1.07, (zl + zb) / 2); scene.add(top);
    for (const s of [-1, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.depth, 1.1), net); sd.rotation.y = H2; sd.position.set(gx + s * m, 0.55, (zl + zb) / 2); scene.add(sd); }
    BLOCKS.push({ x0: gx - m - 0.2, x1: gx + m + 0.2, z0: Math.min(zl, zb) - 0.05, z1: Math.max(zl, zb) + 0.05 });
  }
  const bc = document.createElement("canvas"); bc.width = bc.height = 128; { const g = bc.getContext("2d"); g.fillStyle = "#f6f6f6"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#222";
    for (const [x, y] of [[20, 24], [64, 20], [104, 28], [36, 70], [88, 66], [14, 108], [60, 104], [110, 112]]) { g.beginPath(); g.arc(x, y, 14, 0, PI * 2); g.fill(); } }
  BALL.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.R, 14, 10), new THREE.MeshStandardMaterial({ map: canvasTex(bc), roughness: 0.55 }));
  BALL.mesh.position.set(BALL.x, BALL.y, BALL.z); BALL.mesh.castShadow = true; scene.add(BALL.mesh);
  signBoard(-33.6, 5.4, H2, 2.3, 1.55, [
    { text: "KHU VUI CHƠI", size: 46, weight: 700, color: GOLD_TXT, gap: 8 },
    { text: "Đi vào quả bóng để đá · Leo bậc thang rồi đi xuống dốc để trượt · Lại gần ghế, xích đu, đu quay, bập bênh rồi nhấn E để ngồi", size: 26, font: UI_FONT, color: "#e8dcc4" },
  ], { ppm: 220 });
  for (const z of [29.5, 38.5]) bench(-33.0, z, -H2);
  bench(-48.5, 21, H2); bench(-60.2, 25, H2);
  for (const [tx, tz] of [[-60.6, 7], [-60.6, 21], [-60.6, 31], [-49, 5.2], [-45, 43.1], [-55, 43.1], [-37, 4.9], [-33.4, 43.1]]) TREE_SPOTS.push([tx, tz]);
  fence(-62.2, 3.6, -30.8, 3.6); fence(-62.2, 3.6, -62.2, 44.2); fence(-62.2, 44.2, -30.8, 44.2);
}
function buildCarousel(cx, cz) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.3, 32), fmat(0xb08968, 0.7)); base.position.set(cx, 0.15, cz); base.receiveShadow = true; scene.add(base);
  const rot = new THREE.Group(); rot.position.set(cx, 0.3, cz); scene.add(rot); anims.push((t) => { rot.rotation.y = t * 0.5; });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.08, 28), fmat(0xf4e3c1, 0.6)); floor.position.y = 0.04; rot.add(floor);
  rod(rot, [0, 0, 0], [0, 3.0, 0], 0.14, M.gold);
  const sc = document.createElement("canvas"); sc.width = 192; sc.height = 32; { const g = sc.getContext("2d"); for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#fff3dd" : "#d62b3a"; g.fillRect(i * 16, 0, 16, 32); } }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.15, 24, 1), new THREE.MeshStandardMaterial({ map: canvasTex(sc), roughness: 0.6 })); roof.position.y = 3.55; rot.add(roof);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.16, 24), M.gold); rim.position.y = 2.95; rot.add(rim);
  for (let k = 0; k < 12; k++) { const a = k / 12 * PI * 2; mbox(0.14, 0.14, 0.14, Math.cos(a) * 3.35, 2.82, Math.sin(a) * 3.35, M.lamp, false, rot); }
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * PI * 2, hx = Math.cos(a) * 2.0, hz = Math.sin(a) * 2.0, col = fmat(FUN[k], 0.5);
    rod(rot, [hx, 0.05, hz], [hx, 2.9, hz], 0.03, M.gold);
    const h = new THREE.Group(); h.position.set(hx, 1.0, hz); h.rotation.y = -a; rot.add(h);
    mbox(0.32, 0.4, 0.95, 0, 0, 0, col, false, h); mbox(0.18, 0.46, 0.2, 0, 0.32, 0.4, col, false, h); mbox(0.2, 0.2, 0.34, 0, 0.58, 0.55, col, false, h); mbox(0.06, 0.34, 0.06, 0, -0.02, -0.52, M.dark, false, h);
    for (const [lx, lz] of [[-0.1, 0.3], [0.1, 0.3], [-0.1, -0.3], [0.1, -0.3]]) mbox(0.08, 0.32, 0.08, lx, -0.34, lz, col, false, h);
    anims.push((t) => { h.position.y = 1.0 + Math.sin(t * 2.4 + k * 1.1) * 0.25; });
    addSeat(h, 0, 0.2, -0.05, PI, "Cưỡi ngựa đu quay", "attractions");
  }
  CIRCLES.push([cx, cz, 3.2]);
}
function buildSwings(cx, cz) {
  const frame = fmat(0xd62b3a, 0.5);
  rod(scene, [cx - 2.4, 2.7, cz], [cx + 2.4, 2.7, cz], 0.07, frame);
  for (const s of [-1, 1]) for (const dz of [-0.9, 0.9]) { rod(scene, [cx + s * 2.4, 2.7, cz], [cx + s * 2.4, 0, cz + dz], 0.06, frame); CIRCLES.push([cx + s * 2.4, cz + dz, 0.3]); }
  [-1, 1].forEach((s, k) => {
    const piv = new THREE.Group(); piv.position.set(cx + s * 0.9, 2.7, cz); scene.add(piv);
    for (const dx of [-0.22, 0.22]) rod(piv, [dx, 0, 0], [dx, -2.0, 0], 0.012, M.dark);
    mbox(0.56, 0.06, 0.22, 0, -2.04, 0, fmat(FUN[k * 3 + 2], 0.5), false, piv);
    anims.push((t) => { piv.rotation.x = Math.sin(t * 1.7 + k * 1.3) * 0.45; });
    addSeat(piv, 0, -2.01, 0, 0, "Ngồi xích đu", "attractions");
  });
}
function buildSeesaw(cx, cz) {
  mbox(0.34, 0.55, 0.5, cx, 0.275, cz, fmat(0x4361ee, 0.5)); CIRCLES.push([cx, cz, 0.6]);
  const pl = new THREE.Group(); pl.position.set(cx, 0.6, cz); scene.add(pl);
  mbox(3.6, 0.1, 0.4, 0, 0, 0, fmat(0xffd166, 0.5), false, pl);
  for (const s of [-1, 1]) { mbox(0.06, 0.28, 0.4, s * 1.4, 0.19, 0, M.dark, false, pl); mbox(0.3, 0.05, 0.36, s * 1.65, 0.07, 0, fmat(0xe63946, 0.5), false, pl); }
  anims.push((t) => { pl.rotation.z = Math.sin(t * 1.3) * 0.2; });
  for (const s of [-1, 1]) addSeat(pl, s * 1.62, 0.1, 0, s * H2, "Ngồi bập bênh", "attractions");
}
// cầu trượt: bậc thang (mỗi bậc cao 0.3 m, đi bộ lên được) -> sàn tháp cao 1.8 m -> dốc 14 bậc nhỏ 0.12 m đi xuống (và trượt kiểu "đi xuống")
function buildSlide(cx, cz) {
  const colA = fmat(0x2a9d8f, 0.5), colB = fmat(0xffd166, 0.5);
  const tx0 = cx - 1, tx1 = cx + 1, tz0 = cz, tz1 = cz + 2, TOP = 1.8;
  PLATFORMS.push({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, top: TOP }); mbox(2, TOP - 0.06, 2, cx, (TOP - 0.06) / 2, cz + 1, colA, true); mbox(2.1, 0.06, 2.1, cx, TOP - 0.03, cz + 1, colB, true);
  for (const [px, pz] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) rod(scene, [px, TOP, pz], [px, TOP + 1.4, pz], 0.05, M.metal);
  mbox(2.2, 0.12, 2.2, cx, TOP + 1.45, cz + 1, fmat(0xe63946, 0.5));
  for (let i = 1; i <= 5; i++) { const z0 = tz1 + (5 - i) * 0.5; PLATFORMS.push({ x0: tx0, x1: tx1, z0, z1: z0 + 0.5, top: 0.3 * i }); mbox(2, 0.3 * i, 0.5, cx, 0.15 * i, z0 + 0.25, i % 2 ? colB : colA, true); }
  const N = 14, L = 0.32, zEnd = tz0 - N * L;
  for (let j = 0; j < N; j++) PLATFORMS.push({ x0: cx - 0.6, x1: cx + 0.6, z0: tz0 - (j + 1) * L, z1: tz0 - j * L, top: TOP - 0.12 * (j + 0.5) });
  const ang = Math.atan2(TOP, tz0 - zEnd), len = Math.hypot(TOP, tz0 - zEnd);
  const ramp = new THREE.Group(); ramp.position.set(cx, TOP / 2 - 0.04, (tz0 + zEnd) / 2); ramp.rotation.x = -ang; scene.add(ramp);
  mbox(1.2, 0.08, len, 0, 0, 0, fmat(0xcfd8dc, 0.25, 0.5), false, ramp);
  for (const s of [-1, 1]) mbox(0.07, 0.2, len, s * 0.6, 0.1, 0, fmat(0xe63946, 0.5), false, ramp);
  CIRCLES.push([cx, cz + 1, 0.2]);
}

/* ---- khu parkour ---- */
// Các bệ theo thứ tự chạy: [x0, x1, z0, z1, top]; [0] = bệ xuất phát, cuối = bệ đích. Bước nhảy: cao tối đa +0.4 m, khoảng hở 2.0 m (nhảy tới ~3.7 m khi đi bộ)
const PK_COURSE = [
  [33.6, 36.6, 11.2, 14.4, 0.15],
  [38.6, 40.8, 11.8, 14.0, 0.5], [42.8, 45.0, 11.8, 14.0, 0.9], [47.0, 49.2, 11.8, 14.0, 1.3], [51.2, 53.4, 11.8, 14.0, 1.7],
  [55.4, 57.8, 12.0, 14.4, 1.3], [55.6, 57.6, 16.6, 18.8, 1.3], [56.0, 56.8, 18.8, 25.8, 1.3], [55.0, 58.0, 27.6, 30.4, 1.0],
  [51.6, 53.0, 28.3, 29.7, 1.3], [48.0, 49.4, 28.3, 29.7, 1.3], [44.4, 45.8, 28.3, 29.7, 1.3],
  [40.0, 42.4, 30.0, 32.4, 1.3], [36.2, 38.0, 33.4, 35.2, 1.0], [39.6, 41.4, 36.6, 38.4, 1.4], [36.2, 38.0, 39.6, 41.4, 1.8],
  [39.8, 41.6, 42.8, 44.6, 2.0], [43.6, 45.6, 42.8, 44.6, 2.2], [47.6, 50.6, 42.2, 45.2, 2.4],
];
const PK = { st: "idle", t0: 0, until: 0, best: null, shown: 0, start: null, finish: null };
try { const b = parseFloat(localStorage.getItem("museum-pk-best")); if (b > 0) PK.best = b; } catch (e) {}
function buildParkour() {
  slab(31.6, 55.5, 10.4, 46.4, 0.011, fmat(0x3b4a57, 0.9));
  pave(30.4, 37.2, 7.3, 9.7);
  const n = PK_COURSE.length;
  PK_COURSE.forEach(([x0, x1, z0, z1, top], k) => {
    const first = k === 0, last = k === n - 1, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const col = first ? 0x2bb673 : last ? 0xf2b01e : new THREE.Color().setHSL(0.02 + 0.82 * k / (n - 1), 0.72, 0.52).getHex();
    PLATFORMS.push({ x0, x1, z0, z1, top });
    solids.push(mbox(w, top - 0.06, d, cx, (top - 0.06) / 2, cz, fmat(col, 0.55), true));
    solids.push(mbox(w + 0.06, 0.06, d + 0.06, cx, top - 0.03, cz, fmat(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.45).getHex(), 0.4), true));
    if (first) { PK.start = { x0, x1, z0, z1, top }; flatText(cx, top + 0.012, cz, 2.6, 0.9, [{ text: "XUẤT PHÁT", size: 64, weight: 700, color: "#ffffff" }], { bg: "#1f8f5c", borderColor: "#ffffff", ppm: 120 }, -H2); }
    if (last) {
      PK.finish = { x0, x1, z0, z1, top }; flatText(cx, top + 0.012, cz, 2.6, 0.9, [{ text: "ĐÍCH", size: 70, weight: 700, color: "#5a3b00" }], { bg: "#f2b01e", borderColor: "#ffffff", ppm: 120 }, -H2);
      rod(scene, [x1 - 0.25, top, cz], [x1 - 0.25, top + 2.4, cz], 0.04, M.gold);
      const fc = document.createElement("canvas"); fc.width = 128; fc.height = 80; { const g = fc.getContext("2d"); for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#fff"; g.fillRect(i * 16, j * 16, 16, 16); } }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshBasicMaterial({ map: canvasTex(fc), side: THREE.DoubleSide })); fl.position.set(x1 - 0.25, top + 2.1, cz - 0.45); fl.rotation.y = H2; scene.add(fl);
    }
  });
  signBoard(37.9, 8.5, -H2, 2.9, 2.3, [
    { text: "THỬ THÁCH PARKOUR", size: 48, weight: 700, color: GOLD_TXT, gap: 8 },
    { text: "Đứng lên bệ xanh XUẤT PHÁT rồi chạy ra để bắt đầu bấm giờ.", size: 27, font: UI_FONT, color: "#e8dcc4", align: "left", gap: 6 },
    { text: isTouch ? "Chạm nút Nhảy ở góc màn hình để nhảy." : "Nhấn Space để nhảy · giữ Shift để chạy.", size: 27, font: UI_FONT, color: "#e8dcc4", align: "left", gap: 6 },
    { text: "Chạm bệ vàng ĐÍCH trên đỉnh tháp để dừng đồng hồ.", size: 27, font: UI_FONT, color: "#e8dcc4", align: "left", gap: 6 },
    { text: "Rơi xuống đất thì đi bộ về bệ xuất phát để thử lại.", size: 27, font: UI_FONT, color: "#e8dcc4", align: "left" },
  ], { ppm: 200 });
  bench(55.5, 41, -H2); bench(55.5, 36, -H2);
  for (const [tx, tz] of [[61, 6], [61, 17], [61, 29], [61, 41], [56, 46.8], [45, 46.9], [35, 46.9], [58, 5.6], [47, 5.6]]) TREE_SPOTS.push([tx, tz]);
  fence(30.8, 3.6, 62.2, 3.6); fence(62.2, 3.6, 62.2, 48.3); fence(30.8, 48.3, 62.2, 48.3);
}
function updateBall(dt) {
  const B = BALL; if (!B.mesh) return;
  const dx = B.x - player.x, dz = B.z - player.z, d = Math.hypot(dx, dz) || 1e-3;
  if (player.base < UP / 2 && d < 0.65 && player.jy < B.y + 0.6) { // chạm bóng: đẩy ra xa, chạy nhanh thì đá mạnh hơn
    const nx = dx / d, nz = dz / d, sp = player.moving ? (player.running ? 10 : 5.5) : 0;
    const push = Math.max(0, sp * 1.3 + 1.2 - (B.vx * nx + B.vz * nz));
    B.vx += nx * push; B.vz += nz * push; B.vy = Math.max(B.vy, 0.5 + push * 0.12);
    B.x = player.x + nx * 0.65; B.z = player.z + nz * 0.65;
  }
  if (Math.abs(B.vx) + Math.abs(B.vz) + Math.abs(B.vy) < 0.01 && B.y <= B.R + 0.001) return;
  B.x += B.vx * dt; B.z += B.vz * dt;
  const k = Math.exp(-1.3 * dt); B.vx *= k; B.vz *= k;
  B.vy -= 9.8 * dt; B.y += B.vy * dt; if (B.y < B.R) { B.y = B.R; B.vy = Math.abs(B.vy) > 0.8 ? -B.vy * 0.55 : 0; }
  // tường sân: hai bên và hai đầu (trừ cửa khung thành, nơi bóng vào được tới lưới)
  const r = B.R, P = PITCH, gl = P.gx - P.mouth + r, gr = P.gx + P.mouth - r;
  const inNet = B.z < P.z0 || B.z > P.z1; // đã qua vạch cầu môn: giữ bóng trong lưới
  if (inNet) { if (B.x < gl) { B.x = gl; B.vx = Math.abs(B.vx) * 0.6; } else if (B.x > gr) { B.x = gr; B.vx = -Math.abs(B.vx) * 0.6; } }
  else if (B.x < P.x0 + 0.2 + r) { B.x = P.x0 + 0.2 + r; B.vx = Math.abs(B.vx) * 0.6; } else if (B.x > P.x1 - 0.2 - r) { B.x = P.x1 - 0.2 - r; B.vx = -Math.abs(B.vx) * 0.6; }
  const mouth = B.x >= gl && B.x <= gr, zLo = mouth ? P.z0 - P.depth + r : P.z0 + r, zHi = mouth ? P.z1 + P.depth - r : P.z1 - r;
  if (B.z < zLo) { B.z = zLo; B.vz = Math.abs(B.vz) * 0.6; } else if (B.z > zHi) { B.z = zHi; B.vz = -Math.abs(B.vz) * 0.6; }
  B.mesh.position.set(B.x, B.y, B.z); B.mesh.rotation.x += B.vz * dt / r; B.mesh.rotation.z -= B.vx * dt / r;
}
// đồng hồ parkour: bắt đầu khi rời bệ xuất phát, dừng khi đứng trên bệ đích; rơi xuống đất thì hủy lượt
function updateParkour(now) {
  const el = $("pk-timer"); if (!el || !PK.start || !started) return;
  const inR = (r) => player.x >= r.x0 && player.x <= r.x1 && player.z >= r.z0 && player.z <= r.z1;
  const S = PK.start, Fn = PK.finish, onGround0 = player.base < UP / 2;
  const inArea = onGround0 && player.x > 30.8 && player.x < 62 && player.z > 4;
  if (!inArea && PK.st !== "idle") PK.st = "idle";
  if (PK.st === "idle") { if (inArea && inR(S) && player.grounded && Math.abs(player.jy - S.top) < 0.06) PK.st = "armed"; }
  else if (PK.st === "armed") { if (!inR(S)) { PK.st = "run"; PK.t0 = now; } }
  else if (PK.st === "run") {
    if (inR(Fn) && player.grounded && Math.abs(player.jy - Fn.top) < 0.06) {
      PK.st = "done"; PK.time = (now - PK.t0) / 1000; PK.until = now + 7000; PK.record = !PK.best || PK.time < PK.best;
      if (PK.record) { PK.best = PK.time; try { localStorage.setItem("museum-pk-best", String(PK.time)); } catch (e) {} }
    } else if (player.grounded && player.jy < 0.05 && now - PK.t0 > 350) { PK.st = "fail"; PK.until = now + 4500; }
  } else if (now > PK.until) PK.st = "idle";
  const show = PK.st !== "idle"; if (el.hidden === show) el.hidden = !show;
  if (!show || now - PK.shown < 50) return; PK.shown = now;
  const fmt = (s) => s.toFixed(2) + " s", best = PK.best ? "Kỷ lục: " + fmt(PK.best) : "Chưa có kỷ lục";
  const note = { armed: "Sẵn sàng · chạy hoặc nhảy ra khỏi bệ để bắt đầu", run: best, done: (PK.record ? "Kỷ lục mới! " : "Hoàn thành! ") + best, fail: "Rơi xuống đất · về bệ xuất phát để thử lại" }[PK.st];
  $("pk-time").textContent = PK.st === "run" ? fmt((now - PK.t0) / 1000) : PK.st === "done" ? fmt(PK.time) : PK.st === "fail" ? "Rơi rồi!" : "0.00 s";
  $("pk-note").textContent = note; el.dataset.st = PK.st;
}

function propagandaBannerCanvas(kind) {
  const W = 400, H = 880;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");

  // Nền đỏ thắm trang nghiêm với sắc độ chuẩn cờ Đảng / cờ Tổ quốc
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#ba171d");
  bg.addColorStop(0.5, "#9e0f14");
  bg.addColorStop(1, "#7f0a0e");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Viền vàng kim đôi trang trọng
  g.strokeStyle = "#e8c558";
  g.lineWidth = 6;
  g.strokeRect(16, 16, W - 32, H - 32);

  g.strokeStyle = "rgba(255, 235, 150, 0.75)";
  g.lineWidth = 2;
  g.strokeRect(26, 26, W - 52, H - 52);

  // Hoa văn góc tinh tế
  const corn = 22;
  for (const [cx, cy, sx, sy] of [[26, 26, 1, 1], [W - 26, 26, -1, 1], [26, H - 26, 1, -1], [W - 26, H - 26, -1, -1]]) {
    g.beginPath();
    g.arc(cx + sx * 11, cy + sy * 11, 4, 0, Math.PI * 2);
    g.fillStyle = "#ffcd00";
    g.fill();
    g.beginPath();
    g.moveTo(cx, cy + sy * corn);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * corn, cy);
    g.strokeStyle = "#ffe68c";
    g.lineWidth = 3.5;
    g.stroke();
  }

  // Biểu tượng phía trên: Búa Liềm hoặc Ngôi Sao Vàng
  g.save();
  g.translate(W / 2, 122);
  g.fillStyle = "#ffcd00";
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;

  if (kind === "party") {
    // Biểu tượng Búa Liềm vàng chuẩn theo Quy định số 99-QĐ/TW của Ban Bí thư
    const targetH = 105;
    const aspect = (BUA_LIEM_IMG.naturalWidth && BUA_LIEM_IMG.naturalHeight) ? (BUA_LIEM_IMG.naturalWidth / BUA_LIEM_IMG.naturalHeight) : (440 / 384);
    const targetW = targetH * aspect;
    if (BUA_LIEM_IMG.complete && BUA_LIEM_IMG.naturalWidth > 0) {
      g.drawImage(BUA_LIEM_IMG, -targetW / 2, -targetH / 2, targetW, targetH);
    }
  } else {
    // Ngôi sao vàng 5 cánh rực rỡ
    starPath(g, 0, 0, 56, 22);
    g.fill();
  }
  g.restore();

  // Dải phân cách hoa văn mạ vàng
  g.strokeStyle = "rgba(255, 215, 0, 0.85)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(W / 2 - 90, 204);
  g.lineTo(W / 2 + 90, 204);
  g.stroke();
  g.fillStyle = "#ffcd00";
  g.beginPath();
  g.arc(W / 2, 204, 4.5, 0, Math.PI * 2);
  g.fill();

  // Khẩu hiệu trang trọng theo cặp chuẩn, cỡ chữ to rõ dễ đọc
  let lines = [];
  if (kind === "party") {
    lines = [
      { text: "ĐẢNG CỘNG SẢN", size: 40, weight: 800, gap: 14 },
      { text: "VIỆT NAM", size: 48, weight: 900, gap: 26 },
      { text: "QUANG VINH", size: 38, weight: 800, gap: 14 },
      { text: "MUÔN NĂM!", size: 42, weight: 900, gap: 0 }
    ];
  } else if (kind === "uncle_ho") {
    lines = [
      { text: "CHỦ TỊCH", size: 34, weight: 700, gap: 12 },
      { text: "HỒ CHÍ MINH", size: 48, weight: 900, gap: 22 },
      { text: "VĨ ĐẠI SỐNG MÃI", size: 34, weight: 800, gap: 16 },
      { text: "TRONG SỰ NGHIỆP", size: 32, weight: 700, gap: 14 },
      { text: "CỦA CHÚNG TA!", size: 34, weight: 800, gap: 0 }
    ];
  } else {
    lines = [
      { text: "NƯỚC CỘNG HÒA", size: 35, weight: 700, gap: 12 },
      { text: "XÃ HỘI CHỦ NGHĨA", size: 33, weight: 800, gap: 18 },
      { text: "VIỆT NAM", size: 48, weight: 900, gap: 22 },
      { text: "MUÔN NĂM!", size: 42, weight: 900, gap: 0 }
    ];
  }

  const textStartY = 246;
  const availHeight = (H - 45) - textStartY;
  let totalH = 0;
  for (const l of lines) totalH += l.size * 1.32 + (l.gap || 0);
  let curY = textStartY + Math.max(0, (availHeight - totalH) / 2);

  g.textAlign = "center";
  g.textBaseline = "top";
  for (const l of lines) {
    g.font = `${l.weight || 700} ${l.size}px ${SERIF}`;
    // Bóng chữ tạo chiều sâu khối nổi
    g.fillStyle = "rgba(35, 3, 5, 0.9)";
    g.fillText(l.text, W / 2 + 2, curY + 3);
    // Chữ màu vàng kim nổi bật
    g.fillStyle = "#ffe785";
    g.fillText(l.text, W / 2, curY);
    curY += l.size * 1.32 + (l.gap || 0);
  }

  return c;
}

/* ---- trang trí: dây đèn, băng rôn, biển chỉ đường, bồn hoa; cây + hàng rào + hoa dựng bằng InstancedMesh ---- */
function buildDecor() {
  // dây đèn màu dọc lối chính (nối các cột đèn x=±3.4, z=18…54) + dây ngang qua lối
  const pts = [], bulbs = [], strand = (a, b, sag, n) => {
    for (let i = 0; i < n; i++) for (const u of [i / n, (i + 1) / n]) pts.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u);
    for (let i = 1; i < n; i++) { const u = i / n; bulbs.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u) - 0.08, a[2] + (b[2] - a[2]) * u]); }
  };
  for (let z = 18; z <= 54; z += 9) {
    if (z < 54) for (const s of [-1, 1]) strand([s * 3.4, 3.45, z], [s * 3.4, 3.45, z + 9], 0.45, 12);
    strand([-3.4, 3.45, z], [3.4, 3.45, z], 0.5, 10);
  }
  const wire = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: 0x222222 }));
  scene.add(wire);
  const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
  bulbs.forEach((p, i) => { bm.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])); bm.setColorAt(i, col.setHex([0xffd166, 0xff8fab, 0xfff3d0, 0x7ee0c3, 0xffb347][i % 5])); });
  bm.instanceColor.needsUpdate = true; scene.add(bm);

  // băng rôn đỏ chữ vàng dọc quảng trường trước toà nhà: khung 2 cột hai bên, không che chữ, biểu tượng chuẩn
  const bannerConfigs = [
    { pos: [-15.6, 7.6], kind: "fatherland" }, // Cánh trái ngoài: Nước Cộng hoà XHCN Việt Nam muôn năm
    { pos: [-10.8, 7.6], kind: "party" },      // Cánh trái trong: Đảng Cộng sản Việt Nam quang vinh muôn năm
    { pos: [10.8, 7.6], kind: "party" },       // Cánh phải trong: Đảng Cộng sản Việt Nam quang vinh muôn năm
    { pos: [15.6, 7.6], kind: "uncle_ho" },    // Cánh phải ngoài: Chủ tịch Hồ Chí Minh vĩ đại sống mãi...
  ];
  const bannerTexMap = {
    party: canvasTex(propagandaBannerCanvas("party")),
    fatherland: canvasTex(propagandaBannerCanvas("fatherland")),
    uncle_ho: canvasTex(propagandaBannerCanvas("uncle_ho")),
  };

  const BW = 1.34, BH = 2.92, BY = 2.56;
  const postOff = BW / 2 + 0.055; // 0.725
  for (const { pos: [x, z], kind } of bannerConfigs) {
    // Hai cột trụ hai bên khung (không đè lên băng rôn ở giữa)
    for (const sx of [-1, 1]) {
      const px = x + sx * postOff;
      mbox(0.08, 4.3, 0.08, px, 2.15, z, M.dark);
      mbox(0.24, 0.16, 0.24, px, 0.08, z, M.graniteDark);
      mbox(0.20, 0.03, 0.20, px, 0.175, z, M.gold);
      mbox(0.12, 0.09, 0.12, px, 4.34, z, M.gold);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), M.gold);
      fin.position.set(px, 4.44, z);
      scene.add(fin);
    }
    // Thanh xà ngang mạ vàng trên và dưới căng giữ băng rôn
    mbox(postOff * 2 + 0.14, 0.07, 0.07, x, 4.05, z, M.gold);
    mbox(postOff * 2 + 0.14, 0.05, 0.05, x, 1.07, z, M.gold);
    for (const rx of [-BW * 0.35, BW * 0.35]) {
      mbox(0.024, 0.07, 0.03, x + rx, 4.02, z, M.gold);
    }

    // Tấm phông nền dày cứng giữa 2 mặt
    box(BW, BH, 0.016, x, BY, z, M.ochreDark);
    const tex = bannerTexMap[kind];
    // Dùng MeshBasicMaterial để ban đêm bảng không bị tối đen, giữ độ sáng rõ như hộp đèn pano cổ động
    const bMat = new THREE.MeshBasicMaterial({ map: tex });
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), bMat);
    placeAt(b1, x, BY, z + 0.012, 0);
    const b2 = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), bMat);
    placeAt(b2, x, BY, z - 0.012, PI);
    CIRCLES.push([x, z, 0.75]);
  }
  // bồn hoa dài trước hiên toà nhà
  for (const s of [-1, 1]) flowerBed(Math.min(s * 4.8, s * 9.4), Math.max(s * 4.8, s * 9.4), 6.3, 7.3);
  // biển chỉ đường (mặt quay về +z, đọc khi đi từ cổng chính vào)
  for (const [x, z] of [[5.4, 19.5], [-5.4, 28.5]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    mbox(0.12, 3.4, 0.12, 0, 1.7, 0, M.dark, false, g); mbox(0.3, 0.14, 0.3, 0, 3.45, 0, M.gold, false, g);
    [["←  Khu vui chơi", "#2a9d8f", 2.95], ["Khu parkour  →", "#e76f51", 2.4], ["Tầng 2 · Phòng ảnh tư liệu  ↑", "#681313", 1.85]].forEach(([t, bg, y]) => {
      const b = textPlane([{ text: t, size: 44, weight: 700, color: "#fff6dc" }], 2.6, 0.46, { bg, borderColor: "#fff6dc", ppm: 160, pad: 0.04 }); b.position.set(0, y, 0.07); g.add(b);
      mbox(2.66, 0.5, 0.06, 0, y, 0.02, M.dark, false, g);
    });
    CIRCLES.push([x, z, 0.35]);
  }
  // chậu cây lớn dưới hành lang tầng 2 của hội trường (cạnh các cửa lên phòng ảnh)
  for (const s of [-1, 1]) {
    const px = s * 10.9, pz = -1.9;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 12), fmat(0x7a3b2a, 0.7)); pot.position.set(px, 0.3, pz); scene.add(pot);
    for (const [ox, oy, oz, r] of [[0, 1.15, 0, 0.55], [0.22, 1.7, 0.1, 0.4], [-0.2, 1.55, -0.12, 0.4]]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), fmat(0x2f6b2f, 0.8, 0)); b.position.set(px + ox, oy, pz + oz); scene.add(b); }
    mbox(0.1, 0.6, 0.1, px, 0.8, pz, M.trunk);
    CIRCLES.push([px, pz, 0.5]);
  }
  // cây trang trí ở hai khu mới: dùng model 3D cây thật có sẵn (models/tree_shade.glb)
  const treeCfg = (window.REAL_MODELS || {}).tree;
  const treeModelUrl = (treeCfg && treeCfg.url) ? treeCfg.url : "models/tree_shade.glb";

  const tg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 7), fmat(0x5b3d26, 0.9, 0), TREE_SPOTS.length);
  const fg = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), fmat(0xffffff, 0.8, 0), TREE_SPOTS.length * 2);
  TREE_SPOTS.forEach(([x, z], i) => {
    tg.setMatrixAt(i, m4.makeTranslation(x, 0.9, z));
    const s = 1.25 + (i % 3) * 0.2;
    fg.setMatrixAt(i * 2, m4.compose(new THREE.Vector3(x, 2.6, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.85, s))); fg.setColorAt(i * 2, col.setHex([0x2f6b2f, 0x3d7d35, 0x4a8a3c][i % 3]));
    fg.setMatrixAt(i * 2 + 1, m4.compose(new THREE.Vector3(x + 0.35, 3.35, z - 0.2), new THREE.Quaternion(), new THREE.Vector3(s * 0.7, s * 0.6, s * 0.7))); fg.setColorAt(i * 2 + 1, col.setHex(0x5a9a46));
    CIRCLES.push([x, z, 0.55]);
  });
  fg.instanceColor.needsUpdate = true; scene.add(tg, fg);

  loadGlbOnce(treeModelUrl).then((src) => {
    scene.remove(tg);
    scene.remove(fg);
    tg.visible = false;
    fg.visible = false;
    const proto = fitModel(src.clone(true), (treeCfg && treeCfg.size) ? treeCfg.size * 0.82 : 6.2, { fit: "height", yOffset: 0.05 });
    centerOnBase(proto);
    TREE_SPOTS.forEach(([x, z], i) => {
      const t = proto.clone(true);
      t.position.set(x, 0, z);
      t.rotation.y = (i * 2.399) % (PI * 2);
      const sc = 0.88 + ((i * 31) % 9) / 32;
      t.scale.setScalar(sc);
      scene.add(t);
    });
  }).catch((e) => console.info("Giữ cây dựng bằng code ở khu trang trí:", e && e.message));
  // hàng rào: cọc dựng bằng InstancedMesh
  const fp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), fmat(0xf2ead8, 0.7), FENCE_POSTS.length);
  FENCE_POSTS.forEach(([x, z], i) => fp.setMatrixAt(i, m4.makeTranslation(x, 0.525, z))); scene.add(fp);
  // hoa: mỗi bông là một quả cầu nhỏ, chung một InstancedMesh
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), FLOWERS.length);
  FLOWERS.forEach(([x, y, z, c], i) => { fl.setMatrixAt(i, m4.makeTranslation(x, y, z)); fl.setColorAt(i, col.setHex(c)); });
  fl.instanceColor.needsUpdate = true; scene.add(fl);
}

/* ================= glass display cases with real artifacts ================= */
function paperTex(bg, ink, title, lines, w, h) {
  const c = document.createElement("canvas"); c.width = Math.round(256 * w); c.height = Math.round(256 * h);
  const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink; let y = 14;
  if (title) { g.font = `700 ${Math.round(c.width / 10)}px ${SERIF}`; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(title, c.width / 2, y, c.width - 16); y += c.width / 8 + 6; g.fillRect(10, y, c.width - 20, 2); y += 8; }
  g.globalAlpha = 0.55;
  for (let i = 0; i < lines; i++) { const lw = (c.width - 24) * (0.6 + 0.4 * rand()); g.fillRect(12, y, lw, 3); y += 9; if (y > c.height - 10) break; }
  g.globalAlpha = 1;
  return new THREE.MeshLambertMaterial({ map: canvasTex(c), side: THREE.DoubleSide });
}
// simple low-poly model for each kind of object (fits in about 0.8 x 0.5 x 0.55, standing on y = 0)
function artifactModel(kind, ex) {
  const g = new THREE.Group();
  const P = (geo, mat, x, y, z, rx, ry, rz) => part(g, geo, mat, x, y, z, rx, ry, rz);
  const L = (c) => lam(c);
  const paper = 0xefe4c6, olive = 0x4f5a37, bamboo = 0xc9a65a, straw = 0xd8bf7a;
  const stand = () => P(bx(0.5, 0.03, 0.25), L(0x2a1c12), 0, 0.12, -0.05, -0.9, 0, 0);
  switch (kind) {
    case "book": P(bx(0.34, 0.07, 0.46), L(0x7a1f1b), 0, 0.035, 0); P(bx(0.32, 0.06, 0.44), L(paper), 0.01, 0.035, 0); break;
    case "diary": { const a = P(bx(0.22, 0.02, 0.3), L(paper), -0.11, 0.06, 0, 0, 0, 0.12); const b = P(bx(0.22, 0.02, 0.3), L(paper), 0.11, 0.06, 0, 0, 0, -0.12); P(bx(0.48, 0.03, 0.32), L(0x5a3a22), 0, 0.03, 0); a.material = paperTex("#efe4c6", "#3a3a6a", null, 18, 1, 1.3); b.material = a.material; break; }
    case "newspaper": case "document": case "ballot": {
      const t = kind === "newspaper" ? (ex.title.split(" ").slice(0, 3).join(" ").toUpperCase()) : null;
      const m = P(new THREE.PlaneGeometry(0.46, 0.6), paperTex(kind === "ballot" ? "#f6f1e3" : "#e9dcb8", "#2a2a2a", t, 40, 1, 1.3), 0, 0.3, 0, -0.35, 0, 0);
      stand(); break; }
    case "flag": {
      P(cyl(0.012, 0.012, 0.75, 6), DECO.gold, -0.3, 0.375, 0);
      const c = document.createElement("canvas"); c.width = 192; c.height = 128; const cg = c.getContext("2d"); cg.fillStyle = "#c8201a"; cg.fillRect(0, 0, 192, 128); starPath(cg, 96, 66, 40, 15); cg.fillStyle = "#f6c51c"; cg.fill();
      P(new THREE.PlaneGeometry(0.5, 0.33, 8, 2), new THREE.MeshLambertMaterial({ map: canvasTex(c), side: THREE.DoubleSide }), -0.04, 0.58, 0);
      P(bx(0.2, 0.03, 0.2), DECO.gold, -0.3, 0.015, 0); break; }
    case "typewriter":
      P(bx(0.46, 0.1, 0.36), L(0x2a2a2c), 0, 0.05, 0); P(bx(0.42, 0.08, 0.16), L(0x333336), 0, 0.12, -0.08, 0.3, 0, 0);
      P(cyl(0.035, 0.035, 0.5, 12), L(0x111111), 0, 0.18, -0.15, 0, 0, H2);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) P(cyl(0.012, 0.012, 0.012, 8), L(0xe8e2d0), -0.17 + k * 0.042 + r * 0.01, 0.105 + r * 0.012, 0.06 + r * 0.035);
      break;
    case "radio": { P(bx(0.46, 0.3, 0.2), L(0x6b4423), 0, 0.15, 0); const gr = P(new THREE.CircleGeometry(0.09, 20), L(0x2a1c12), -0.1, 0.16, 0.101); P(bx(0.14, 0.06, 0.01), L(paper), 0.12, 0.2, 0.101); P(cyl(0.02, 0.02, 0.02, 10), L(0xd4ae55), 0.09, 0.09, 0.105, H2, 0, 0); P(cyl(0.02, 0.02, 0.02, 10), L(0xd4ae55), 0.16, 0.09, 0.105, H2, 0, 0); break; }
    case "hat_conical": P(new THREE.ConeGeometry(0.3, 0.2, 24, 1, true), new THREE.MeshLambertMaterial({ color: straw, side: THREE.DoubleSide }), 0, 0.12, 0); break;
    case "hat_bush": P(cyl(0.12, 0.13, 0.1, 18), L(olive), 0, 0.1, 0); P(cyl(0.25, 0.25, 0.015, 24), L(olive), 0, 0.05, 0); break;
    case "helmet": P(new THREE.SphereGeometry(0.18, 18, 10, 0, PI * 2, 0, PI / 2), L(kind === "helmet" ? bamboo : olive), 0, 0.05, 0); P(cyl(0.25, 0.25, 0.02, 24), L(bamboo), 0, 0.05, 0); break;
    case "sandals": for (const s of [-1, 1]) { P(bx(0.12, 0.025, 0.3), L(0x1d1d1d), s * 0.09, 0.0125, 0, 0, s * 0.1, 0); P(new THREE.TorusGeometry(0.05, 0.012, 6, 12, PI), L(0x1d1d1d), s * 0.09, 0.025, 0.06, 0, H2, 0); P(new THREE.TorusGeometry(0.05, 0.012, 6, 12, PI), L(0x1d1d1d), s * 0.09, 0.025, -0.07, 0, H2, 0); } break;
    case "basket": { const prof = [[0.12, 0], [0.16, 0.1], [0.2, 0.3], [0.22, 0.45], [0.2, 0.47]].map(([x, y]) => new THREE.Vector2(x, y)); P(new THREE.LatheGeometry(prof, 18), new THREE.MeshLambertMaterial({ color: bamboo, side: THREE.DoubleSide }), 0, 0, 0); for (const s of [-1, 1]) P(new THREE.TorusGeometry(0.12, 0.012, 6, 14, PI), L(0x5a3a22), s * 0.09, 0.3, -0.19, 0, 0, H2); break; }
    case "coins": for (let k = 0; k < 7; k++) P(cyl(0.05, 0.05, 0.012, 18), L(k % 2 ? 0xb87333 : 0xc9a24a), (rand() - 0.5) * 0.4, 0.006 + (k % 3) * 0.012, (rand() - 0.5) * 0.3); break;
    case "banknotes": case "coupons":
      for (let k = 0; k < 4; k++) P(new THREE.PlaneGeometry(kind === "coupons" ? 0.2 : 0.34, kind === "coupons" ? 0.14 : 0.16), paperTex(kind === "coupons" ? "#e9e0c2" : ["#c9d6b0", "#d9c3a0", "#b9c7d6", "#d6b9b0"][k], "#3a3a3a", null, 6, 1, 0.5), (k - 1.5) * 0.1, 0.005 + k * 0.004, (k % 2) * 0.08, -H2, 0, (k - 1.5) * 0.15);
      break;
    case "lamp": { const prof = [[0.1, 0], [0.11, 0.03], [0.08, 0.1], [0.04, 0.13], [0.05, 0.18], [0.07, 0.25], [0.04, 0.34]].map(([x, y]) => new THREE.Vector2(x, y)); P(new THREE.LatheGeometry(prof, 18), new THREE.MeshPhongMaterial({ color: 0xd8e8e8, transparent: true, opacity: 0.6, shininess: 100, side: THREE.DoubleSide }), 0, 0, 0); P(cyl(0.1, 0.11, 0.06, 18), L(0x6a5a3a), 0, 0.03, 0); P(new THREE.SphereGeometry(0.02, 8, 6), DECO.bulb, 0, 0.17, 0); break; }
    case "stove": P(new THREE.SphereGeometry(0.25, 14, 8, 0, PI * 2, 0, PI / 2), L(0x7a5a3a), 0, 0, 0); P(bx(0.5, 0.04, 0.1), L(0x5a4030), 0.3, 0.02, 0); P(bx(0.1, 0.05, 0.1), L(0x2a1c12), -0.18, 0.06, 0.18); break;
    case "canteen": { const c2 = P(cyl(0.12, 0.12, 0.08, 20), L(olive), 0, 0.14, 0, H2, 0, 0); c2.scale.set(1, 1, 1.6); P(cyl(0.025, 0.025, 0.05, 10), L(0x222222), 0, 0.28, 0); break; }
    case "bag": P(bx(0.4, 0.28, 0.14), L(olive), 0, 0.14, 0); P(bx(0.4, 0.14, 0.15), L(0x434d2e), 0, 0.22, 0.01, 0.15, 0, 0); break;
    case "camera": P(bx(0.24, 0.14, 0.1), L(0x1d1d1d), 0, 0.07, 0); P(cyl(0.045, 0.05, 0.08, 16), L(0x2a2a2a), 0, 0.07, 0.08, H2, 0, 0); break;
    case "pen": P(cyl(0.012, 0.012, 0.3, 10), L(0x1d1d1d), 0, 0.012, 0, 0, 0, H2); stand(); break;
    case "medal": { P(bx(0.06, 0.12, 0.01), L(0xc8201a), 0, 0.3, 0); const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? 0.04 : 0.09; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } P(new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false }), DECO.gold, 0, 0.17, 0); stand(); break; }
    case "bowl": { const prof = [[0.05, 0], [0.12, 0.02], [0.16, 0.08], [0.17, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)); P(new THREE.LatheGeometry(prof, 20), new THREE.MeshLambertMaterial({ color: 0xe8e2d4, side: THREE.DoubleSide }), 0, 0, 0); break; }
    default: P(bx(0.3, 0.2, 0.3), L(0x8a7a5a), 0, 0.1, 0);
  }
  return g;
}
function buildCase(x, z, ry, ex) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  const P = (geo, mat, px, py, pz, rx) => part(g, geo, mat, px, py, pz, rx);
  P(bx(1.1, 0.95, 0.8), DECO.caseWood, 0, 0.475, 0);
  P(bx(1.14, 0.05, 0.84), DECO.gold, 0, 0.95, 0);
  P(bx(1.0, 0.02, 0.7), DECO.velvet, 0, 0.965, 0);
  const glass = P(bx(1.0, 0.75, 0.7), DECO.glass, 0, 1.35, 0); glass.renderOrder = 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(bx(0.03, 0.75, 0.03), DECO.gold, sx * 0.5, 1.35, sz * 0.35);
  for (const sz of [-1, 1]) P(bx(1.03, 0.03, 0.03), DECO.gold, 0, 1.725, sz * 0.35);
  for (const sx of [-1, 1]) P(bx(0.03, 0.03, 0.73), DECO.gold, sx * 0.5, 1.725, 0);
  P(bx(1.1, 0.07, 0.8), DECO.caseWood, 0, 1.76, 0);
  P(new THREE.PlaneGeometry(0.96, 0.66), DECO.glow, 0, 1.72, 0, H2);
  // label with the real photo on the front of the cabinet: photo left, name + source right
  const lc = document.createElement("canvas"); lc.width = 900; lc.height = 620;
  const ltex = canvasTex(lc);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.69), new THREE.MeshBasicMaterial({ map: ltex }));
  lbl.position.set(0, 0.5, 0.402); g.add(lbl);
  const drawLabel = (img) => {
    const c = lc.getContext("2d"), W = lc.width, H = lc.height;
    c.fillStyle = "#1c1511"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(212,174,85,0.95)"; c.lineWidth = 6; c.strokeRect(10, 10, W - 20, H - 20);
    const px = 30, py = 30, pw = 420, ph = H - 60;
    if (img) { const sc = Math.min(pw / img.width, ph / img.height), dw = img.width * sc, dh = img.height * sc; c.fillStyle = "#0d0a08"; c.fillRect(px, py, pw, ph); c.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh); }
    else { c.fillStyle = "#2a201a"; c.fillRect(px, py, pw, ph); }
    const tx = px + pw + 28, tw = W - tx - 30; let y = 44;
    c.textAlign = "left"; c.textBaseline = "top";
    c.fillStyle = GOLD_TXT; c.font = `600 30px ${UI_FONT}`; for (const l of wrapLines(c, ex.date || "", tw)) { c.fillText(l, tx, y); y += 38; } y += 8;
    let ts = 46; c.font = `700 ${ts}px ${SERIF}`; let tl = wrapLines(c, ex.title, tw);
    while (tl.length > 4 && ts > 30) { ts -= 4; c.font = `700 ${ts}px ${SERIF}`; tl = wrapLines(c, ex.title, tw); }
    c.fillStyle = "#f3ead8"; for (const l of tl) { c.fillText(l, tx, y); y += ts * 1.18; }
    y += 14; c.fillStyle = "#b9ab94"; c.font = `500 24px ${UI_FONT}`; c.fillText("Bấm để xem chi tiết", tx, y);
    if (ex.credit) { c.font = `400 19px ${UI_FONT}`; c.fillStyle = "#9c8f7a"; const cl = wrapLines(c, "Ảnh: " + ex.credit, tw).slice(0, 4); let cy = H - 34 - cl.length * 24; for (const l of cl) { c.fillText(l, tx, cy); cy += 24; } }
    if (y > H - 34 - 4 * 24) textIssue("nhãn tủ kính: chữ chạm dòng nguồn ảnh", ex.title);
    ltex.needsUpdate = true;
  };
  drawLabel(null); if (ex.photo) loadImg(ex.photo).then(drawLabel);
  const m = artifactModel(ex.model, ex); m.position.y = 0.975; g.add(m);
  g.traverse((o) => { if (o.isMesh) { o.userData.ex = ex; interactive.push(o); } });
  CIRCLES.push([x, z, 0.8]);
}
function indoorSign(ex, x, z, ry) {
  const c = document.createElement("canvas"); c.width = 600; c.height = 760;
  const tex = canvasTex(c);
  const g = new THREE.Group(); placeAt(g, x, 0, z, ry);
  part(g, cyl(0.03, 0.04, 1.0, 8), DECO.gold, 0, 0.5, -0.03);
  part(g, cyl(0.16, 0.18, 0.04, 16), DECO.gold, 0, 0.02, -0.03);
  const board = part(g, new THREE.PlaneGeometry(0.82, 1.04), new THREE.MeshBasicMaterial({ map: tex }), 0, 1.45, 0, -0.12, 0, 0);
  const back = part(g, bx(0.86, 1.08, 0.03), DECO.caseWood, 0, 1.45, -0.025, -0.12, 0, 0);
  board.userData.ex = ex; back.userData.ex = ex; interactive.push(board, back);
  CIRCLES.push([x, z, 0.35]);
  const sign = { ex, canvas: c, tex }; drawSign(sign, null);
  if (ex.photo) loadImg(ex.photo).then((im) => drawSign(sign, im));
}
async function loadCases() {
  let list = [];
  try { const r = await fetch("images/tu_kinh/artifacts.json", { cache: "no-store" }); if (r.ok) list = await r.json(); } catch (e) {}
  if (!Array.isArray(list)) list = [];
  const by = {};
  for (const it of list) {
    if (!it || typeof it.title !== "string" || typeof it.room !== "string") continue;
    const ex = { date: it.date || "", title: it.title, text: it.text || "", lesson: it.lesson || "", credit: it.credit || "", model: it.model || "", photo: it.file ? "images/tu_kinh/" + it.file : null };
    (by[it.room] = by[it.room] || []).push(ex);
  }
  // hall: up to four cases on either side of the carpet
  const hallSpots = [[-6.5, -7, H2], [6.5, -7, -H2], [-6.5, -17, H2], [6.5, -17, -H2]];
  (by.hall || []).slice(0, 4).forEach((ex, k) => {
    const [x, z, ry] = hallSpots[k];
    buildCase(x, z, ry, ex);
  });
  // rooms: a row of up to three cases across the middle, signs beside them
  DATA.rooms.forEach((room, i) => {
    const g = ROOM_GEO[i], items = (by["room" + (i + 1)] || []).slice(0, 3);
    if (!items.length) { buildPedestal(room.pedestal, g); return; }
    const f = g.face, nx = Math.sin(f), nz = Math.cos(f), ax = Math.cos(f), az = -Math.sin(f);
    const offs = items.length === 1 ? [0] : items.length === 2 ? [-1.7, 1.7] : [-2.9, 0, 2.9];
    items.forEach((ex, k) => {
      const cx = g.c[0] - nx * 0.6 + ax * offs[k], cz = g.c[1] - nz * 0.6 + az * offs[k];
      buildCase(cx, cz, f, ex);
    });
  });
}

/* ================= lights, sky dome & floating golden dust ================= */
// Nắng trưa nhiệt đới: ánh nắng trực tiếp mạnh, hơi ấm; ánh sáng trời dịu, mặt đất hắt lên màu nâu đất
const hemiLight = new THREE.HemisphereLight(0xb4c9de, 0x5e5240, 0.4);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xffecd2, 1.55);
sun.position.set(38, 54, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 56;
sun.shadow.camera.bottom = -46;
sun.shadow.bias = -0.0004;
scene.add(sun);

let dustPoints = null, dustBase = null;
let daySkyDome = null, nightSkyDome = null, sunSprite = null, moonSprite = null, starsPoints = null;
const nightLights = [];
let isNight = false;
let nightProgress = 0, nightTarget = 0; // 0 = ban ngày, 1 = ban đêm

function toggleDayNight(force, broadcast = true) {
  SFX.ensure();
  if (typeof force === "boolean") nightTarget = force ? 1 : 0;
  else nightTarget = nightTarget > 0.5 ? 0 : 1;
  isNight = nightTarget > 0.5;

  if (broadcast && window.Net && typeof window.Net.broadcastDayNight === "function") {
    window.Net.broadcastDayNight(isNight);
  }
}
window.toggleDayNight = toggleDayNight;

function updateDayNight(dt) {
  if (nightProgress !== nightTarget) {
    const step = dt * 1.5;
    if (Math.abs(nightTarget - nightProgress) <= step) nightProgress = nightTarget;
    else nightProgress += Math.sign(nightTarget - nightProgress) * step;

    const k = nightProgress;
    scene.background.lerpColors(new THREE.Color(SKY), new THREE.Color(0x02050e), k);
    scene.fog.color.lerpColors(new THREE.Color(HORIZON), new THREE.Color(0x040814), k);
    scene.fog.near = THREE.MathUtils.lerp(55, 60, k);
    scene.fog.far = THREE.MathUtils.lerp(290, 850, k);

    hemiLight.intensity = THREE.MathUtils.lerp(0.4, 0.14, k);
    hemiLight.color.lerpColors(new THREE.Color(0xb4c9de), new THREE.Color(0x182844), k);
    hemiLight.groundColor.lerpColors(new THREE.Color(0x5e5240), new THREE.Color(0x0a101b), k);

    sun.intensity = THREE.MathUtils.lerp(1.55, 0.22, k);
    sun.color.lerpColors(new THREE.Color(0xffecd2), new THREE.Color(0x7695c8), k);

    if (daySkyDome) {
      daySkyDome.material.opacity = 1 - k;
      daySkyDome.visible = (k < 0.999);
    }
    if (nightSkyDome) {
      nightSkyDome.material.opacity = k;
      nightSkyDome.visible = (k > 0.001);
    }
    if (sunSprite) {
      sunSprite.material.opacity = 1 - k;
      sunSprite.visible = (k < 0.999);
    }
    if (moonSprite) {
      moonSprite.material.opacity = k;
      moonSprite.visible = (k > 0.001);
    }
    if (starsPoints) {
      starsPoints.material.opacity = k * 0.92;
      starsPoints.visible = (k > 0.01);
    }

    nightLights.forEach((l) => {
      l.intensity = k * (l.userData.baseIntensity || 0.65);
    });
  }

  // Lấp lánh sao đêm khi ở ban đêm
  if (starsPoints && nightProgress > 0.05) {
    const t = performance.now() * 0.002;
    const sizes = starsPoints.geometry.attributes.size;
    if (sizes) {
      const base = starsPoints.geometry.userData.baseSizes;
      if (base) {
        for (let i = 0; i < base.length; i += 4) {
          sizes.array[i] = base[i] * (0.8 + 0.35 * Math.sin(t + i));
        }
        sizes.needsUpdate = true;
      }
    }
  }
}

function buildAtmosphere() {
  // 1. Vòm trời ban ngày (SkyDome)
  const sc = document.createElement("canvas"); sc.width = 64; sc.height = 256;
  const sg = sc.getContext("2d");
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#3a6ea8"); // Đỉnh trời xanh vừa phải
  grad.addColorStop(0.4, "#5f90c2"); // Xanh trời ban ngày
  grad.addColorStop(0.75, "#9ebcd8"); // Tầng khí quyển nhạt dần
  grad.addColorStop(1.0, "#cdd8e0"); // Chân trời mờ hơi nước, trùng màu sương mù
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 256);
  daySkyDome = new THREE.Mesh(
    new THREE.SphereGeometry(550, 24, 16),
    new THREE.MeshBasicMaterial({ map: canvasTex(sc), side: THREE.BackSide, fog: false, transparent: true, opacity: 1 })
  );
  scene.add(daySkyDome);

  // 2. Vòm trời ban đêm (Night SkyDome) sâu thẳm huyền ảo
  const nsc = document.createElement("canvas"); nsc.width = 64; nsc.height = 256;
  const nsg = nsc.getContext("2d");
  const ngrad = nsg.createLinearGradient(0, 0, 0, 256);
  ngrad.addColorStop(0.0, "#010309"); // Đỉnh trời đêm đen tuyền
  ngrad.addColorStop(0.35, "#04091a");
  ngrad.addColorStop(0.7, "#09122c"); // Xanh thẫm huyền bí
  ngrad.addColorStop(1.0, "#0f1938"); // Chân trời đêm
  nsg.fillStyle = ngrad; nsg.fillRect(0, 0, 64, 256);
  nightSkyDome = new THREE.Mesh(
    new THREE.SphereGeometry(548, 24, 16),
    new THREE.MeshBasicMaterial({ map: canvasTex(nsc), side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false })
  );
  nightSkyDome.visible = false;
  scene.add(nightSkyDome);

  // 3. Bầu trời 850 ngôi sao lấp lánh ban đêm
  const starCount = 850;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const baseSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.12);
    const r = 540;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const bright = 0.65 + Math.random() * 0.35;
    const isBlue = Math.random() < 0.25, isWarm = Math.random() < 0.2;
    starCol[i * 3] = isBlue ? bright * 0.85 : bright;
    starCol[i * 3 + 1] = isBlue ? bright * 0.95 : (isWarm ? bright * 0.9 : bright);
    starCol[i * 3 + 2] = isBlue ? bright * 1.15 : (isWarm ? bright * 0.75 : bright);
    baseSizes[i] = starSizes[i] = 1.4 + Math.random() * 1.8;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));
  starGeo.userData.baseSizes = baseSizes;
  const starMat = new THREE.PointsMaterial({
    size: 1.8, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  starsPoints = new THREE.Points(starGeo, starMat);
  starsPoints.visible = false;
  scene.add(starsPoints);

  // 4. Đĩa mặt trời & Halo ánh nắng ấm áp ban ngày
  const hc = document.createElement("canvas"); hc.width = hc.height = 128;
  const hg = hc.getContext("2d");
  hg.clearRect(0, 0, 128, 128);
  const rg = hg.createRadialGradient(64, 64, 4, 64, 64, 62);
  rg.addColorStop(0, "rgba(255,252,235,1)");
  rg.addColorStop(0.25, "rgba(255,235,175,0.65)");
  rg.addColorStop(1, "rgba(255,220,140,0)");
  hg.fillStyle = rg;
  hg.beginPath(); hg.arc(64, 64, 62, 0, Math.PI * 2); hg.fill();
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(hc), transparent: true, opacity: 1, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunSprite.position.set(85, 135, 100);
  sunSprite.scale.set(42, 42, 1);
  scene.add(sunSprite);

  // 5. Mặt trăng & ánh trăng đêm thanh khiết (đảm bảo hoàn toàn không lộ viền/ô vuông khi trời sáng)
  const mc = document.createElement("canvas"); mc.width = mc.height = 128;
  const mg = mc.getContext("2d");
  mg.clearRect(0, 0, 128, 128);
  const mrg = mg.createRadialGradient(64, 64, 12, 64, 64, 60);
  mrg.addColorStop(0, "rgba(255,255,245,1)");
  mrg.addColorStop(0.3, "rgba(230,240,255,0.75)");
  mrg.addColorStop(0.65, "rgba(180,210,255,0.22)");
  mrg.addColorStop(1, "rgba(160,190,255,0)");
  mg.fillStyle = mrg;
  mg.beginPath(); mg.arc(64, 64, 60, 0, Math.PI * 2); mg.fill();
  mg.fillStyle = "#ffffff";
  mg.beginPath(); mg.arc(64, 64, 20, 0, Math.PI * 2); mg.fill();
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(mc), transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moonSprite.position.set(-65, 115, -125);
  moonSprite.scale.set(30, 30, 1);
  moonSprite.visible = false; // Mặc định ban ngày ẩn hoàn toàn, không render sprite
  scene.add(moonSprite);

  // 6. Đèn lồng & đèn chiếu sáng lối đi sân bảo tàng khi về đêm
  for (let z = 18; z <= 54; z += 12) {
    const pl = new THREE.PointLight(0xffb058, 0, 16, 1.8);
    pl.position.set(0, 3.6, z);
    pl.userData.baseIntensity = 0.65;
    scene.add(pl);
    nightLights.push(pl);
  }
  const facadeL = new THREE.PointLight(0xffddaa, 0, 24, 1.6);
  facadeL.position.set(0, 3.8, 5.0);
  facadeL.userData.baseIntensity = 0.85;
  scene.add(facadeL);
  nightLights.push(facadeL);

  // 7. Hạt bụi nắng vàng lung linh - CHỈ đặt trong đại sảnh nơi ánh sáng chiếu qua giếng trời (không để ngoài trời gây chấm trắng)
  const count = 120;
  const pos = new Float32Array(count * 3);
  dustBase = new Float32Array(count * 4); // x, y, z, phase
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 20;
    const y = 0.8 + rand() * 6.2;
    const z = -23 + rand() * 22; // trong lòng đại sảnh
    pos[i * 3] = dustBase[i * 4] = x;
    pos[i * 3 + 1] = dustBase[i * 4 + 1] = y;
    pos[i * 3 + 2] = dustBase[i * 4 + 2] = z;
    dustBase[i * 4 + 3] = rand() * PI * 2;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dc = document.createElement("canvas"); dc.width = dc.height = 32;
  const dg = dc.getContext("2d");
  const drg = dg.createRadialGradient(16, 16, 1, 16, 16, 15);
  drg.addColorStop(0, "rgba(255,244,200,0.95)");
  drg.addColorStop(1, "rgba(255,220,130,0)");
  dg.fillStyle = drg; dg.fillRect(0, 0, 32, 32);
  const pMat = new THREE.PointsMaterial({
    size: 0.16, map: canvasTex(dc), transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  dustPoints = new THREE.Points(pGeo, pMat);
  scene.add(dustPoints);
}

/* ================= 3D Character Models (nv1 & nv2) & Multiplayer Figures ================= */
const CHAR_TEMPLATES = { nv1: null, nv2: null };

function cloneSkinnedMesh(source) {
  if (window.THREE && THREE.SkeletonUtils && THREE.SkeletonUtils.clone) {
    return THREE.SkeletonUtils.clone(source);
  }
  const cloneLookup = new Map();
  const clone = source.clone();
  function parallelTraverse(a, b, cb) {
    cb(a, b);
    for (let i = 0; i < a.children.length; i++) {
      parallelTraverse(a.children[i], b.children[i], cb);
    }
  }
  parallelTraverse(source, clone, (sNode, cNode) => cloneLookup.set(sNode, cNode));
  source.traverse((sNode) => {
    if (!sNode.isSkinnedMesh) return;
    const cMesh = cloneLookup.get(sNode);
    if (!cMesh) return;
    cMesh.skeleton = sNode.skeleton.clone();
    cMesh.bindMatrix.copy(sNode.bindMatrix);
    cMesh.skeleton.bones = sNode.skeleton.bones.map((b) => cloneLookup.get(b) || b);
    cMesh.bind(cMesh.skeleton, cMesh.bindMatrix);
  });
  return clone;
}

// Clip trong nv1.glb / nv2.glb: Idle, Walk, Run, Clap, Wave, Jump (tạo trong Blender).
const CLIP_SLOTS = ["idle", "walk", "run", "clap", "wave", "jump"];
// Clip Jump: 0–0,58 s là ngồi lấy đà, 0,58–1,13 s là lúc ở trên không. Game nhảy ngay khi bấm,
// nên bắt đầu phát từ đoạn bật lên và kéo giãn cho khớp thời gian bay (2·5,6/15 ≈ 0,75 s).
const JUMP_TAKEOFF = 0.58, JUMP_AIR_SPEED = 0.55 / 0.75;

function setupFigureActions(mixer, animations, key) {
  const acts = {};
  if (!animations || !animations.length) return acts;
  for (const clip of animations) {
    const act = mixer.clipAction(clip);
    acts[clip.name] = act;
    const lower = clip.name.toLowerCase();
    const isPreferred = lower.startsWith(key.toLowerCase());
    for (const slot of CLIP_SLOTS) {
      if (lower.includes(slot) && (!acts[slot] || isPreferred)) acts[slot] = act;
    }
  }
  if (acts.jump) { acts.jump.setLoop(THREE.LoopOnce, 1); acts.jump.clampWhenFinished = true; }
  if (acts.idle) acts.idle.play();
  return acts;
}

// Độ cao nhảy do vật lý của game lo; bỏ chuyển động lên xuống của hông trong clip Jump để không bị nhảy cao gấp đôi.
function stripJumpHipMotion(animations) {
  for (const clip of animations) {
    if (!/jump/i.test(clip.name)) continue;
    clip.tracks = clip.tracks.filter((tr) => !/hips\.position$/.test(tr.name));
  }
}

function prepareCharacterTemplate(gltf, key) {
  const gltfScene = gltf.scene;
  const root = new THREE.Group();
  gltfScene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = false;
      if (obj.material) {
        obj.material.roughness = Math.max(0.4, obj.material.roughness || 0.45);
        obj.material.metalness = Math.min(0.2, obj.material.metalness || 0.05);
      }
    }
  });
  // Model cao ~1,90 m, gốc toạ độ ở giữa hai bàn chân (chân chạm sàn ở Y = 0).
  // Mặt nhân vật hướng +Z; xoay Math.PI quanh Y để hướng về phía trước của game (-Z).
  gltfScene.position.set(0, 0, 0);
  gltfScene.rotation.set(0, Math.PI, 0);
  root.add(gltfScene);
  const animations = gltf.animations || [];
  stripJumpHipMotion(animations);
  CHAR_TEMPLATES[key] = {
    root: root,
    animations: animations
  };
  updatePendingFigures(key);
}

function updatePendingFigures(key) {
  const tmpl = CHAR_TEMPLATES[key];
  if (!tmpl) return;
  const attach = (fig) => {
    if (fig && fig.userData && fig.userData.modelKey === key && fig.userData.fallback) {
      const pivot = fig.userData.pivot;
      if (pivot) {
        pivot.remove(fig.userData.fallback);
        delete fig.userData.fallback;
        const body = cloneSkinnedMesh(tmpl.root);
        pivot.add(body);
        fig.userData.body = body;
        if (tmpl.animations && tmpl.animations.length) {
          const mixer = new THREE.AnimationMixer(body);
          const actions = setupFigureActions(mixer, tmpl.animations, key);
          fig.userData.mixer = mixer;
          fig.userData.actions = actions;
          fig.userData.currentAction = actions.idle || null;
        }
      }
    }
  };
  if (me.fig) attach(me.fig);
  for (const [id, a] of avatars) {
    if (a.fig) attach(a.fig);
  }
}

function loadCharacterModels() {
  if (!THREE.GLTFLoader) return;
  const loader = new THREE.GLTFLoader();
  loader.load("models/nv1.glb?v=3.22", (gltf) => {
    prepareCharacterTemplate(gltf, "nv1");
  }, undefined, (err) => console.warn("Lỗi tải nv1.glb:", err));

  loader.load("models/nv2.glb?v=3.22", (gltf) => {
    prepareCharacterTemplate(gltf, "nv2");
  }, undefined, (err) => console.warn("Lỗi tải nv2.glb:", err));
}

const STICK_GEO = {
  head: new THREE.SphereGeometry(0.2, 16, 12),
  eye: new THREE.SphereGeometry(0.035, 8, 6),
  body: new THREE.CylinderGeometry(0.05, 0.05, 0.62, 8),
  arm: new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8),
  leg: new THREE.CylinderGeometry(0.045, 0.045, 0.82, 8),
  eyeMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

function makeStick(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45, metalness: 0.08 });
  const limb = (geo, len) => { const p = new THREE.Group(); const m = new THREE.Mesh(geo, mat); m.position.y = -len / 2; m.castShadow = true; p.add(m); return p; };
  const head = new THREE.Mesh(STICK_GEO.head, mat); head.position.y = 1.6; head.castShadow = true;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(STICK_GEO.eye, STICK_GEO.eyeMat); e.position.set(0.075 * s, 1.64, -0.18); g.add(e); }
  const body = new THREE.Mesh(STICK_GEO.body, mat); body.position.y = 1.1; body.castShadow = true;
  const armL = limb(STICK_GEO.arm, 0.55), armR = limb(STICK_GEO.arm, 0.55); armL.position.set(-0.05, 1.36, 0); armR.position.set(0.05, 1.36, 0);
  const legL = limb(STICK_GEO.leg, 0.82), legR = limb(STICK_GEO.leg, 0.82); legL.position.set(-0.05, 0.8, 0); legR.position.set(0.05, 0.8, 0);
  g.add(head, body, armL, armR, legL, legR);
  g.userData = { mat, armL, armR, legL, legR };
  poseStick(g, 0, 0, null, 0);
  return g;
}

function poseStick(g, phase, walk, emote, t) {
  const { armL, armR, legL, legR } = g.userData;
  if (!armL) return;
  const sw = Math.sin(phase) * 0.7 * walk;
  legL.rotation.set(sw, 0, -0.12); legR.rotation.set(-sw, 0, 0.12);
  armL.rotation.set(-sw * 0.8, 0, -0.35); armR.rotation.set(sw * 0.8, 0, 0.35);
  if (emote === "wave") { armR.rotation.set(0, 0, 2.5 + Math.sin(t * 14) * 0.35); }
  else if (emote === "clap") { const c = Math.abs(Math.sin(t * 12)); armL.rotation.set(-1.3, 0, -0.5 + c * 0.45); armR.rotation.set(-1.3, 0, 0.5 - c * 0.45); }
}

const SHADOW_BLOB_TEX = (() => {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(10, 8, 6, 0.55)");
  grad.addColorStop(0.5, "rgba(10, 8, 6, 0.28)");
  grad.addColorStop(1, "rgba(10, 8, 6, 0)");
  g.fillStyle = grad;
  g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  return canvasTex(c);
})();

function makeFigure(modelKey, color) {
  const g = new THREE.Group();
  const key = (modelKey === "nv2") ? "nv2" : "nv1";

  // Pivot group used for walking bounce, sway, tilt and emotes
  const pivot = new THREE.Group();
  g.add(pivot);

  let body = null;
  let fallback = null;
  let mixer = null;
  let actions = null;
  if (CHAR_TEMPLATES[key]) {
    const tmpl = CHAR_TEMPLATES[key];
    body = cloneSkinnedMesh(tmpl.root);
    pivot.add(body);
    if (tmpl.animations && tmpl.animations.length) {
      mixer = new THREE.AnimationMixer(body);
      actions = setupFigureActions(mixer, tmpl.animations, key);
    }
  } else {
    fallback = makeStick(color);
    pivot.add(fallback);
  }

  // Soft contact shadow disc under feet
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshBasicMaterial({ map: SHADOW_BLOB_TEX, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  g.userData = {
    modelKey: key,
    color: color,
    pivot: pivot,
    body: body,
    fallback: fallback,
    mixer: mixer,
    actions: actions,
    currentAction: actions ? (actions.idle || null) : null,
  };
  pose(g, 0, 0, null, 0);
  return g;
}

// walk: 0 = đứng, 1 = đi bộ, 2 = chạy (giá trị ở giữa được làm tròn); emote: "wave" | "clap" | null; inAir: boolean
// Tư thế ngồi: gập đùi ra trước, cẳng chân buông xuống, hạ người để hông nằm ngay trên mặt ghế (gốc nhân vật đặt ở mặt ghế).
const SIT = { thigh: 1.45, shin: 1.5, lift: 0.1 };
const _sq = new THREE.Quaternion(), _sx = new THREE.Vector3(1, 0, 0), _sp = new THREE.Vector3(), _sg = new THREE.Vector3();
function applySit(g, sit) {
  const u = g.userData;
  if (!u.body) return;
  if (!u.sitBones) {
    const b = {}; u.body.traverse((o) => { if (!o.isBone) return; const m = /^(thigh|shin|hips)[._]?([LR])?$/i.exec(o.name); if (m) b[m[1].toLowerCase() + (m[2] || "").toUpperCase()] = o; });
    for (const k in b) b[k].userData.rest = b[k].quaternion.clone();
    u.sitBones = b; u.hipH = 0.72;
    if (b.hips) { g.updateMatrixWorld(true); u.hipH = b.hips.getWorldPosition(_sp).y - g.getWorldPosition(_sg).y - u.pivot.position.y; }
  }
  const b = u.sitBones;
  if (sit) {
    for (const [k, ang] of [["thighL", SIT.thigh], ["thighR", SIT.thigh], ["shinL", SIT.shin], ["shinR", SIT.shin]]) if (b[k]) b[k].quaternion.copy(b[k].userData.rest).multiply(_sq.setFromAxisAngle(_sx, ang));
  } else if (u.wasSit) { for (const k of ["thighL", "thighR", "shinL", "shinR"]) if (b[k]) b[k].quaternion.copy(b[k].userData.rest); }
  u.wasSit = sit;
}
function pose(g, phase, walk, emote, t, dt = 0.016, inAir = false, sit = false) {
window.pose = pose;
  if (!g || !g.userData) return;
  if (g.userData.fallback && g.userData.fallback.userData && g.userData.fallback.userData.armL) {
    poseStick(g.userData.fallback, phase, sit ? 0 : walk, emote, t);
    const fb = g.userData.fallback.userData; if (sit) { fb.legL.rotation.x = fb.legR.rotation.x = -1.45; }
    g.userData.fallback.position.y = sit ? -0.42 : 0;
    return;
  }
  const pivot = g.userData.pivot;
  if (!pivot) return;

  // Skeletal animations from rigged GLB
  const mixer = g.userData.mixer;
  const actions = g.userData.actions;
  if (mixer && actions) {
    let target = actions.idle;
    if (sit) {
      if ((emote === "wave" || emote === "clap") && actions[emote]) target = actions[emote];
    } else if (inAir && actions.jump) {
      target = actions.jump;
    } else if ((emote === "wave" || emote === "clap") && actions[emote] && walk < 0.5) {
      target = actions[emote];
    } else if (walk > 1.5 && actions.run) {
      target = actions.run;
      actions.run.timeScale = 1.3;   // khớp nhịp chân với tốc độ chạy 10 m/s
    } else if (walk > 0.08 && actions.walk) {
      target = actions.walk;
      actions.walk.timeScale = 1.5;  // khớp nhịp chân với tốc độ đi 5,5 m/s
    }

    if (target && g.userData.currentAction !== target) {
      const prev = g.userData.currentAction;
      target.reset();
      if (target === actions.jump) { target.time = JUMP_TAKEOFF; target.timeScale = JUMP_AIR_SPEED; }
      target.play();
      if (prev && prev !== target) prev.crossFadeTo(target, target === actions.jump ? 0.1 : 0.22, false);
      g.userData.currentAction = target;
    }
    mixer.update(dt);
  }
  applySit(g, sit);
  if (sit) { pivot.position.y = SIT.lift - (g.userData.hipH || 0.72); pivot.rotation.set(0, 0, 0); return; }

  // Secondary body tilt when moving
  const lean = Math.min(1, walk);
  pivot.position.y = 0;
  pivot.rotation.x = inAir ? 0 : 0.035 * lean;
  pivot.rotation.z = inAir ? 0 : Math.sin(phase) * 0.012 * lean;
  pivot.rotation.y = inAir ? 0 : Math.cos(phase) * 0.018 * lean;
}

function pill(g, x, y, w, h) { const r = h / 2; g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -H2, H2); g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, H2, PI * 1.5); g.closePath(); }
function tagSprite(text, color, width) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 64; const g = c.getContext("2d");
  g.font = `600 27px ${UI_FONT}`;
  const w = Math.min(500, g.measureText(text).width + (color ? 50 : 32));
  g.fillStyle = "rgba(28,21,17,0.88)"; pill(g, (512 - w) / 2, 6, w, 52); g.fill();
  g.strokeStyle = "rgba(201,162,74,0.75)"; g.lineWidth = 1.5; g.stroke();
  if (color) { g.fillStyle = color; g.beginPath(); g.arc((512 - w) / 2 + 21, 32, 7.5, 0, PI * 2); g.fill(); }
  g.fillStyle = "#f3ead8"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 256 + (color ? 9 : 0), 33, w - (color ? 55 : 32));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true }));
  sp.scale.set(width, width / 8, 1); return sp;
}
function disposeSprite(sp) { if (!sp) return; sp.parent && sp.parent.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }

// self figure (visible in third-person)
const me = { color: "#d62828", modelKey: "nv1", name: "", fig: null, bubble: null, bubbleUntil: 0, emote: null, emoteUntil: 0 };
window.me = me;
function setMyFigure() {
  if (me.fig) scene.remove(me.fig);
  me.fig = makeFigure(me.modelKey, me.color); me.fig.visible = false; scene.add(me.fig);
  const tag = tagSprite(me.name || "Bạn", me.color, 2.3); tag.position.y = 2.15; me.fig.add(tag);
}

/* ================= peers ================= */
const avatars = new Map(); // id -> avatar
function ensureAvatar(id) {
  const s = Net.peers.get(id); if (!s) return null;
  const peerModel = s.av === "nv2" ? "nv2" : "nv1";
  let a = avatars.get(id);
  if (!a) {
    a = { fig: makeFigure(peerModel, s.c), modelKey: peerModel, color: s.c, name: "", tag: null, bubble: null, bubbleUntil: 0, emote: null, emoteUntil: 0, x: s.x, z: s.z, y: s.y || 0, yaw: s.yaw, phase: 0, walk: 0, sayAt: s.sayAt, emoteAt: s.emoteAt };
    a.fig.position.set(s.x, s.y || 0, s.z); a.fig.rotation.y = s.yaw; scene.add(a.fig); avatars.set(id, a);
  }
  if (a.modelKey !== peerModel) {
    a.modelKey = peerModel;
    const oldTag = a.tag, oldBubble = a.bubble;
    scene.remove(a.fig);
    a.fig = makeFigure(peerModel, a.color);
    if (oldTag) a.fig.add(oldTag);
    if (oldBubble) a.fig.add(oldBubble);
    a.fig.position.set(a.x, a.y, a.z); a.fig.rotation.y = a.yaw; scene.add(a.fig);
  }
  if (a.color !== s.c) { a.color = s.c; a.name = ""; }
  if (a.name !== s.n) { a.name = s.n; disposeSprite(a.tag); a.tag = tagSprite(s.n, s.c, 2.3); a.tag.position.y = 2.15; a.fig.add(a.tag); }
  if (s.sayAt !== a.sayAt) {
    a.sayAt = s.sayAt;
    if (s.say) {
      if (!s.say.startsWith("__fw__:") && !s.say.startsWith("__dn__:")) {
        showBubble(a, s.say); addLog(s.n, s.say);
      }
    }
  }
  if (s.emote === "sit") a.sit = true; else if (s.emote === "stand") a.sit = false; // vẫy/vỗ tay khi đang ngồi không làm mất tư thế ngồi
  if (s.emoteAt !== a.emoteAt) { a.emoteAt = s.emoteAt; if (EMOTES[s.emote]) { a.emote = s.emote; a.emoteUntil = performance.now() + 1800; showBubble(a, EMOTES[s.emote]); } }
  return a;
}
function removeAvatar(id) {
  const a = avatars.get(id); if (!a) return;
  scene.remove(a.fig); avatars.delete(id);
  if (follow === id) stopFollow();
}
function showBubble(a, text) {
  disposeSprite(a.bubble);
  a.bubble = tagSprite(text, null, 2.6); a.bubble.position.y = 2.45; a.fig.add(a.bubble);
  a.bubbleUntil = performance.now() + 6000;
}

/* ================= picking & info ================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const pickables = () => solids.concat(interactive);
function pick(cx, cy, maxDist) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera); ray.far = maxDist + (thirdPerson ? camDist : 0);
  const hit = ray.intersectObjects(pickables(), false)[0];
  return hit && hit.object.userData.ex ? hit.object.userData.ex : null;
}
/* ================= spatial sound effects & voice audio guide ================= */
const SFX = {
  enabled: true,
  ctx: null,
  stepPhase: 0,
  ensure() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  step(indoor) {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = indoor ? "triangle" : "sine";
    osc.frequency.setValueAtTime(indoor ? 145 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(indoor ? 55 : 42, now + 0.065);
    gain.gain.setValueAtTime(indoor ? 0.045 : 0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.075);
  },
  bell() {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    for (const [f, d] of [[880, 0], [1174.66, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f, now + d);
      g.gain.setValueAtTime(0.06, now + d);
      g.gain.exponentialRampToValueAtTime(0.0008, now + d + 0.45);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + d); o.stop(now + d + 0.46);
    }
  },
  fireworkWhistle(dist = 60) {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const att = Math.max(0.015, Math.min(0.08, (60 / (dist + 30)) * 0.06));
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1250, now + 0.85);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(att, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.85);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.86);
  },
  fireworkBoom(dist = 70, power = 1.0) {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const att = Math.max(0.04, Math.min(0.28, (90 / (dist + 35)) * 0.22 * power));
    const osc = ctx.createOscillator(), oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.55);
    oscGain.gain.setValueAtTime(att, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);
    osc.connect(oscGain); oscGain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.66);
    try {
      const bufSize = Math.floor(ctx.sampleRate * 0.7);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(380, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.65);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(att * 0.85, now);
      nGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.7);
      noise.connect(filter); filter.connect(nGain); nGain.connect(ctx.destination);
      noise.start(now); noise.stop(now + 0.72);
    } catch (e) {}
  },
  fireworkCrackle(dist = 70, count = 12) {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const att = Math.max(0.015, Math.min(0.09, (70 / (dist + 30)) * 0.07));
    for (let k = 0; k < count; k++) {
      const offset = 0.04 + Math.random() * 0.45;
      const t = now + offset;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(750 + Math.random() * 1100, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.025);
      g.gain.setValueAtTime(att * (0.5 + Math.random() * 0.5), t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.035);
    }
  },
};

let currentEx = null, isSpeaking = false;
function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  isSpeaking = false;
  const btn = $("tts-btn"), ic = $("tts-icon"), lb = $("tts-label");
  if (btn) btn.classList.remove("speaking");
  if (ic) ic.textContent = "record_voice_over";
  if (lb) lb.textContent = "Thuyết minh";
}
function toggleSpeech() {
  if (!("speechSynthesis" in window) || !currentEx) return;
  if (isSpeaking) { stopSpeech(); return; }
  window.speechSynthesis.cancel();
  const parts = [currentEx.title, currentEx.date ? "Thời gian: " + currentEx.date : "", currentEx.text, currentEx.lesson ? "Liên hệ bài học: " + currentEx.lesson : ""].filter(Boolean);
  const u = new SpeechSynthesisUtterance(parts.join(". "));
  u.lang = "vi-VN";
  u.rate = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const vi = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("vi"));
  if (vi) u.voice = vi;
  u.onend = () => stopSpeech();
  u.onerror = () => stopSpeech();
  isSpeaking = true;
  $("tts-btn").classList.add("speaking");
  $("tts-icon").textContent = "stop_circle";
  $("tts-label").textContent = "Dừng đọc";
  window.speechSynthesis.speak(u);
}
if ($("tts-btn")) $("tts-btn").addEventListener("click", toggleSpeech);
if ($("sfx-btn")) {
  $("sfx-btn").addEventListener("click", () => {
    SFX.enabled = !SFX.enabled;
    $("sfx-icon").textContent = SFX.enabled ? "volume_up" : "volume_off";
    if (!SFX.enabled) stopSpeech();
  });
}

let infoOpen = false, target = null;
function openInfo(ex) {
  stopSpeech();
  currentEx = ex;
  infoOpen = true;
  if (document.pointerLockElement) {
  document.exitPointerLock();
  }
  for (const k in keys) keys[k] = false;
  const img = $("info-img");
  const src = ex.photo || (ex.img ? "images/" + ex.img + ".jpeg" : "");
  if (src) { img.src = src; img.alt = ex.title; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
  $("info-date").textContent = ex.date || ""; $("info-title").textContent = ex.title;
  $("info-text").textContent = ex.text + (ex.credit ? "\n\nẢnh: " + ex.credit : ""); $("info-lesson").textContent = ex.lesson || "";
  $("lesson").hidden = !ex.lesson;
  $("info").hidden = false; $("prompt").hidden = true; $("close").focus(); updateLookHint();
}
function closeInfo() { stopSpeech(); infoOpen = false; $("info").hidden = true; lockPointer(); updateLookHint(); }
$("close").addEventListener("click", closeInfo);
$("prompt").addEventListener("click", () => { if (elevAction) { if (!elevAction.quiet) SFX.bell(); elevAction(); } else if (target) openInfo(target); });

/* ================= Fireworks Engine (Lễ hội pháo hoa nghệ thuật đằng sau ngôi nhà) ================= */
const FW_PALETTES = {
  gold: { p: [1.0, 0.85, 0.22], s: [1.0, 0.55, 0.08], hex: 0xffd166 },
  ruby: { p: [1.0, 0.12, 0.24], s: [1.0, 0.8, 0.2], hex: 0xff2a4b },
  sapphire: { p: [0.15, 0.52, 1.0], s: [0.75, 0.92, 1.0], hex: 0x3a86ff },
  emerald: { p: [0.08, 0.96, 0.42], s: [0.85, 1.0, 0.35], hex: 0x06d6a0 },
  purple: { p: [0.76, 0.22, 1.0], s: [1.0, 0.4, 0.82], hex: 0x8338ec },
  cyan: { p: [0.05, 0.95, 1.0], s: [0.75, 1.0, 1.0], hex: 0x00f5d4 },
  amber: { p: [1.0, 0.58, 0.05], s: [1.0, 0.92, 0.3], hex: 0xfb8500 },
  turquoise: { p: [0.06, 0.9, 0.72], s: [0.65, 1.0, 0.9], hex: 0x2ec4b6 },
  magenta: { p: [1.0, 0.14, 0.65], s: [1.0, 0.6, 0.85], hex: 0xff006e },
  lime: { p: [0.62, 0.96, 0.12], s: [0.95, 1.0, 0.4], hex: 0x9ef01a },
};

function createSparkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  rg.addColorStop(0.0, "rgba(255,255,255,1.0)");
  rg.addColorStop(0.18, "rgba(255,255,255,0.95)");
  rg.addColorStop(0.4, "rgba(255,235,185,0.65)");
  rg.addColorStop(0.72, "rgba(255,170,70,0.22)");
  rg.addColorStop(1.0, "rgba(255,100,20,0.0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// Pool đèn chớp PointLight phản chiếu vụ nổ lên mái nhà, cây cối và sân
const fwFlashLights = [
  new THREE.PointLight(0xffeedd, 0, 95, 1.5),
  new THREE.PointLight(0xffeedd, 0, 95, 1.5),
  new THREE.PointLight(0xffeedd, 0, 95, 1.5),
];
fwFlashLights.forEach((l) => scene.add(l));
let fwFlashLightIndex = 0;
function triggerFireworkFlash(x, y, z, hex, power = 1.0) {
  const l = fwFlashLights[fwFlashLightIndex % fwFlashLights.length];
  fwFlashLightIndex++;
  l.position.set(x, y, z);
  l.color.setHex(hex || 0xffeedd);
  l.intensity = 4.8 * power;
}

// Particle System
const MAX_FW_PARTICLES = 4000;
const fwGeo = new THREE.BufferGeometry();
const fwPositions = new Float32Array(MAX_FW_PARTICLES * 3);
const fwColors = new Float32Array(MAX_FW_PARTICLES * 3);
fwPositions.fill(-999);
fwGeo.setAttribute("position", new THREE.BufferAttribute(fwPositions, 3));
fwGeo.setAttribute("color", new THREE.BufferAttribute(fwColors, 3));
const fwMat = new THREE.PointsMaterial({
  size: 1.35,
  vertexColors: true,
  map: createSparkTexture(),
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
});
const fwPoints = new THREE.Points(fwGeo, fwMat);
scene.add(fwPoints);

const fwParticles = [];
for (let i = 0; i < MAX_FW_PARTICLES; i++) {
  fwParticles.push({
    active: false,
    x: 0, y: -999, z: 0,
    vx: 0, vy: 0, vz: 0,
    r: 1, g: 1, b: 1,
    tr: 1, tg: 1, tb: 1,
    life: 0, maxLife: 1,
    drag: 0.94,
    gravity: 6.5,
    flicker: false,
    streamer: false,
    splitAt: 0,
    hasSplit: false,
  });
}
let fwParticleHead = 0;

function spawnParticle(x, y, z, vx, vy, vz, rgb1, rgb2, life, drag = 0.94, gravity = 6.5, flicker = false, streamer = false, splitAt = 0) {
  const p = fwParticles[fwParticleHead];
  fwParticleHead = (fwParticleHead + 1) % MAX_FW_PARTICLES;
  p.active = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.r = rgb1[0]; p.g = rgb1[1]; p.b = rgb1[2];
  p.tr = rgb2 ? rgb2[0] : rgb1[0];
  p.tg = rgb2 ? rgb2[1] : rgb1[1];
  p.tb = rgb2 ? rgb2[2] : rgb1[2];
  p.life = 0; p.maxLife = Math.max(0.1, life);
  p.drag = drag; p.gravity = gravity;
  p.flicker = flicker;
  p.streamer = streamer;
  p.splitAt = splitAt;
  p.hasSplit = false;
  return p;
}

// Rocket Projectiles (Quả pháo phóng từ sau nhà lên không trung)
const activeRockets = [];
function launchRocket(x, z, targetY, type, colorKey, speedScale = 1.0) {
  const startY = 0.6;
  const h = Math.max(20, targetY - startY);
  const g = 14;
  const vy = Math.sqrt(2 * g * h) * speedScale;
  const vx = (Math.random() - 0.5) * 3.5;
  const vz = (Math.random() - 0.5) * 2.5;

  const camPos = camera.position;
  const dist = Math.hypot(camPos.x - x, camPos.z - z);
  SFX.fireworkWhistle(dist);

  activeRockets.push({
    x, y: startY, z,
    vx, vy, vz,
    targetY,
    type,
    colorKey,
    trailTimer: 0,
  });
}

// 7 Kiểu pháo hoa nghệ thuật chi tiết:
// 1. Chrysanthemum / Peony (Hoa cúc & Mẫu đơn đại đóa)
function detonateChrysanthemum(x, y, z, colorKey = "gold") {
  const pal = FW_PALETTES[colorKey] || FW_PALETTES.gold;
  triggerFireworkFlash(x, y, z, pal.hex, 1.1);
  const count = 150;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const speed = 19 + Math.random() * 8;
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.cos(phi);
    const vz = speed * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, pal.p, pal.s, 1.8 + Math.random() * 0.6, 0.94, 5.5, true);
  }
}

function detonatePeony(x, y, z, colorKey = "ruby") {
  const pal = FW_PALETTES[colorKey] || FW_PALETTES.ruby;
  triggerFireworkFlash(x, y, z, pal.hex, 1.0);
  const count = 135;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const speed = 17 + Math.random() * 7;
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.cos(phi);
    const vz = speed * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, pal.p, pal.p, 1.7 + Math.random() * 0.4, 0.93, 6.0, false);
  }
}

// 2. Kamuro / Golden Willow (Thác vàng liễu rủ)
function detonateKamuro(x, y, z, count = 180, isGrand = false) {
  const pal = FW_PALETTES.gold;
  triggerFireworkFlash(x, y, z, pal.hex, isGrand ? 1.6 : 1.2);
  const total = isGrand ? 260 : count;
  for (let i = 0; i < total; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / total);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const speed = (isGrand ? 20 : 16) + Math.random() * 8;
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.cos(phi) * 0.85 + (isGrand ? 4 : 2);
    const vz = speed * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, pal.p, [1.0, 0.95, 0.6], 2.8 + Math.random() * 0.8, 0.92, 8.5, true);
  }
}

// 3. Saturn Ring & Double Ring (Vành đai sao Thổ)
function detonateSaturn(x, y, z, colorPair = "cyan_magenta") {
  const [cRing, cCore] = colorPair === "gold_ruby"
    ? [FW_PALETTES.gold, FW_PALETTES.ruby]
    : colorPair === "lime_purple"
    ? [FW_PALETTES.lime, FW_PALETTES.purple]
    : [FW_PALETTES.cyan, FW_PALETTES.magenta];
  triggerFireworkFlash(x, y, z, cRing.hex, 1.1);

  // Outer Ring
  const ringCount = 80;
  const tiltAngle = (Math.random() - 0.5) * 0.6;
  const rotY = Math.random() * Math.PI * 2;
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2;
    const sp = 21 + Math.random() * 2;
    let rx = Math.cos(a) * sp;
    let ry = Math.sin(a) * sp * tiltAngle;
    let rz = Math.sin(a) * sp;
    const vx = rx * Math.cos(rotY) - rz * Math.sin(rotY);
    const vz = rx * Math.sin(rotY) + rz * Math.cos(rotY);
    spawnParticle(x, y, z, vx, ry, vz, cRing.p, cRing.s, 2.0, 0.94, 5.0, true);
  }
  // Inner Core
  const coreCount = 45;
  for (let i = 0; i < coreCount; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / coreCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const sp = 7 + Math.random() * 3;
    const vx = sp * Math.sin(phi) * Math.cos(theta);
    const vy = sp * Math.cos(phi);
    const vz = sp * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, cCore.p, cCore.s, 1.4, 0.92, 5.5, false);
  }
}

// 4. Crackling Palm Tree (Cây cọ nở hoa & Pháo nổ giòn)
function detonatePalm(x, y, z) {
  const pal = FW_PALETTES.amber;
  triggerFireworkFlash(x, y, z, pal.hex, 1.2);
  const arms = 14;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const elev = Math.PI * 0.22 + (Math.random() - 0.5) * 0.15;
    const sp = 26 + Math.random() * 4;
    const vx = Math.cos(a) * Math.cos(elev) * sp;
    const vy = Math.sin(elev) * sp + 3;
    const vz = Math.sin(a) * Math.cos(elev) * sp;
    spawnParticle(x, y, z, vx, vy, vz, pal.p, [1.0, 0.95, 0.8], 1.6, 0.93, 7.5, true, true);
  }
  const camPos = camera.position;
  const dist = Math.hypot(camPos.x - x, camPos.z - z);
  setTimeout(() => SFX.fireworkCrackle(dist, 16), 750);
}

// 5. Crossette / Branching Stars (Chùm sao phân nhánh)
function detonateCrossette(x, y, z, colorKey = "turquoise") {
  const pal = FW_PALETTES[colorKey] || FW_PALETTES.turquoise;
  triggerFireworkFlash(x, y, z, pal.hex, 1.1);
  const count = 16;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const speed = 19;
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.cos(phi);
    const vz = speed * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, pal.p, pal.s, 1.9, 0.94, 6.0, false, false, 0.55);
  }
}

// 6. Vietnam Pride: Cờ đỏ sao vàng
function detonateVietnamStar(x, y, z) {
  triggerFireworkFlash(x, y, z, 0xff2233, 1.4);
  const redPal = FW_PALETTES.ruby, goldPal = FW_PALETTES.gold;
  const count = 140;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const speed = 19 + Math.random() * 6;
    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.cos(phi);
    const vz = speed * Math.sin(phi) * Math.sin(theta);
    spawnParticle(x, y, z, vx, vy, vz, redPal.p, [1.0, 0.4, 0.2], 2.2, 0.94, 5.8, true);
  }
  const starPoints = 5;
  for (let p = 0; p < starPoints; p++) {
    const a = (p / starPoints) * Math.PI * 2 - Math.PI / 2;
    for (let k = 0; k < 12; k++) {
      const sp = (k / 12) * 11 + 2;
      const vx = Math.cos(a) * sp + (Math.random() - 0.5) * 1.5;
      const vy = Math.sin(a) * sp + (Math.random() - 0.5) * 1.5;
      const vz = (Math.random() - 0.5) * 2;
      spawnParticle(x, y, z, vx, vy, vz, goldPal.p, [1.0, 1.0, 0.6], 1.8, 0.92, 5.0, true);
    }
  }
}

// Fan Salvo (Loạt pháo quạt 7 màu liên hoàn)
function launchFanSalvo(startX, endX, z, targetY) {
  const rainbowKeys = ["ruby", "amber", "gold", "emerald", "cyan", "sapphire", "purple"];
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const rx = startX + (endX - startX) * u;
    const rz = z + (Math.random() - 0.5) * 4;
    const col = rainbowKeys[i];
    setTimeout(() => {
      launchRocket(rx, rz, targetY + (Math.random() - 0.5) * 3, "peony", col);
    }, i * 130);
  }
}

function detonateRocket(rocket) {
  const { x, y, z, type, colorKey } = rocket;
  const camPos = camera.position;
  const dist = Math.hypot(camPos.x - x, camPos.z - z);
  const soundDelay = Math.min(320, (dist / 340) * 1000);
  setTimeout(() => {
    SFX.fireworkBoom(dist, type === "kamuro_grand" ? 1.5 : 1.0);
  }, soundDelay);

  switch (type) {
    case "chrysanthemum":
      detonateChrysanthemum(x, y, z, colorKey);
      break;
    case "peony":
      detonatePeony(x, y, z, colorKey);
      break;
    case "kamuro":
      detonateKamuro(x, y, z, 180, false);
      break;
    case "kamuro_grand":
      detonateKamuro(x, y, z, 260, true);
      break;
    case "saturn":
      detonateSaturn(x, y, z, colorKey);
      break;
    case "palm":
      detonatePalm(x, y, z);
      break;
    case "crossette":
      detonateCrossette(x, y, z, colorKey);
      break;
    case "vietnam_star":
      detonateVietnamStar(x, y, z);
      break;
    default:
      detonateChrysanthemum(x, y, z, "gold");
  }
}

// 60-Second Choreographed Timetable
const FIREWORK_SHOW_DURATION = 60; // 1 phút
const FIREWORK_TIMELINE = [
  // 0s - 12s: Mở màn rực rỡ
  { t: 0.5, type: "chrysanthemum", x: 0, z: -52, col: "gold", targetY: 53 },
  { t: 3.2, type: "peony", x: -18, z: -48, col: "ruby", targetY: 48 },
  { t: 4.0, type: "peony", x: 18, z: -54, col: "sapphire", targetY: 50 },
  { t: 6.8, type: "saturn", x: -8, z: -46, col: "cyan_magenta", targetY: 54 },
  { t: 9.5, type: "saturn", x: 10, z: -56, col: "gold_ruby", targetY: 52 },
  { t: 12.0, type: "kamuro", x: 0, z: -50, col: "gold", targetY: 56 },

  // 13s - 26s: Biến ảo & Nổ giòn
  { t: 14.2, type: "palm", x: -16, z: -48, col: "amber", targetY: 49 },
  { t: 16.5, type: "palm", x: 16, z: -52, col: "amber", targetY: 51 },
  { t: 18.8, type: "crossette", x: -10, z: -55, col: "amber", targetY: 53 },
  { t: 20.5, type: "crossette", x: 10, z: -47, col: "turquoise", targetY: 52 },
  { t: 22.8, type: "peony", x: -22, z: -50, col: "emerald", targetY: 48 },
  { t: 23.4, type: "peony", x: 22, z: -52, col: "purple", targetY: 48 },
  { t: 24.5, type: "kamuro", x: 0, z: -54, col: "gold", targetY: 55 },

  // 26s - 38s: Loạt pháo quạt cầu vồng & Cờ đỏ sao vàng
  { t: 26.5, type: "fan7", x: 0, z: -50, targetY: 51 },
  { t: 30.0, type: "vietnam_star", x: 0, z: -52, col: "red_gold", targetY: 57 },
  { t: 32.5, type: "saturn", x: -15, z: -48, col: "lime_purple", targetY: 52 },
  { t: 33.2, type: "saturn", x: 15, z: -54, col: "cyan_magenta", targetY: 52 },
  { t: 35.0, type: "palm", x: -8, z: -50, col: "amber", targetY: 50 },
  { t: 36.2, type: "palm", x: 8, z: -50, col: "amber", targetY: 51 },
  { t: 38.0, type: "fan7", x: 0, z: -52, targetY: 52 },

  // 40s - 48s: Dồn dập cao trào
  { t: 40.5, type: "crossette", x: -18, z: -49, col: "gold", targetY: 52 },
  { t: 41.2, type: "crossette", x: 0, z: -54, col: "amber", targetY: 54 },
  { t: 41.9, type: "crossette", x: 18, z: -49, col: "turquoise", targetY: 52 },
  { t: 43.5, type: "kamuro", x: -14, z: -50, col: "gold", targetY: 56 },
  { t: 44.2, type: "kamuro", x: 14, z: -52, col: "gold", targetY: 56 },
  { t: 45.5, type: "vietnam_star", x: 0, z: -50, col: "red_gold", targetY: 58 },

  // 47s - 55s: ĐẠI KẾT MÀN (Grand Finale)
  { t: 47.0, type: "palm", x: -24, z: -48, col: "amber", targetY: 48 },
  { t: 47.5, type: "peony", x: 20, z: -54, col: "ruby", targetY: 50 },
  { t: 48.2, type: "saturn", x: -12, z: -52, col: "cyan_magenta", targetY: 53 },
  { t: 48.8, type: "peony", x: 12, z: -48, col: "emerald", targetY: 52 },
  { t: 49.5, type: "fan7", x: 0, z: -50, targetY: 53 },
  { t: 51.0, type: "palm", x: -18, z: -52, col: "amber", targetY: 50 },
  { t: 51.4, type: "palm", x: 18, z: -50, col: "amber", targetY: 50 },
  { t: 52.0, type: "crossette", x: -8, z: -54, col: "gold", targetY: 55 },
  { t: 52.4, type: "crossette", x: 8, z: -54, col: "turquoise", targetY: 55 },
  { t: 53.2, type: "peony", x: -25, z: -50, col: "ruby", targetY: 51 },
  { t: 53.5, type: "peony", x: 25, z: -50, col: "purple", targetY: 51 },
  { t: 54.0, type: "vietnam_star", x: 0, z: -52, col: "red_gold", targetY: 58 },

  // 55s - 60s: Loạt đại pháo kết thúc
  { t: 55.5, type: "kamuro", x: -26, z: -48, col: "gold", targetY: 54 },
  { t: 55.8, type: "kamuro", x: -13, z: -52, col: "gold", targetY: 56 },
  { t: 56.1, type: "kamuro", x: 0, z: -55, col: "gold", targetY: 58 },
  { t: 56.4, type: "kamuro", x: 13, z: -52, col: "gold", targetY: 56 },
  { t: 56.7, type: "kamuro", x: 26, z: -48, col: "gold", targetY: 54 },
  // 58s: Thác vàng đại liên hoàn kết màn (Golden Willow Ocean)
  { t: 58.0, type: "kamuro_grand", x: -20, z: -50, col: "gold", targetY: 60 },
  { t: 58.0, type: "kamuro_grand", x: 0, z: -54, col: "gold", targetY: 63 },
  { t: 58.0, type: "kamuro_grand", x: 20, z: -50, col: "gold", targetY: 60 },
];

let isFireworksRunning = false;
let fireworkStartTime = 0;
let fireworkScheduleIndex = 0;

function startFireworksShow(opts = {}, broadcast = true) {
  if (window.FireworksShow) {
    const seed = opts.seed || ((Math.random() * 2 ** 31) >>> 0);
    const startTime = opts.startTime || Date.now();
    if (!isNight && typeof toggleDayNight === "function") {
      toggleDayNight(true);
    }
    window.FireworksShow.start({ ...opts, seed, startTime });
    if (broadcast && window.Net && typeof window.Net.broadcastFireworks === "function") {
      window.Net.broadcastFireworks("start", { seed, startTime });
    }
  }
}

function stopFireworksShow(naturalFinish = false, broadcast = true) {
  if (window.FireworksShow) {
    window.FireworksShow.stop(naturalFinish);
    if (broadcast && window.Net && typeof window.Net.broadcastFireworks === "function") {
      window.Net.broadcastFireworks("stop");
    }
  }
}

function toggleFireworksShow() {
  if (window.FireworksShow && window.FireworksShow.isRunning) {
    stopFireworksShow(false, true);
  } else {
    startFireworksShow({}, true);
  }
}

// Lắng nghe sự kiện pháo hoa & đổi sáng tối (F1, F2) từ bất kỳ người chơi nào trong phòng
if (typeof window !== "undefined") {
  const registerNetEvents = () => {
    if (window.Net) {
      window.Net.onFireworks = (action, data) => {
        if (action === "start") {
          const seed = data.seed;
          const startTime = data.startTime;
          if (window.FireworksShow && (!window.FireworksShow.isRunning || window.FireworksShow.seed !== seed)) {
            startFireworksShow({ seed, startTime }, false);
          }
        } else if (action === "stop") {
          if (window.FireworksShow && window.FireworksShow.isRunning) {
            stopFireworksShow(false, false);
          }
        }
      };

      window.Net.onDayNight = (targetIsNight) => {
        toggleDayNight(targetIsNight, false);
      };
    }
  };
  registerNetEvents();
  setTimeout(registerNetEvents, 1000);
}

window.toggleFireworks = toggleFireworksShow;
window.startFireworks = startFireworksShow;
window.stopFireworks = stopFireworksShow;
window.getFireworksState = () => ({
  running: window.FireworksShow ? window.FireworksShow.isRunning : false,
  elapsed: window.FireworksShow ? window.FireworksShow.elapsed : 0,
  isNight,
});

function updateFireworks(dt, now) {
  // Legacy CPU fireworks deprecated in favor of high-end GPU FireworksShow
}

/* ================= input ================= */
const keys = {};
window.keys = keys;
let started = false;
const isTouch = matchMedia("(pointer: coarse)").matches;
if (isTouch) document.body.classList.add("touch");
addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") { if (e.key === "Escape") e.target.blur(); return; }
  if (e.key === "Escape" && !$("emote-wheel").hidden) { toggleWheel(false); return; }
  if (e.key === "Escape") { if (infoOpen) closeInfo(); else if (!$("qr-modal").hidden) $("qr-modal").hidden = true; return; }
  // Lệnh ẩn F8 / F1: Kích hoạt màn pháo hoa nghệ thuật 45s (Mỹ Đình Celebration) & F2: Chuyển ngày/tối
  if (e.code === "F8" || e.key === "F8" || e.code === "F1" || e.key === "F1") {
    e.preventDefault();
    if (e.repeat) return;
    toggleFireworksShow();
    return;
  }
  if (e.code === "F2" || e.key === "F2") { e.preventDefault(); toggleDayNight(); return; }
  if (!started || infoOpen) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Enter") { e.preventDefault(); $("say").focus(); return; } // chỉ Enter mới bắt đầu chat
  if (e.code === "KeyV") { if (!e.repeat) toggleView(); return; }
  if (e.code === "KeyF") { if (!e.repeat) toggleWheel(); return; }
  if (!$("emote-wheel").hidden && (e.key === "1" || e.key === "2")) { doEmote(e.key === "1" ? "wave" : "clap"); toggleWheel(false); return; }
  if (e.code === "Space") { e.preventDefault(); jump(); return; }
  keys[e.code] = true;
  if (e.code === "KeyE") {
    if (elevAction) { if (!elevAction.quiet) SFX.bell(); elevAction(); } else if (target) openInfo(target);
  }
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// let drag = null;
// canvas.addEventListener("pointerdown", (e) => {
//   if (!started || infoOpen) return;
//   if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
//   drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
//   canvas.setPointerCapture(e.pointerId);
// });
// canvas.addEventListener("pointermove", (e) => {
//   if (!drag || drag.id !== e.pointerId) return;
//   const k = e.pointerType === "touch" ? 0.006 : 0.0042;
//   player.yaw -= (e.clientX - drag.x) * k;
//   player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - (e.clientY - drag.y) * k));
//   drag.x = e.clientX; drag.y = e.clientY;
// });
// canvas.addEventListener("pointerup", (e) => {
//   if (!drag || drag.id !== e.pointerId) return;
//   const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy), dt = performance.now() - drag.t;
//   drag = null;
//   if (moved < 8 && dt < 400) { const hit = pick(e.clientX, e.clientY, 8); if (hit) openInfo(hit); }
// });
// canvas.addEventListener("pointercancel", () => { drag = null; });

// Desktop: bấm vào màn hình một lần để khóa con trỏ, sau đó chỉ cần DI CHUỘT là xoay góc nhìn (không phải giữ nút).
// Esc để hiện lại con trỏ (bấm các nút trên màn hình); bấm vào màn hình để điều khiển tiếp.
// Khi đang khóa: bấm chuột trái = xem hiện vật ở giữa màn hình. Trình duyệt không cho khóa con trỏ thì vẫn giữ-kéo như cũ.
let look = null;
const lookLocked = () => document.pointerLockElement === canvas;
function lockPointer() {
  if (isTouch || !started || infoOpen || lookLocked()) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {}
}
function updateLookHint() { $("look-hint").hidden = !(started && !isTouch && !infoOpen && !lookLocked()); }
document.addEventListener("pointerlockchange", () => { if (lookLocked()) look = null; updateLookHint(); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (!started || infoOpen || isTouch || (e.button !== 0 && e.button !== 2)) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
  if (lookLocked()) { if (e.button === 0) { const hit = pick(innerWidth / 2, innerHeight / 2, 8); if (hit) openInfo(hit); } return; }
  look = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), button: e.button };
  lockPointer();
});
document.addEventListener("mousemove", (e) => {
  if (!started || infoOpen) return;
  let dx, dy;
  if (lookLocked()) { dx = e.movementX; dy = e.movementY; if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; } // bỏ các cú giật bất thường của trình duyệt
  else if (look) { dx = e.clientX - look.x; dy = e.clientY - look.y; look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy); } // dự phòng: giữ và kéo
  else return;
  player.yaw -= dx * 0.0028;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy * 0.0028));
});
const endLook = () => {
  if (!look) return;
  const l = look; look = null;
  if (!lookLocked() && l.button === 0 && l.moved < 8 && performance.now() - l.t < 400 && !infoOpen) {
    const hit = pick(l.sx, l.sy, 8); if (hit) openInfo(hit);
  }
};
document.addEventListener("mouseup", endLook);
addEventListener("blur", endLook);

// Mobile: vẫn giữ thao tác chạm và kéo để xoay camera
let touchDrag = null;

if (isTouch) {
  canvas.addEventListener("pointerdown", (e) => {
    if (!started || infoOpen) return;

    touchDrag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now()
    };

    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!touchDrag || touchDrag.id !== e.pointerId) return;

    const dx = e.clientX - touchDrag.x;
    const dy = e.clientY - touchDrag.y;

    player.yaw -= dx * 0.006;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy * 0.006));

    touchDrag.x = e.clientX;
    touchDrag.y = e.clientY;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!touchDrag || touchDrag.id !== e.pointerId) return;

    const moved = Math.hypot(
      e.clientX - touchDrag.sx,
      e.clientY - touchDrag.sy
    );

    const dt = performance.now() - touchDrag.t;
    touchDrag = null;

    if (moved < 8 && dt < 400) {
      const hit = pick(e.clientX, e.clientY, 8);
      if (hit) openInfo(hit);
    }
  });

  canvas.addEventListener("pointercancel", () => {
    touchDrag = null;
  });
}

let joyX = 0, joyY = 0, joyId = null;
window.joyX = 0; window.joyY = 0;
const joy = $("joy"), knob = $("knob");
function joyMove(e) {
  const r = joy.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy), max = r.width / 2 - 10; if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`; joyX = dx / max; joyY = dy / max;
  window.joyX = joyX; window.joyY = joyY;
}
joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; joyX = joyY = 0; window.joyX = 0; window.joyY = 0; knob.style.transform = ""; };
joy.addEventListener("pointerup", joyEnd); joy.addEventListener("pointercancel", joyEnd);

function toggleView() {
  thirdPerson = !thirdPerson;
  if ($("view-icon")) $("view-icon").textContent = thirdPerson ? "person" : "visibility";
  if ($("view-label")) $("view-label").textContent = "Góc nhìn: " + (thirdPerson ? "thứ ba" : "thứ nhất");
  else $("view-btn").textContent = "Góc nhìn: " + (thirdPerson ? "người thứ ba" : "người thứ nhất");
  $("dot").hidden = thirdPerson;
}
$("view-btn").addEventListener("click", toggleView);
$("jump-btn").addEventListener("click", jump);

/* ================= multiplayer UI ================= */
const EMOTES = { wave: "👋 Vẫy tay", clap: "👏 Vỗ tay" };
let follow = null, joinedAt = 0;
function addLog(name, text) {
  const d = document.createElement("div");
  if (name) { const b = document.createElement("b"); b.textContent = name + ": "; d.append(b); }
  d.append(document.createTextNode(text));
  const log = $("log"); log.append(d); while (log.children.length > 4) log.firstChild.remove();
  setTimeout(() => d.remove(), 9000);
}
let lastPeopleRender = 0, peopleRenderTimer = null;
function scheduleRenderPeople() {
  const now = performance.now();
  if (now - lastPeopleRender >= 500) {
    lastPeopleRender = now;
    renderPeople();
  } else if (!peopleRenderTimer) {
    peopleRenderTimer = setTimeout(() => {
      peopleRenderTimer = null;
      lastPeopleRender = performance.now();
      renderPeople();
    }, 500 - (now - lastPeopleRender));
  }
}
function renderPeople() {
  const online = Net.status === "online";
  $("live").classList.toggle("off", !online);
  $("people-count").textContent = Net.mode === "solo" ? "Chế độ một người" : online ? `${Net.peers.size + 1} người đang tham quan` : "Đang kết nối…";
  $("people-note").textContent = Net.mode === "signalr" ? "Đang kết nối máy chủ SignalR (15Hz Tick Batching). Bấm “Đi theo” để camera bám theo người thuyết minh."
    : Net.mode === "firebase" ? "Ai mở link đều vào được và thấy nhau. Bấm “Đi theo” để camera bám theo người thuyết minh."
    : Net.mode === "claude" ? "Đang dùng phòng chung claude.ai: người được chia sẻ link và đang mở trang sẽ thấy nhau."
    : "Đang ở chế độ một người. Để cả lớp cùng vào, hãy bật Backend SignalR hoặc cấu hình Firebase trong config.js.";
  $("actions").hidden = !started;
  if ($("people-panel").hidden) return;
  const list = $("people-list"); list.textContent = "";
  const row = (color, name, where, id) => {
    const d = document.createElement("div"); d.className = "person";
    const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = color;
    const who = document.createElement("div"); who.className = "who";
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = name;
    const wh = document.createElement("span"); wh.className = "where"; wh.textContent = where;
    who.append(nm, wh); d.append(sw, who);
    if (id) {
      const b = document.createElement("button"); b.type = "button"; b.className = "act";
      const ic = document.createElement("span"); ic.className = "g-icon sm";
      ic.textContent = follow === id ? "my_location" : "directions_walk";
      b.append(ic, document.createTextNode(follow === id ? "Đang theo" : "Đi theo"));
      b.addEventListener("click", () => (follow === id ? stopFollow() : startFollow(id)));
      d.append(b);
    }
    list.append(d);
  };
  row(me.color, (me.name || "Bạn") + " (bạn)", zoneName(player.x, player.z, player.base), null);
  for (const [id, s] of Net.peers) row(s.c, s.n, zoneName(s.x, s.z, s.y), id);
}
function startFollow(id) {
  const s = Net.peers.get(id); if (!s) return;
  follow = id; $("follow-text").textContent = "Đang đi theo " + s.n; $("follow-bar").hidden = false; renderPeople();
}
function stopFollow() { if (!follow) return; follow = null; $("follow-bar").hidden = true; renderPeople(); }
$("unfollow").addEventListener("click", stopFollow);
$("people-btn").addEventListener("click", () => {
  const p = $("people-panel"); p.hidden = !p.hidden; $("people-btn").setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) renderPeople();
});
document.querySelectorAll("[data-emote]").forEach((b) => b.addEventListener("click", () => { doEmote(b.dataset.emote); toggleWheel(false); }));
// Vòng biểu cảm: nhấn F (hoặc nút Biểu cảm) để mở, bấm chọn; F / Esc / bấm ra ngoài để đóng
function toggleWheel(show) {
  const w = $("emote-wheel"); show = show === undefined ? w.hidden : show;
  w.hidden = !show; $("emote-btn").setAttribute("aria-expanded", String(show));
  if (show) { if (lookLocked()) document.exitPointerLock(); } else lockPointer(); // mở vòng biểu cảm thì hiện con trỏ để bấm chọn
}
$("emote-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleWheel(); });
document.addEventListener("pointerdown", (e) => { if (!$("emote-wheel").hidden && !e.target.closest("#emote-wheel, #emote-btn")) toggleWheel(false); });
function doEmote(em) {
  Net.update({ emote: em, emoteAt: Date.now() });
  me.emote = em; me.emoteUntil = performance.now() + 1800; showMyBubble(EMOTES[em]);
  if (player.seat) setTimeout(() => { if (player.seat) sendSit(true); }, 1900); // báo lại là vẫn đang ngồi
  addLog("Bạn", EMOTES[em]);
}
$("chatbox").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("say").value.replace(/\s+/g, " ").trim().slice(0, 80); if (!t) { $("say").blur(); return; }
  const cmd = t.toLowerCase().trim();
  if (cmd === "/f8" || cmd === "/f1" || cmd === "/phaohoa" || cmd === "/firework" || cmd === "/fireworks") {
    toggleFireworksShow();
    $("say").value = ""; $("say").blur();
    return;
  }
  if (cmd === "/f2" || cmd === "/night" || cmd === "/day" || cmd === "/toitoi" || cmd === "/sang") {
    toggleDayNight();
    $("say").value = ""; $("say").blur();
    return;
  }
  Net.update({ say: t, sayAt: Date.now() }); showMyBubble(t); addLog("Bạn", t);
  $("say").value = ""; $("say").blur();
});
function showMyBubble(text) {
  if (!me.fig) return; disposeSprite(me.bubble);
  me.bubble = tagSprite(text, null, 2.6); me.bubble.position.y = 2.5; me.fig.add(me.bubble); me.bubbleUntil = performance.now() + 6000;
}
// QR invite (only when hosted on the web, e.g. Vercel)
const hosted = !window.claude && /^https?:$/.test(location.protocol);
$("qr-btn").hidden = !hosted;
let qrMade = false;
$("qr-btn").addEventListener("click", () => {
  const url = location.href.split("#")[0];
  if (!qrMade && window.QRCode) { new QRCode($("qr"), { text: url, width: 220, height: 220 }); qrMade = true; }
  $("qr-url").textContent = url; $("qr-modal").hidden = false;
});
$("qr-close").addEventListener("click", () => { $("qr-modal").hidden = true; });

Net.onChange((type, id) => {
  if (type === "join" || type === "update") {
    const fresh = !avatars.has(id);
    ensureAvatar(id);
    if (type === "join" && fresh && performance.now() - joinedAt > 2500) addLog(null, Net.peers.get(id).n + " vừa vào bảo tàng");
  } else if (type === "leave") {
    const a = avatars.get(id); if (a) addLog(null, a.name + " đã rời đi");
    removeAvatar(id);
  }
  if (type === "tick" || type === "update") {
    if (!$("people-panel").hidden) scheduleRenderPeople();
  } else {
    renderPeople();
  }
});

/* ================= main loop ================= */
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
let camDist = 0;
const sent = { t: 0, x: 0, z: 0, yaw: 0, m: false, y: 0 };
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

let last = performance.now(), lastZone = "";
const fwd = new THREE.Vector3(), head = new THREE.Vector3();
let shadowTick = 0, slowN = 0, fastN = 0;
const DPR_MAX = renderer.getPixelRatio();
let dprNow = DPR_MAX;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;

  // --- my movement
  player.moving = false; player.running = false;
  if (started && !infoOpen) {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
    if (keys.ArrowLeft) player.yaw += 1.8 * dt; if (keys.ArrowRight) player.yaw -= 1.8 * dt;
    f -= joyY; s += joyX;
    const len = Math.hypot(f, s);
    if (len > 0.08) {
      if (player.seat) standUp();
      if (follow) stopFollow();
      const run = keys.ShiftLeft || keys.ShiftRight;
      const sp = (run ? 10 : 5.5) * Math.min(1, len) * dt;
      f /= Math.max(1, len); s /= Math.max(1, len);
      const sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
      const dx = (-sn * f + cs * s) * sp, dz = (-cs * f - sn * s) * sp;
      if (free(player.x + dx, player.z + dz)) { player.x += dx; player.z += dz; }
      else if (free(player.x + dx, player.z)) player.x += dx;
      else if (free(player.x, player.z + dz)) player.z += dz;
      player.moving = true; player.running = run; player.phase += dt * (run ? 16 : 12);
      if (player.grounded && Math.floor(player.phase / PI) !== SFX.stepPhase) {
        SFX.stepPhase = Math.floor(player.phase / PI);
        SFX.step(player.z < 0.2);
      }
    }
    // follow mode
    if (follow) {
      const a = avatars.get(follow);
      if (!a) stopFollow();
      else {
        const k = Math.min(1, dt * 3);
        const bx = a.x + Math.sin(a.yaw) * 2, bz = a.z + Math.cos(a.yaw) * 2;
        const ok = free(bx, bz), tx = ok ? bx : a.x, tz = ok ? bz : a.z;
        const nx = player.x + (tx - player.x) * k, nz = player.z + (tz - player.z) * k;
        if (Math.hypot(nx - player.x, nz - player.z) > 0.01) { player.moving = true; player.phase += dt * 9; }
        if (free(nx, nz)) { player.x = nx; player.z = nz; }
        else if (Math.hypot(a.x - player.x, a.z - player.z) > 4) { player.x = a.x; player.z = a.z; }
        player.yaw += angDiff(a.yaw, player.yaw) * k;
      }
    }
  }

  // --- camera
  {
    fwd.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
    // đứng trên mặt đất/bệ: bước khỏi mép bệ thì rơi (vy=0); đang bay thì rơi tới khi chạm mặt đất/bệ bên dưới
    if (player.seat) { // đang ngồi: bám theo chỗ ngồi (kể cả khi nó chuyển động)
      const p = seatPose(player.seat); player.x = p.x; player.z = p.z; player.jy = p.y; player.vy = 0; player.grounded = true; player.seatYaw = p.yaw;
    } else { const gy = groundAt(player.x, player.z);
      if (player.grounded) { if (player.jy > gy + 0.02) { player.grounded = false; player.vy = 0; } else player.jy = gy; }
      if (!player.grounded) { player.vy -= 15 * dt; player.jy += player.vy * dt; if (player.vy <= 0 && player.jy <= gy) { player.jy = gy; player.vy = 0; player.grounded = true; } } }
    updateElevator(dt);
    head.set(player.x, player.base + (player.seat ? 0.8 : EYE) + player.jy + (thirdPerson ? 0.25 : 0), player.z);
    if (thirdPerson) {
      ray.set(head, fwd.clone().negate()); ray.far = 3.4;
      const hit = ray.intersectObjects(solids, false)[0];
      camDist = hit ? Math.max(0.5, hit.distance - 0.3) : 3.4;
      camera.position.copy(head).addScaledVector(fwd, -camDist);
    } else { camDist = 0; camera.position.copy(head); }
    camera.rotation.set(player.pitch, player.yaw, 0);

    // --- my figure
    if (me.fig) {
      me.fig.visible = thirdPerson && started;
      me.fig.position.set(player.x, player.base + player.jy, player.z); me.fig.rotation.y = player.seat ? player.seatYaw : player.yaw;
      pose(me.fig, player.phase, player.moving ? (player.running ? 2 : 1) : 0, now < me.emoteUntil ? me.emote : null, t, dt, !player.grounded, !!player.seat);
      if (me.bubble) me.bubble.visible = now < me.bubbleUntil;
    }
  }

  // --- peers (interpolation mượt 60 FPS)
  const k = Math.min(1, dt * 11);
  for (const [id, a] of avatars) {
    const s = Net.peers.get(id); if (!s) continue;
    const ox = a.x, oz = a.z;
    a.x += (s.x - a.x) * k; a.z += (s.z - a.z) * k; a.yaw += angDiff(s.yaw, a.yaw) * k;
    const speed = Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 1e-3);
    a.walk += ((speed > 0.35 || s.m ? 1 : 0) - a.walk) * Math.min(1, dt * 8);
    a.speed = (a.speed || 0) + (speed - (a.speed || 0)) * Math.min(1, dt * 6); // làm mượt để không giật qua lại giữa đi/chạy
    a.phase += dt * 9 * a.walk;
    a.y += ((s.y || 0) - a.y) * Math.min(1, dt * 12); a.fig.position.set(a.x, a.y, a.z); a.fig.rotation.y = a.yaw;
    { const sy = s.y || 0; if (Math.abs(sy - (a.sy == null ? sy : a.sy)) > 0.02 && !inElev(s.x, s.z)) a.airUntil = now + 220; a.sy = sy; }
    pose(a.fig, a.phase, a.walk * (a.speed > 7.5 ? 2 : 1), now < a.emoteUntil ? a.emote : null, t, dt, !a.sit && now < (a.airUntil || 0), !!a.sit);
    if (a.bubble) a.bubble.visible = now < a.bubbleUntil;
  }

  // --- send my state (66ms cho SignalR 15Hz, hoặc gửi ngay khi dừng di chuyển)
  const sendInterval = Net.mode === "signalr" ? 66 : (!player.grounded ? 80 : 200);
  const stoppedJustNow = !player.moving && sent.m;
  if (started && Net.mode !== "solo" && (stoppedJustNow || now - sent.t > sendInterval)) {
    if (Math.abs(player.x - sent.x) > 0.04 || Math.abs(player.z - sent.z) > 0.04 || Math.abs((player.seat ? player.seatYaw : player.yaw) - sent.yaw) > 0.04 || player.moving !== sent.m || Math.abs(player.base + player.jy - sent.y) > 0.04) {
      sent.t = now; sent.y = player.base + player.jy; sent.x = player.x; sent.z = player.z; sent.yaw = player.seat ? player.seatYaw : player.yaw; sent.m = player.moving;
      Net.update({ x: +player.x.toFixed(2), z: +player.z.toFixed(2), yaw: +sent.yaw.toFixed(2), m: player.moving, y: +(player.base + player.jy).toFixed(2), av: me.modelKey });
    }
  }

  // --- ambient animation (flags, dust motes, koi pond, spinners)
  for (const fl of flags) {
    const p = fl.geo.attributes.position, b = fl.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.array[i * 3 + 2] = Math.sin(x * 2.2 - t * 3 + fl.ph) * 0.14 * ((x + 1.5) / 3); }
    p.needsUpdate = true;
  }
  if (dustPoints && dustBase) {
    const dp = dustPoints.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const bx = dustBase[i * 4], by = dustBase[i * 4 + 1], bz = dustBase[i * 4 + 2], ph = dustBase[i * 4 + 3];
      dp.array[i * 3] = bx + Math.sin(t * 0.45 + ph) * 0.35;
      dp.array[i * 3 + 1] = by + Math.cos(t * 0.6 + ph) * 0.25;
      dp.array[i * 3 + 2] = bz + Math.sin(t * 0.35 + ph * 1.3) * 0.35;
    }
    dp.needsUpdate = true;
  }
  for (const sp of spinners) sp.obj.rotation.y += sp.speed * dt;
  { const wt = (Date.now() / 1000) % 86400; for (const a of anims) a(wt, dt); }
  updateBall(dt); updateParkour(now);
  animatePond(t, dt);
  updateStatueSprite();
  updateDayNight(dt);
  updateFireworks(dt, now);
  if (window.FireworksShow) window.FireworksShow.update(dt, now);
  // the statue is built from a front and a back image: turn it so the viewer always sees one of them, never the thin edge
  if (statueBoard) {
    const face = (window.STATUE && window.STATUE.faceY) || 0;
    const toCam = Math.atan2(camera.position.x - statueBoard.position.x, camera.position.z - statueBoard.position.z);
    const target = Math.abs(angDiff(toCam, face)) < H2 ? toCam : toCam + PI;
    statueBoard.rotation.y += angDiff(target, statueBoard.rotation.y) * Math.min(1, dt * 10);
  }

  // --- prompt + HUD (with Google Material Symbols)
  if (started && !infoOpen) {
    target = pick(innerWidth / 2, innerHeight / 2, 4.5);
    const pr = $("prompt");
    elevAction = elevatorPrompt() || seatPrompt();
    if (elevAction) {
      pr.textContent = "";
      const ic = document.createElement("span"); ic.className = "g-icon"; ic.textContent = elevAction.icon || "elevator";
      const b = document.createElement("b"); b.textContent = elevAction.label;
      pr.append(ic, b, document.createTextNode(isTouch ? " · Chạm vào đây" : " · Nhấn E"));
      pr.hidden = false;
    } else if (target) {
      pr.textContent = "";
      const t = document.createElement("span"); t.className = "pr-text";
      const b = document.createElement("b"); b.textContent = target.title;
      const sub = document.createElement("small"); sub.textContent = isTouch ? "Chạm để xem chi tiết" : "Xem chi tiết";
      t.append(b, sub);
      pr.append(t);
      if (!isTouch) { const k = document.createElement("kbd"); k.textContent = "E"; pr.append(k); }
      pr.hidden = false;
    } else pr.hidden = true;
    const zone = zoneName(player.x, player.z, player.base);
    if (zone !== lastZone) { $("room").textContent = zone; lastZone = zone; if (!$("people-panel").hidden) scheduleRenderPeople(); }
  }

  // Bóng: cảnh gần như tĩnh nên chỉ dựng lại bản đồ bóng mỗi 3 khung hình (~1800 vật thể đổ bóng)
  if ((shadowTick++ % 3) === 0) renderer.shadowMap.needsUpdate = true;
  // Độ phân giải thích ứng: máy yếu / lia nhanh bị chậm thì tự hạ pixel ratio, ổn định lại thì nâng dần
  if (dt < 0.25) {
    if (dt > 0.026) { slowN++; fastN = 0; } else if (dt < 0.019) { fastN++; slowN = 0; } else { slowN = fastN = 0; }
    if (slowN > 15 && dprNow > 0.75) { dprNow = Math.max(0.75, dprNow - 0.25); renderer.setPixelRatio(dprNow); renderer.setSize(innerWidth, innerHeight, false); slowN = 0; }
    else if (fastN > 240 && dprNow < DPR_MAX) { dprNow = Math.min(DPR_MAX, dprNow + 0.25); renderer.setPixelRatio(dprNow); renderer.setSize(innerWidth, innerHeight, false); fastN = 0; }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ================= start ================= */
const COLORS = ["#d62828", "#f77f00", "#2a9d8f", "#1d4ed8", "#7b2cbf", "#222222"];
const swWrap = $("swatches");
let saved = {}; try { saved = JSON.parse(localStorage.getItem("museum-me") || "{}"); } catch (e) {}
me.color = COLORS.includes(saved.c) ? saved.c : COLORS[Math.floor(Math.random() * COLORS.length)];
me.modelKey = (saved.m === "nv2" || saved.av === "nv2") ? "nv2" : "nv1";

$("nick").value = typeof saved.n === "string" ? saved.n : "";

// Character selection cards
const charCards = document.querySelectorAll(".char-card");
charCards.forEach((btn) => {
  const model = btn.getAttribute("data-model");
  btn.setAttribute("aria-pressed", String(model === me.modelKey));
  btn.addEventListener("click", () => {
    me.modelKey = model;
    charCards.forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
  });
});

COLORS.forEach((c, i) => {
  const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = c;
  b.setAttribute("aria-label", "Màu " + (i + 1)); b.setAttribute("aria-pressed", String(c === me.color));
  b.addEventListener("click", () => { me.color = c; swWrap.querySelectorAll(".sw").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
  swWrap.append(b);
});

$("go").addEventListener("click", () => {
  SFX.ensure();
  me.name = $("nick").value.replace(/\s+/g, " ").trim().slice(0, 24) || "Khách " + Math.floor(100 + Math.random() * 900);
  try { localStorage.setItem("museum-me", JSON.stringify({ n: me.name, c: me.color, m: me.modelKey })); } catch (e) {}
  started = true; window.started = true; joinedAt = performance.now(); lockPointer(); updateLookHint();
  $("start").hidden = true; $("hud").hidden = false; $("dot").hidden = thirdPerson; $("people-btn").hidden = false;
  if (isTouch) joy.hidden = false;
  setMyFigure();
  renderPeople();
  Net.start({ x: +player.x.toFixed(2), z: +player.z.toFixed(2), yaw: 0, n: me.name, c: me.color, av: me.modelKey, m: false });
});

window.__museum = { player, avatars, scene, camera, free, PLATFORMS, BLOCKS, BALL, SEATS, SIT, seatPose, sitDown, standUp, makeFigure, pose, me }; // tiện kiểm tra khi phát triển
async function init() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 40px "Noto Serif"`),
        document.fonts.load(`600 40px "Be Vietnam Pro"`),
        document.fonts.load(`400 40px "Be Vietnam Pro"`),
        BUA_LIEM_IMG.decode ? BUA_LIEM_IMG.decode().catch(() => {}) : Promise.resolve()
      ]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch (e) {}
  loadCharacterModels();
  buildAtmosphere(); buildOutdoor(); buildBuilding(); buildStatue(); buildGarden(); buildVehicles(); buildHall(); buildUpperFloor(); buildRooms(); buildUpperRooms(); buildGates(); buildPlayground(); buildParkour(); buildDecor(); loadCases();
  if (window.FireworksShow) window.FireworksShow.init(scene, camera, renderer);
  requestAnimationFrame(frame);
  // Tải xong mô hình/ảnh + biên dịch shader + đẩy texture lên GPU TRƯỚC khi cho vào, để lúc lia chuột không bị đơ
  const goBtn = $("go"), goLabel = (t) => { goBtn.innerHTML = '<span class="g-icon">hourglass_top</span> ' + t; };
  goLabel("Đang tải bảo tàng… 0%");
  await new Promise((res) => {
    const DLM = THREE.DefaultLoadingManager; let began = false, done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    DLM.onStart = () => { began = true; };
    DLM.onProgress = (u, l, t) => goLabel("Đang tải bảo tàng… " + Math.round((l / Math.max(1, t)) * 100) + "%");
    DLM.onLoad = () => setTimeout(finish, 400);
    setTimeout(() => { if (!began) finish(); }, 1500);
    setTimeout(finish, 25000);
  });
  goLabel("Đang tối ưu đồ họa…");
  try { await warmUp(); } catch (e) { console.info("warmUp:", e); }
  goBtn.disabled = false;
  goBtn.innerHTML = '<span class="g-icon">login</span> Vào bảo tàng';
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get("autostart") === "1") {
    setTimeout(() => {
      goBtn.click();
      if (urlParams.get("f8") === "1" || urlParams.get("fireworks") === "1") {
        setTimeout(() => {
          if (window.FireworksShow) window.FireworksShow.start();
        }, 600);
      }
      if (urlParams.get("hall") === "1" || urlParams.get("star") === "1") {
        setTimeout(() => {
          player.x = 0; player.z = -9.8; player.yaw = 0; player.pitch = 0.04;
        }, 500);
      }
    }, 250);
  }
  // Ảnh/texture dựng muộn (tủ kính, bảng) vẫn được đẩy lên GPU dần dần ở nền
  [2500, 6000, 12000].forEach((ms) => setTimeout(() => warmUp().catch(() => {}), ms));
}

const warmedTex = new WeakSet();
const TEX_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "bumpMap", "alphaMap"];
async function warmUp() {
  // hình người chơi (SkinnedMesh) có shader riêng: dựng tạm để biên dịch trước
  const temp = [];
  for (const key of ["nv1", "nv2"]) { try { const f = makeFigure(key, "#d62828"); f.position.set(player.x, 0, player.z); scene.add(f); temp.push(f); } catch (e) {} }
  renderer.compile(scene, camera);
  temp.forEach((f) => scene.remove(f));
  const list = [];
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of TEX_KEYS) {
      const t = m[k];
      if (!t || !t.image || warmedTex.has(t)) continue;
      if (t.image.complete === false) continue; // ảnh chưa tải xong, lần sau
      warmedTex.add(t); list.push(t);
    }
  });
  for (let i = 0; i < list.length; i += 4) {
    for (let j = i; j < Math.min(i + 4, list.length); j++) renderer.initTexture(list[j]);
    await new Promise((r) => setTimeout(r, 16));
  }
}
init();
})();

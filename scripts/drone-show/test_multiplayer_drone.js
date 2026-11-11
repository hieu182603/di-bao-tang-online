// Kiểm thử Drone Show với nhiều người chơi THẬT: 3 trình duyệt Chrome headless, backend SignalR chạy cục bộ.
//   1) cd Backend && dotnet run --urls http://localhost:5089
//   2) PORT=5191 node Frontend/dev-server.js
//   3) node scripts/drone-show/test_multiplayer_drone.js
// Các client dùng phòng riêng "drone-qa-room" trên backend cục bộ (chặn mọi kết nối tới backend production).
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL || "http://localhost:5191";
const BACKEND = process.env.BACKEND || "http://localhost:5089";
const OUT = path.join(__dirname, "..", "..", "docs", "drone-show", "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

async function client(name) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = path.join(process.env.TEMP || ".", "ds_mp_" + name + "_" + Date.now());
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, "--headless=new", "--window-size=960,540", "--use-angle=d3d11",
    "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    `--user-data-dir=${profile}`, "about:blank"]);
  let ws = null;
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(300);
    try {
      const list = await new Promise((res, rej) => http.get(`http://127.0.0.1:${port}/json`, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));
      const pg = list.find((x) => x.type === "page"); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl);
    } catch (e) {}
  }
  let id = 1; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = id++; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(d.error) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" "));
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*azurewebsites.net*", "*firebaseio.com*"] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    Object.defineProperty(window, "BACKEND_URL", { get: () => ${JSON.stringify(BACKEND)}, set() {} });
    Object.defineProperty(window, "MUSEUM_ROOM", { get: () => "drone-qa-room", set() {} });` });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const key = async (code, keyName, vk) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", code, key: keyName, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: keyName, windowsVirtualKeyCode: vk });
  };
  const shot = async (file) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, file), Buffer.from(s.data, "base64")); };
  await send("Page.navigate", { url: `${APP}/?autostart=1` });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const s = await ev("JSON.stringify({ st: !!window.started, mode: window.Net && window.Net.mode, status: window.Net && window.Net.status })");
    const o = s ? JSON.parse(s) : {};
    if (o.st && o.mode === "signalr" && o.status === "online") { console.log(`  [${name}] vào phòng sau ${i + 1}s (signalr)`); break; }
    if (i === 59) console.log(`  [${name}] KHÔNG kết nối được backend:`, s);
  }
  return { name, ev, key, shot, errors, close: () => { try { ws.close(); } catch (e) {} proc.kill(); setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 1500); } };
}

const state = (c) => c.ev(`JSON.stringify({ ds: window.DroneShow.getState(), fw: !!(window.FireworksShow && window.FireworksShow.isRunning),
  peers: window.Net.peers.size, avatars: window.__museum.avatars.size, night: window.getFireworksState().isNight,
  cam: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(2)),
  me: [window.player.x, window.player.z].map((v) => +v.toFixed(2)),
  sceneChildren: window.__museum.scene.children.length, stageChildren: window.DroneShow.group ? window.DroneShow.group.children.length : 0 })`).then(JSON.parse);

(async () => {
  const R = { checks: [] };
  const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} · ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); };
  console.log("Khởi động 2 client A, B…");
  const A = await client("A"); const B = await client("B");
  await sleep(2500);
  let a = await state(A), b = await state(B);
  check("A và B thấy nhau (1 peer, 1 avatar, không trùng)", a.peers === 1 && a.avatars === 1 && b.peers === 1 && b.avatars === 1, { a: [a.peers, a.avatars], b: [b.peers, b.avatars] });

  // 1. F9 trên A -> cả hai cùng chạy, cùng seed, cùng thời điểm
  await A.key("F9", "F9", 120);
  await sleep(4000);
  a = await state(A); b = await state(B);
  check("F9 trên A khởi động show trên A", a.ds.running, a.ds);
  check("B nhận đồng bộ và chạy cùng show (cùng seed)", b.ds.running && a.ds.seed === b.ds.seed, { seedA: a.ds.seed, seedB: b.ds.seed });
  check("Lệch thời gian A–B < 0,6 s", Math.abs(a.ds.t - b.ds.t) < 0.6, { tA: a.ds.t, tB: b.ds.t });
  check("Cả hai chuyển sang trời đêm", a.night && b.night);

  // 2. Giữ phím F9 (auto-repeat) không kích hoạt nhiều lần
  await A.ev(`(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent("keydown", { code: "F9", key: "F9", repeat: true })); return true; })()`);
  await sleep(300);
  const a2 = await state(A);
  check("Giữ F9 (repeat) không dừng/khởi động lại show", a2.ds.running && a2.ds.seed === a.ds.seed && a2.ds.t >= a.ds.t);

  // 3. F8 trong lúc Drone Show chạy -> bị chặn trên cả hai máy
  await A.key("F8", "F8", 119);
  await sleep(1500);
  a = await state(A); b = await state(B);
  check("F8 bị chặn khi Drone Show đang chạy (không mở màn pháo hoa độc lập)", !a.fw && !b.fw, { a: a.fw, b: b.fw });

  // 4. B di chuyển: A thấy avatar B di chuyển mượt, không teleport, A không bị đổi vị trí/camera
  const camA0 = (await state(A)).cam, meA0 = (await state(A)).me;
  const track = [];
  await B.ev(`window.keys.KeyD = true; true`);
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    track.push(await A.ev(`(() => { const a = [...window.__museum.avatars.values()][0]; return a ? +a.x.toFixed(2) : null; })()`));
  }
  await B.ev(`window.keys.KeyD = false; true`);
  const jumps = track.slice(1).map((x, i) => Math.abs(x - track[i]));
  check("Avatar của B di chuyển trên máy A (không teleport: bước < 3 m / 0,25 s)", track[track.length - 1] - track[0] > 1 && Math.max(...jumps) < 3, { track });
  a = await state(A);
  check("Vị trí & camera của A không bị đổi bởi show hay người khác", a.me[0] === meA0[0] && a.me[1] === meA0[1] && JSON.stringify(a.cam) === JSON.stringify(camA0), { me: [meA0, a.me], cam: [camA0, a.cam] });

  // 5. Camera điện ảnh trên A không ảnh hưởng B
  const camB0 = (await state(B)).cam;
  await A.key("KeyC", "c", 67);
  await sleep(2500);
  a = await state(A); b = await state(B);
  check("C bật góc điện ảnh trên A", a.ds.cinematic && JSON.stringify(a.cam) !== JSON.stringify(camA0), a.cam);
  check("Camera của B giữ nguyên khi A bật điện ảnh", JSON.stringify(b.cam) === JSON.stringify(camB0), { before: camB0, after: b.cam });
  await A.shot("mp_A_cinematic.png"); await B.shot("mp_B_normal.png");
  await A.key("KeyC", "c", 67);

  // 6. Người vào muộn: C vào giữa show -> chạy cùng show, đúng thời điểm
  console.log("Khởi động client C (vào muộn)…");
  const C = await client("C");
  await sleep(3500);
  // đọc thời điểm show trên A và C trong cùng một nhịp (so với Date.now() để loại trễ do lời gọi CDP tuần tự)
  const liveA = await A.ev("JSON.stringify({ t: window.DroneShow.getState().t, now: Date.now() })").then(JSON.parse);
  const liveC = await C.ev("JSON.stringify({ t: window.DroneShow.getState().t, now: Date.now() })").then(JSON.parse);
  a = await state(A); const c = await state(C);
  a.ds.t = liveA.t + (liveC.now - liveA.now) / 1000; c.ds.t = liveC.t;
  check("C vào muộn chạy cùng show (cùng seed) đúng giây đang diễn (lệch < 1,5 s)", c.ds.running && c.ds.seed === a.ds.seed && Math.abs(c.ds.t - a.ds.t) < 1.5, { tA: a.ds.t, tC: c.ds.t });
  check("Không avatar trùng sau khi C vào (A thấy 2, C thấy 2)", a.avatars === 2 && c.avatars === 2, { A: a.avatars, C: c.avatars });
  await C.shot("mp_C_latejoin.png");

  // 7. F9 hai lần trên B -> dừng trên cả 3 máy, khôi phục trời
  await B.key("F9", "F9", 120); await sleep(400); await B.key("F9", "F9", 120);
  await sleep(2500);
  a = await state(A); b = await state(B); const c2 = await state(C);
  check("F9 hai lần trên B dừng show trên A, B, C", !a.ds.running && !b.ds.running && !c2.ds.running, [a.ds.running, b.ds.running, c2.ds.running]);
  check("Trời trở lại ban ngày sau khi dừng (trạng thái trước show)", !a.night && !b.night, { a: a.night, b: b.night });

  // 8. F8 vẫn hoạt động sau khi Drone Show kết thúc
  await A.key("F8", "F8", 119);
  await sleep(2500);
  a = await state(A); b = await state(B);
  check("F8 vẫn kích hoạt pháo hoa (đồng bộ sang B)", a.fw && b.fw, { a: a.fw, b: b.fw });
  await A.key("F8", "F8", 119);
  await sleep(1500);

  // 9. Restart nhiều lần không tạo đối tượng trùng / rò rỉ
  const before = await state(A);
  for (let i = 0; i < 4; i++) {
    await A.ev("window.startDroneShow({}, false); true"); await sleep(1800);
    await A.ev("window.stopDroneShow(false); true"); await sleep(400);
  }
  const after = await state(A);
  const mem = await A.ev("JSON.stringify(window.__museum && performance.memory ? { used: performance.memory.usedJSHeapSize } : {})");
  check("Restart 4 lần: số đối tượng trong scene không tăng", after.sceneChildren === before.sceneChildren && after.stageChildren === before.stageChildren,
    { scene: [before.sceneChildren, after.sceneChildren], stage: [before.stageChildren, after.stageChildren], mem });
  // 10. Lỗi console / shader
  const errs = [...A.errors, ...B.errors, ...C.errors].filter((e) => !/favicon|ERR_BLOCKED|net::/i.test(e));
  check("Không có lỗi JS / shader trên 3 client", errs.length === 0, errs.slice(0, 5));
  R.passed = R.checks.filter((x) => x.ok).length; R.total = R.checks.length;
  fs.writeFileSync(path.join(OUT, "multiplayer_report.json"), JSON.stringify(R, null, 2));
  console.log(`\nKết quả: ${R.passed}/${R.total} PASS`);
  A.close(); B.close(); C.close();
  setTimeout(() => process.exit(0), 2000);
})();

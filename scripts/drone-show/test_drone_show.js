// Kiểm thử trực quan Drone Show trên ứng dụng THẬT (Chrome headless qua DevTools Protocol).
//   node scripts/drone-show/test_drone_show.js [--shots=9,30,55] [--tier=balanced] [--fireworks] [--out=dir] [--size=1280x720]
// Yêu cầu: dev server đang chạy (PORT=5191 node Frontend/dev-server.js) và Chrome tại đường dẫn mặc định.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k)); return a ? (a.includes("=") ? a.slice(a.indexOf("=") + 1) : true) : d; };
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + Math.floor(Math.random() * 400);
const APP = process.env.APP_URL || "http://localhost:5191";
const OUT = path.resolve(arg("out", path.join(require("os").tmpdir(), "drone-show-shots")));
const TIER = String(arg("tier", "balanced"));
const [W, H] = String(arg("size", "1280x720")).split("x").map(Number);
const SHOTS = String(arg("shots", "4,9,13.5,18,24,30,36,39,44,49,55,60,66,70,74.5,77,80,86,92,100,106,111,116,120,127,134")).split(",").map(Number);
const VIEWS = String(arg("views", "main,cine")).split(",");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(process.env.TEMP || ".", "ds_test_" + Date.now());
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", `--window-size=${W},${H}`,
    "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`, "about:blank"]);
  let ws = null;
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(300);
    try {
      const list = await new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}/json`, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));
      const pg = list.find((x) => x.type === "page");
      if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl);
    } catch (e) {}
  }
  if (!ws) { console.error("Không kết nối được Chrome"); chrome.kill(); process.exit(1); }
  let id = 1; const pending = new Map(); const logs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = id++; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(d.error) : p.res(d.result); }
    else if (d.method === "Runtime.consoleAPICalled") {
      const txt = d.params.args.map((a) => a.value !== undefined ? a.value : a.description).join(" ");
      logs.push(`[${d.params.type}] ${txt}`);
    } else if (d.method === "Runtime.exceptionThrown") logs.push("[exception] " + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Page.enable"); await send("Runtime.enable");
  // Chạy chế độ một người: chặn backend multiplayer production để không vào phòng của người dùng thật
  // (đặt ALLOW_NET=1 nếu muốn kiểm thử với backend; MUSEUM_ROOM riêng nên đặt qua config khi đó).
  if (!process.env.ALLOW_NET) {
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["*azurewebsites.net*", "*firebaseio.com*", "*signalr*"] });
  }
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, "base64")); };

  console.log("Mở", APP, "· ảnh lưu tại", OUT);
  await send("Page.navigate", { url: `${APP}/?autostart=1&drones=${TIER}${arg("query", "") ? "&" + arg("query", "") : ""}` });
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const st = await ev("JSON.stringify({ started: !!window.started, ds: window.DroneShow ? window.DroneShow.getState() : null })");
    const s = st ? JSON.parse(st) : {};
    if (s.started && s.ds && s.ds.running) { console.log("Drone Show đang chạy sau", i + 1, "s:", JSON.stringify(s.ds)); break; }
    if (i === 89) { console.log("Hết thời gian chờ", st); }
  }
  // GPU/renderer
  console.log("GPU:", await ev(`(() => { const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`));
  const results = [];
  const setView = async (v) => {
    if (v === "main") await ev("window.DroneShow.setCinematic(false); window.DroneShow.cine.k = 0; Object.assign(window.player, { x: 0, z: 37, yaw: 0, pitch: 0.66 }); true");
    else await ev("window.DroneShow.setCinematic(true); window.DroneShow.cine.k = 1; true");
  };
  await ev("window.DroneShow.pause(); true");
  if (arg("prep", "")) await ev(String(arg("prep", "")));   // vd. bật quỹ đạo debug trước khi chụp
  for (const v of VIEWS) {
    await setView(v);
    for (const t of SHOTS) {
      await ev(`window.DroneShow.seek(${t}); window.DroneShow.pause(); true`);
      await sleep(700);
      const name = `${TIER}_${v}_t${String(t).replace(".", "_")}.png`;
      await shot(name);
      const st = JSON.parse(await ev("JSON.stringify(window.DroneShow.getState())"));
      results.push({ view: v, t, scene: st.scene, file: name });
      process.stdout.write(`  · ${v} t=${t}s -> ${name}\n`);
    }
  }
  // chạy thời gian thực một đoạn để đo FPS + kiểm tra chồng lấn
  await setView("main");
  await ev("window.DroneShow.seek(24); window.DroneShow.resume(); true");
  const perf = await ev(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (performance.now() - t0)).toFixed(1), state: window.DroneShow.getState(), overlap: window.DroneShow.checkOverlap(0.8), visualOverlap: window.DroneShow.checkOverlap(0.35) }); }; requestAnimationFrame(f); })`);
  console.log("Hiệu năng (thời gian thực, t=24..28s):", JSON.stringify(perf));
  if (arg("fireworks", false)) {
    await setView(String(arg("fwview", "main")));
    await ev("window.DroneShow.seek(136.5); window.DroneShow.resume(); true");
    for (const [wait, name] of [[4200, "fw_t140"], [3000, "fw_t143"], [3000, "fw_t146"], [3000, "fw_t149"], [3200, "fw_t152"]]) {
      await sleep(wait);
      await shot(`${TIER}_${name}.png`);
      const st = await ev("JSON.stringify({ ds: window.DroneShow.getState(), fw: window.FireworksShow && window.FireworksShow.getState() })");
      console.log("  ·", name, st);
    }
  }
  const errs = logs.filter((l) => /error|exception|shader|THREE\.WebGL/i.test(l));
  fs.writeFileSync(path.join(OUT, `${TIER}_report.json`), JSON.stringify({ app: APP, tier: TIER, size: [W, H], results, perf, consoleErrors: errs, consoleTail: logs.slice(-40) }, null, 2));
  console.log("Lỗi console:", errs.length ? errs : "không có");
  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
})();

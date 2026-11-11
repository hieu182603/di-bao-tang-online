// Benchmark Drone Show trên ứng dụng thật (Chrome headless + GPU máy chạy test).
//   node scripts/drone-show/bench_drone_show.js     (cần dev server ở :5191)
// Đo: FPS nền (bảo tàng ban đêm, không show) và FPS + chi phí CPU của show ở 3 mức chất lượng,
// tại đoạn rồng uốn lượn (t=26–31 s), đoạn quốc kỳ gợn sóng (t=130–135 s) và màn pháo hoa (t=138–143 s).
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL || "http://localhost:5191";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = 9900 + Math.floor(Math.random() * 90);
  const profile = path.join(process.env.TEMP || ".", "ds_bench_" + Date.now());
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, "--headless=new", "--window-size=1280,720", "--use-angle=d3d11", "--enable-gpu",
    "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit", "--disable-background-timer-throttling", `--user-data-dir=${profile}`, "about:blank"]);
  let ws = null;
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(300);
    try {
      const list = await new Promise((res, rej) => http.get(`http://127.0.0.1:${port}/json`, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));
      const pg = list.find((x) => x.type === "page"); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl);
    } catch (e) {}
  }
  let id = 1; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = id++; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(d.error) : p.res(d.result); } };
  await new Promise((r) => (ws.onopen = r));
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*azurewebsites.net*", "*firebaseio.com*", "*signalr*"] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  await send("Page.navigate", { url: `${APP}/?autostart=1` });
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await ev("!!window.started")) break; }
  await sleep(14000);   // chờ warmUp (2,5 / 6 / 12 s) đẩy hết texture lên GPU
  await ev("window.toggleDayNight(true, false); Object.assign(window.player, { x: 0, z: 37, yaw: 0, pitch: 0.66 }); true");
  await sleep(2500);
  const measure = (ms) => ev(`new Promise((res) => { const dts = []; let last = performance.now(); const t0 = last; const c0 = window.DroneShow.stats.ms, f0 = window.DroneShow.stats.frames;
    const f = (now) => { dts.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(f); else {
      dts.shift(); dts.sort((a, b) => a - b); const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
      const info = window.__museum && window.DroneShow.renderer.info.render;
      const df = window.DroneShow.stats.frames - f0;
      res({ fps: +(1000 / avg).toFixed(1), p95ms: +dts[Math.floor(dts.length * 0.95)].toFixed(1), frames: dts.length,
            droneCpuMs: df ? +((window.DroneShow.stats.ms - c0) / df).toFixed(3) : 0, calls: info.calls, points: info.points }); } };
    requestAnimationFrame(f); })`);
  const out = { gpu: await ev(`(() => { const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`), runs: [] };
  out.baseline = await measure(5000);
  console.log("Nền (đêm, không show):", JSON.stringify(out.baseline));
  for (const tier of ["LOW", "BALANCED", "HIGH"]) {
    await ev(`window.DroneShow.stop(); window.DroneShow.forcedTier = "${tier}"; window.DroneShow.start({ tier: "${tier}", at: 26 }).then(() => true)`);
    await sleep(600);
    const dragon = await measure(5000);
    await ev("window.DroneShow.seek(130); true"); await sleep(400);
    const flag = await measure(4000);
    await ev("window.DroneShow.seek(137.5); true"); await sleep(700);
    const finale = await measure(5000);
    const st = await ev("JSON.stringify(window.DroneShow.getState())");
    const row = { tier, drones: JSON.parse(st).drones, dragon, flag, finaleWithFireworks: finale };
    out.runs.push(row);
    console.log(tier, JSON.stringify(row));
  }
  await ev("window.DroneShow.stop(); true");
  const dest = path.join(__dirname, "..", "..", "docs", "drone-show", "screenshots", "benchmark.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  ws.close(); proc.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 1500);
})();

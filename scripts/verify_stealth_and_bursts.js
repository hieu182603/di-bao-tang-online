const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9228;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_stealth_v_" + Date.now());

async function verify() {
  console.log("🚀 Starting verification in Chrome...");
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu-watchdog",
    "--window-size=1280,720",
    "--disable-background-timer-throttling",
    `--user-data-dir=${TEMP_PROFILE}`,
    "about:blank"
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json`, (res) => {
          let body = "";
          res.on("data", d => body += d);
          res.on("end", () => resolve(JSON.parse(body)));
        }).on("error", reject);
      });
      if (res && res.length > 0 && res[0].webSocketDebuggerUrl) {
        wsUrl = res[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("Navigating to http://localhost:5173/?autostart=1 ...");
  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send("Runtime.evaluate", {
      expression: `!document.getElementById('go').disabled`
    });
    if (evalRes.result?.value === true) break;
  }

  // 1. Test F2 (Toggle Day/Night)
  console.log("Pressing F2...");
  await send("Runtime.evaluate", {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }));
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const f2Check = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      isNight: window.getFireworksState().isNight,
      toasts: document.querySelectorAll('.toast').length,
      toastTexts: Array.from(document.querySelectorAll('.toast')).map(t => t.textContent),
      fwTimerBarExists: !!document.getElementById('fw-timer-bar')
    })`
  });
  console.log("F2 Check Result:", JSON.parse(f2Check.result.value));

  // 2. Test F1 (Start Fireworks)
  console.log("Pressing F1...");
  await send("Runtime.evaluate", {
    expression: `
      if (window.player) {
        window.player.pitch = 0.32;
        window.player.z = 18;
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true }));
    `
  });
  await new Promise(r => setTimeout(r, 2200));

  const f1Check = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      running: window.getFireworksState().running,
      elapsed: window.getFireworksState().elapsed,
      toasts: document.querySelectorAll('.toast').length,
      fwTimerBarExists: !!document.getElementById('fw-timer-bar'),
      hudElements: Array.from(document.querySelectorAll('#hud, #room, #people-btn')).map(e => e.id)
    })`
  });
  console.log("F1 Check Result:", JSON.parse(f1Check.result.value));

  // Capture screenshot to confirm zero badges or toasts
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join("C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4", "screenshot_stealth_verified.png"), Buffer.from(shot.data, "base64"));
  console.log("📸 Saved screenshot_stealth_verified.png");

  ws.close();
  chromeProcess.kill();
  console.log("✅ Verification complete!");
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});


const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_high_fw_" + Date.now());

async function runTest() {
  console.log("🚀 Starting Chrome in headless mode for High-Altitude Fine Fireworks test...");
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu-watchdog",
    "--window-size=1280,720",
    "--disable-background-timer-throttling",
    `--user-data-dir=${TEMP_PROFILE}`,
    "about:blank"
  ]);

  chromeProcess.on("error", (err) => {
    console.error("Failed to spawn Chrome:", err);
    process.exit(1);
  });

  // Wait for debug port
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

  if (!wsUrl) {
    console.error("❌ Could not connect to Chrome DevTools port.");
    chromeProcess.kill();
    process.exit(1);
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

  console.log("Waiting for app initialization...");
  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        loaded: !!window.FireworksShow,
        ready: !document.getElementById('go').disabled
      })`
    });
    const st = JSON.parse(evalRes.result?.value || "{}");
    if (st.loaded && st.ready) {
      console.log("App loaded and ready!");
      break;
    }
  }

  // Switch to night, tilt player pitch up to look at the high night sky
  await send("Runtime.evaluate", {
    expression: `
      window.toggleDayNight(true);
      if (window.player) {
        window.player.pitch = 0.48; // Tilt head ~28 degrees up towards high sky
        window.player.z = 24;      // Move a bit forward into courtyard
      }
      window.startFireworks();
    `
  });

  console.log("Fireworks started! Waiting 3.5s for early high bursts...");
  await new Promise(r => setTimeout(r, 3500));
  let shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join("C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4", "screenshot_fireworks_high_part1.png"), Buffer.from(shot.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_high_part1.png");

  // Wait for 9s (Part 2 - high triple chrysanthemums at 120-158m)
  console.log("Waiting 6s for Part II high chrysanthemums...");
  await new Promise(r => setTimeout(r, 6000));
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join("C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4", "screenshot_fireworks_high_part2.png"), Buffer.from(shot.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_high_part2.png");

  // Spawn Giant Golden Willow Kamuro at 165m high
  console.log("Testing Giant Golden Willow Kamuro at 165m altitude...");
  await send("Runtime.evaluate", {
    expression: `
      window.spawnEffect('goldenWillow', 'C1', { isGiant: true, targetHeight: 165 });
      window.spawnEffect('chrysanthemum', 'L2', { targetHeight: 135, color: window.FireworksConfig.colors.ruby, colorInner: window.FireworksConfig.colors.gold });
      window.spawnEffect('chrysanthemum', 'R2', { targetHeight: 135, color: window.FireworksConfig.colors.sapphire, colorInner: window.FireworksConfig.colors.white });
    `
  });
  await new Promise(r => setTimeout(r, 1400));
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join("C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4", "screenshot_fireworks_high_willow.png"), Buffer.from(shot.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_high_willow.png");

  // Check state
  const evalRes = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      running: window.FireworksShow.isRunning,
      elapsed: window.FireworksShow.elapsed,
      capacity: window.FireworksShow.particleSystem.capacity,
      toasts: document.querySelectorAll('.toast, .fw-badge, #fw-timer-bar:not([hidden])').length
    })`
  });
  console.log("State:", JSON.parse(evalRes.result?.value || "{}"));

  ws.close();
  chromeProcess.kill();
  console.log("✅ High fireworks test finished successfully!");
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});


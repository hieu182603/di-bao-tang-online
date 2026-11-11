const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9235;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_grand_fw_" + Date.now());
const ARTIFACT_DIR = "C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4";

async function runGrandTest() {
  console.log("🚀 Starting Chrome in headless mode for Grand 3D Fireworks test...");
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

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send("Runtime.evaluate", {
      expression: `!!window.FireworksShow && !document.getElementById('go').disabled`
    });
    if (evalRes.result?.value === true) break;
  }

  console.log("App ready! Positioning player and camera to view high fireworks...");
  await send("Runtime.evaluate", {
    expression: `
      window.toggleDayNight(true);
      if (window.player) {
        window.player.x = 0;
        window.player.z = 24;
        window.player.pitch = 0.38; // Looking up at ~22 deg towards fireworks above museum
      }
      window.startFireworks();
    `
  });

  // Capture helper
  async function snap(filename, label) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(shot.data, "base64"));
    console.log(`📸 [${label}] Saved ${filename}`);
  }

  async function waitForElapsed(targetSec) {
    while (true) {
      const res = await send("Runtime.evaluate", {
        expression: `window.FireworksShow ? window.FireworksShow.elapsed : 0`
      });
      const el = res.result?.value || 0;
      if (el >= targetSec) break;
      await new Promise(r => setTimeout(r, 80));
    }
  }

  console.log("Waiting for Chapter 1 Opening (4.0s: Giant Ruby-Gold Chrysanthemum + Pairs)...");
  await waitForElapsed(4.0);
  await snap("grand_fw_ch1_opening.png", "Chapter 1 Opening");

  console.log("Waiting for Chapter 2 Bloom (9.6s: Royal Gold Palms & Mine Fountains)...");
  await waitForElapsed(9.6);
  await snap("grand_fw_ch2_bloom.png", "Chapter 2 Bloom");

  console.log("Waiting for Chapter 3 Thác Vàng Kamuro Willow (17.5s: 3-Tier Cascading Gold Waterfall)...");
  await waitForElapsed(17.5);
  await snap("grand_fw_ch3_willow.png", "Chapter 3 Willow Waterfall");

  console.log("Waiting for Chapter 4 Accelerando Barrage (27.8s: V-Comets + 3 High Chrysanthemums)...");
  await waitForElapsed(27.8);
  await snap("grand_fw_ch4_barrage.png", "Chapter 4 Accelerando");

  console.log("Waiting for Chapter 5 Sky Panorama (36.8s: Symmetrical Multi-tier Barrage)...");
  await waitForElapsed(36.8);
  await snap("grand_fw_ch5_panorama.png", "Chapter 5 Panorama");

  console.log("Waiting for Chapter 6 Grand Finale (42.2s: 3 Giant Willows + Ruby/White Bursts)...");
  await waitForElapsed(42.2);
  await snap("grand_fw_ch6_finale_willows.png", "Chapter 6 Finale Willows");

  console.log("Waiting for Chapter 6 Final Wall Burst (44.2s: Full Sky Fire Wall + Culmination)...");
  await waitForElapsed(44.2);
  await snap("grand_fw_ch6_final_wall.png", "Chapter 6 Final Wall");

  const diag = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      running: window.FireworksShow.isRunning,
      elapsed: window.FireworksShow.elapsed,
      capacity: window.FireworksShow.particleSystem.capacity,
      toasts: document.querySelectorAll('.toast').length
    })`
  });
  console.log("Diagnostics:", JSON.parse(diag.result.value || "{}"));

  ws.close();
  chromeProcess.kill();
  console.log("✅ All Grand Fireworks tests completed successfully!");
}

runGrandTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});

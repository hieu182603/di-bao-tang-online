const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_fw_test_" + Date.now());

async function runTest() {
  console.log("🚀 Starting Chrome in headless mode for 3D Fireworks test...");
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

  console.log("Connected to Chrome CDP WebSocket:", wsUrl);
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
    } else if (data.method === "Runtime.consoleAPICalled") {
      const args = data.params.args.map(a => a.value || a.description).join(" ");
      console.log(`[Browser Console] ${args}`);
    }
  };

  await new Promise(r => ws.onopen = r);
  console.log("WebSocket open. Enabling Page & Runtime...");
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("Navigating to http://localhost:5173/?autostart=1&f8=1 ...");
  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1&f8=1" });

  // Monitor loading
  console.log("Waiting for museum and 3D fireworks to initialize...");
  let started = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        loaded: !document.getElementById('go').disabled,
        running: window.FireworksShow && window.FireworksShow.isRunning,
        elapsed: window.FireworksShow ? window.FireworksShow.elapsed : 0,
        quality: window.FireworksQualityManager ? window.FireworksQualityManager.currentTier : '',
        particleCount: window.FireworksShow && window.FireworksShow.particleSystem ? window.FireworksShow.particleSystem.capacity : 0
      })`
    });
    const state = JSON.parse(evalRes.result.value || "{}");
    console.log(`[Status check ${i}s]`, state);

    if (state.running) {
      started = true;
      break;
    }
  }

  if (!started) {
    console.log("Triggering start manually via CDP...");
    await send("Runtime.evaluate", {
      expression: `if (window.FireworksShow) window.FireworksShow.start();`
    });
  }

  // Capture screenshot during Part I (Comet Fan / Chrysanthemum)
  console.log("Waiting 3s for Part I fireworks...");
  await new Promise(r => setTimeout(r, 3000));
  const shot1 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(__dirname, "..", "screenshot_fireworks_part1.png"), Buffer.from(shot1.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_part1.png");

  // Capture screenshot during Part IV (Golden Willow)
  console.log("Testing Golden Willow cascade effect...");
  await send("Runtime.evaluate", {
    expression: `window.spawnEffect('goldenWillow', 'C1', { isGiant: true, targetHeight: 65 });`
  });
  await new Promise(r => setTimeout(r, 1200));
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(__dirname, "..", "screenshot_fireworks_willow.png"), Buffer.from(shot2.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_willow.png");

  // Capture Grand Finale Wall Burst
  console.log("Testing Grand Finale Wall Burst...");
  await send("Runtime.evaluate", {
    expression: `
      window.spawnEffect('cometFan', 'L4', { rays: 8, color: window.FireworksConfig.colors.gold });
      window.spawnEffect('cometFan', 'R4', { rays: 8, color: window.FireworksConfig.colors.gold });
      window.spawnEffect('chrysanthemum', 'C1', { targetHeight: 65, color: window.FireworksConfig.colors.ruby, colorInner: window.FireworksConfig.colors.gold });
      window.spawnEffect('goldenWillow', 'C2', { targetHeight: 70, isGiant: true });
    `
  });
  await new Promise(r => setTimeout(r, 1000));
  const shot3 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(__dirname, "..", "screenshot_fireworks_finale.png"), Buffer.from(shot3.data, "base64"));
  console.log("📸 Saved screenshot_fireworks_finale.png");

  // Diagnostics report
  const diag = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      running: window.FireworksShow.isRunning,
      elapsed: window.FireworksShow.elapsed,
      cueCount: window.FireworksCueSheet.length,
      quality: window.FireworksQualityManager.currentTier,
      maxParticles: window.FireworksQualityManager.budget.maxParticles,
      hasShaderError: !!window.__shaderError
    })`
  });
  console.log("📊 Final Diagnostics Report:", JSON.parse(diag.result.value || "{}"));

  ws.close();
  chromeProcess.kill();
  console.log("✅ Headless test completed successfully!");
}

runTest().catch(err => {
  console.error("Error in runTest:", err);
  process.exit(1);
});


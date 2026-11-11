const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9237;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_trees_" + Date.now());
const ARTIFACT_DIR = "C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4";

async function verifyTrees() {
  console.log("🚀 Starting Chrome in headless mode for 3D Tree verification...");
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

  if (!wsUrl) {
    console.error("❌ Could not connect to Chrome port.");
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
      expression: `!!window.player && !document.getElementById('go').disabled`
    });
    if (evalRes.result?.value === true) break;
  }

  // Wait 2.5s for 3D GLB models to load
  await new Promise(r => setTimeout(r, 2500));

  console.log("Setting player position in playground to view tree at [-49, 5.2]...");
  await send("Runtime.evaluate", {
    expression: `
      if (window.player) {
        window.player.x = -48.2;
        window.player.z = 7.5;
        window.player.yaw = -2.85; // Look towards [-49, 5.2]
        window.player.pitch = 0.15;
      }
    `
  });

  await new Promise(r => setTimeout(r, 800));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const filename = "screenshot_3d_trees_replaced.png";
  const fullPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(fullPath, Buffer.from(shot.data, "base64"));
  console.log(`📸 Saved ${filename}`);

  ws.close();
  chromeProcess.kill();
  console.log("✅ 3D Tree verification complete!");
}

verifyTrees().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});


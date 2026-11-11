const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9238;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_leaf_test_" + Date.now());
const ARTIFACT_DIR = "C:\\Users\\os\\.gemini\\antigravity\\brain\\63d4dab1-9926-4855-8ee9-06c5526f34b4";

async function testLeaf() {
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

  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send("Runtime.evaluate", {
      expression: `!!window.player && !document.getElementById('go').disabled`
    });
    if (evalRes.result?.value === true) break;
  }

  await new Promise(r => setTimeout(r, 2500));

  // Inspect tree meshes in scene
  const evalTree = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const leafMeshes = [];
        window.scene.traverse(o => {
          if (o.isMesh && o.material && (o.material.name === "normal_leaves" || o.name.includes("leaves"))) {
            leafMeshes.push({
              name: o.name,
              matName: o.material.name,
              transparent: o.material.transparent,
              alphaTest: o.material.alphaTest,
              side: o.material.side,
              hasMap: !!o.material.map,
              visible: o.visible,
              color: o.material.color ? o.material.color.getHexString() : null
            });
            // Fix in live scene to test
            o.material.side = 2; // DoubleSide
            o.material.alphaTest = 0.4;
            o.material.depthWrite = true;
            o.material.needsUpdate = true;
          }
        });
        return JSON.stringify(leafMeshes.slice(0, 5));
      })()
    `
  });
  console.log("Tree leaves info:", evalTree.result?.value);

  // Take screenshot looking close at one tree
  await send("Runtime.evaluate", {
    expression: `
      if (window.player) {
        window.player.x = -48.2;
        window.player.z = 7.5;
        window.player.yaw = -2.85;
        window.player.pitch = 0.2;
      }
    `
  });

  await new Promise(r => setTimeout(r, 600));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARTIFACT_DIR, "screenshot_tree_leaves_fixed.png"), Buffer.from(shot.data, "base64"));
  console.log("📸 Saved screenshot_tree_leaves_fixed.png");

  ws.close();
  chromeProcess.kill();
}

testLeaf().catch(console.error);


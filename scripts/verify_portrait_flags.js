const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

function makeClient(wsUrl) {
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
  return { ws, send };
}

async function verifyPortrait() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9291",
    "--window-size=1280,720",
    "--user-data-dir=" + path.join(process.env.TEMP || "C:\\Temp", "ch_vport_" + Date.now()),
    "about:blank"
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get("http://127.0.0.1:9291/json", res => {
          let b = ""; res.on("data", d => b += d); res.on("end", () => resolve(JSON.parse(b)));
        }).on("error", reject);
      });
      if (res && res[0] && res[0].webSocketDebuggerUrl) {
        wsUrl = res[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  const client = makeClient(wsUrl);
  await new Promise(r => client.ws.onopen = r);

  await client.send("Page.enable");
  await client.send("Runtime.enable");

  console.log("Navigating to http://localhost:5173/?autostart=1 ...");
  await client.send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });

  console.log("Waiting for game to load & enter...");
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await client.send("Runtime.evaluate", {
      expression: `(() => {
        if (window.started) return true;
        const go = document.getElementById("go");
        if (go && !go.disabled && document.getElementById("start") && !document.getElementById("start").hidden) {
          go.click();
        }
        return !!window.started;
      })()`,
      returnByValue: true
    });
    if (res && res.result && res.result.value) {
      console.log("Game started successfully!");
      break;
    }
  }

  await new Promise(r => setTimeout(r, 1500));

  // Teleport in front of the portrait wall:
  // Wall is at z = -23.8, y = 5.88.
  // Player at z = -14, y = 1.6, yaw = 0 (facing -z), pitch = 0.28
  console.log("Positioning camera in front of portrait wall...");
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      window.__museum.player.x = 0;
      window.__museum.player.z = -14.2;
      window.__museum.player.y = 1.6;
      window.__museum.player.yaw = 0;
      window.__museum.player.pitch = 0.32;
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  const snap = await client.send("Page.captureScreenshot", { format: "png" });
  const buf = Buffer.from(snap.data, "base64");
  fs.writeFileSync("C:/Users/os/.gemini/antigravity/brain/63d4dab1-9926-4855-8ee9-06c5526f34b4/screenshot_portrait_swapped_flags.png", buf);
  console.log("✅ Saved screenshot_portrait_swapped_flags.png!");

  client.ws.close();
  chrome.kill();
  console.log("Verification finished!");
}

verifyPortrait().catch(console.error);


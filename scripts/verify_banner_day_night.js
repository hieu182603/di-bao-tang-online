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

async function verifyBanner() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9294",
    "--window-size=1280,720",
    "--user-data-dir=" + path.join(process.env.TEMP || "C:\\Temp", "ch_vban_" + Date.now()),
    "about:blank"
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get("http://127.0.0.1:9294/json", res => {
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
  for (let i = 0; i < 25; i++) {
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

  // Position player in front of party banner at x = -10.8, z = 7.6
  // Looking toward the museum building (-z)
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      window.__museum.player.x = -10.8;
      window.__museum.player.z = 10.4;
      window.__museum.player.y = 1.6;
      window.__museum.player.yaw = 0;      // facing -z toward the banner & museum
      window.__museum.player.pitch = 0.16; // looking slightly up at banner
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  // Ensure daytime first
  await client.send("Runtime.evaluate", { expression: `window.toggleDayNight(false);` });
  await new Promise(r => setTimeout(r, 800));

  // 1. Capture Daytime Screenshot
  const snapDay = await client.send("Page.captureScreenshot", { format: "png" });
  const dayBuf = Buffer.from(snapDay.data, "base64");
  fs.writeFileSync("C:/Users/os/.gemini/antigravity/brain/63d4dab1-9926-4855-8ee9-06c5526f34b4/screenshot_banner_day.png", dayBuf);
  console.log("✅ Saved screenshot_banner_day.png!");

  // 2. Switch to Nighttime (F2)
  console.log("Switching to Night (F2)...");
  await client.send("Runtime.evaluate", { expression: `window.toggleDayNight(true);` });
  await new Promise(r => setTimeout(r, 1000));

  // 3. Capture Nighttime Screenshot
  const snapNight = await client.send("Page.captureScreenshot", { format: "png" });
  const nightBuf = Buffer.from(snapNight.data, "base64");
  fs.writeFileSync("C:/Users/os/.gemini/antigravity/brain/63d4dab1-9926-4855-8ee9-06c5526f34b4/screenshot_banner_night.png", nightBuf);
  console.log("✅ Saved screenshot_banner_night.png!");

  client.ws.close();
  chrome.kill();
  console.log("Verification finished successfully!");
}

verifyBanner().catch(console.error);

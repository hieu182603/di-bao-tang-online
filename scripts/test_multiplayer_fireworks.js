const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT1 = 9262;
const PORT2 = 9263;
const TEMP1 = path.join(process.env.TEMP || "C:\\Temp", "chrome_mp_1_" + Date.now());
const TEMP2 = path.join(process.env.TEMP || "C:\\Temp", "chrome_mp_2_" + Date.now());

async function connectCDP(port) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json`, (res) => {
          let body = "";
          res.on("data", d => body += d);
          res.on("end", () => resolve(JSON.parse(body)));
        }).on("error", reject);
      });
      if (res && res.length > 0 && res[0].webSocketDebuggerUrl) {
        return res[0].webSocketDebuggerUrl;
      }
    } catch (e) {}
  }
  return null;
}

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

async function runMultiplayerTest() {
  console.log("🚀 Starting 2 Chrome clients with autostart=1...");

  const cp1 = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT1}`,
    "--headless=new",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${TEMP1}`,
    "about:blank"
  ]);

  const cp2 = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT2}`,
    "--headless=new",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${TEMP2}`,
    "about:blank"
  ]);

  const [wsUrl1, wsUrl2] = await Promise.all([connectCDP(PORT1), connectCDP(PORT2)]);
  if (!wsUrl1 || !wsUrl2) {
    console.error("❌ Failed to connect to one of the Chrome instances");
    cp1.kill(); cp2.kill();
    process.exit(1);
  }

  const c1 = makeClient(wsUrl1);
  const c2 = makeClient(wsUrl2);

  await Promise.all([
    new Promise(r => c1.ws.onopen = r),
    new Promise(r => c2.ws.onopen = r)
  ]);

  await Promise.all([
    c1.send("Page.enable"),
    c2.send("Page.enable")
  ]);

  console.log("🌐 Navigating both clients to http://localhost:5173/?autostart=1 ...");
  await Promise.all([
    c1.send("Page.navigate", { url: "http://localhost:5173/?autostart=1" }),
    c2.send("Page.navigate", { url: "http://localhost:5173/?autostart=1" })
  ]);

  // Wait for 3D world, entering museum, and SignalR connection
  console.log("⏳ Waiting 6 seconds for both clients to enter museum and connect to SignalR...");
  await new Promise(r => setTimeout(r, 6000));

  // Check networking status of both clients
  const status1 = await c1.send("Runtime.evaluate", {
    expression: `({ mode: window.Net.mode, status: window.Net.status, selfId: window.Net.selfId, peersCount: window.Net.peers.size })`,
    returnByValue: true
  });
  const status2 = await c2.send("Runtime.evaluate", {
    expression: `({ mode: window.Net.mode, status: window.Net.status, selfId: window.Net.selfId, peersCount: window.Net.peers.size })`,
    returnByValue: true
  });

  console.log("Client 1 Status:", status1.result.value);
  console.log("Client 2 Status:", status2.result.value);

  // Client 1 triggers fireworks!
  console.log("🎆 Client 1 triggers fireworks (F1 / toggleFireworks)...");
  await c1.send("Runtime.evaluate", {
    expression: `window.toggleFireworks();`,
  });

  // Wait 2.5 seconds for network packet to arrive and synchronize
  await new Promise(r => setTimeout(r, 2500));

  const fw1 = await c1.send("Runtime.evaluate", {
    expression: `({
      running: window.FireworksShow ? window.FireworksShow.isRunning : false,
      seed: window.FireworksShow ? window.FireworksShow.seed : null,
      elapsed: window.FireworksShow ? window.FireworksShow.elapsed : 0,
      isNight: window.getFireworksState().isNight
    })`,
    returnByValue: true
  });

  const fw2 = await c2.send("Runtime.evaluate", {
    expression: `({
      running: window.FireworksShow ? window.FireworksShow.isRunning : false,
      seed: window.FireworksShow ? window.FireworksShow.seed : null,
      elapsed: window.FireworksShow ? window.FireworksShow.elapsed : 0,
      isNight: window.getFireworksState().isNight
    })`,
    returnByValue: true
  });

  console.log("Client 1 Fireworks State:", fw1.result.value);
  console.log("Client 2 Fireworks State:", fw2.result.value);

  const isSynchronized = fw1.result.value.running && fw2.result.value.running && (fw1.result.value.seed === fw2.result.value.seed);
  console.log("🏆 Result:", isSynchronized ? "✅ SYNCHRONIZATION SUCCESSFUL!" : "❌ Synchronization failed");

  c1.ws.close(); c2.ws.close();
  cp1.kill(); cp2.kill();
}

runMultiplayerTest().catch(console.error);

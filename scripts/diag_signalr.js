const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9265;
const TEMP = path.join(process.env.TEMP || "C:\\Temp", "chrome_diag_" + Date.now());

async function diagSignalR() {
  const cp = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    `--user-data-dir=${TEMP}`,
    "about:blank"
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
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
  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });
  await new Promise(r => setTimeout(r, 3000));

  const diag = await send("Runtime.evaluate", {
    expression: `(async () => {
      const errors = [];
      try {
        if (!window.signalR) {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js";
          await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        }
        
        const cleanUrl = "https://baotang-lsd-12222.azurewebsites.net";
        const conn = new window.signalR.HubConnectionBuilder()
          .withUrl(cleanUrl + "/museumHub")
          .build();
        
        await conn.start();
        return { success: true, connectionId: conn.connectionId, state: conn.state };
      } catch(e) {
        return { success: false, error: e.toString(), stack: e.stack };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Direct Azure SignalR test in Chrome:", JSON.stringify(diag.result.value, null, 2));

  ws.close();
  cp.kill();
}

diagSignalR().catch(console.error);


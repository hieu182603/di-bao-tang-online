const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9246;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_audio_stop_test_" + Date.now());

async function runStopTest() {
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1280,720",
    `--user-data-dir=${TEMP_PROFILE}`,
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
  await send("Page.navigate", { url: "http://localhost:5173" });
  await new Promise(r => setTimeout(r, 2000));

  const startRes = await send("Runtime.evaluate", {
    expression: `(async () => {
      window.startFireworks();
      await new Promise(r => setTimeout(r, 1000));
      return {
        running: window.FireworksShow.isRunning,
        ambient: !!window.FireworksAudio.ambientNode
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Start res:", startRes.result.value);

  const stopRes = await send("Runtime.evaluate", {
    expression: `(async () => {
      window.FireworksShow.stop();
      return {
        running: window.FireworksShow.isRunning,
        ambientGainValue: window.FireworksAudio.ambientGain ? window.FireworksAudio.ambientGain.gain.value : null
      };
    })()`,
    returnByValue: true
  });
  console.log("Stop res:", stopRes.result.value);

  ws.close();
  chromeProcess.kill();
}

runStopTest().catch(console.error);


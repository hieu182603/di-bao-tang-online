const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9239;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_audio_insp_" + Date.now());

async function inspectAudio() {
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=800,600",
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

  if (!wsUrl) {
    console.error("No wsUrl");
    chromeProcess.kill();
    return;
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

  const result = await send("Runtime.evaluate", {
    expression: `(async () => {
      const files = [
        'sounds/tieng_phao_hoa_no.mp3',
        'sounds/tieng_phao_hoa_no_tren_bau_troi.mp3',
        'sounds/tieng_ban_phao_hoa.mp3',
        'sounds/tieng_phao_hoa_hu_len_troi.mp3'
      ];
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const info = [];
      for (const f of files) {
        try {
          const resp = await fetch(f);
          const buf = await resp.arrayBuffer();
          const audio = await ctx.decodeAudioData(buf);
          info.push({
            file: f,
            duration: audio.duration,
            sampleRate: audio.sampleRate,
            numberOfChannels: audio.numberOfChannels
          });
        } catch(e) {
          info.push({ file: f, error: e.message });
        }
      }
      return info;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Audio decode result:", JSON.stringify(result.result.value, null, 2));

  ws.close();
  chromeProcess.kill();
}

inspectAudio().catch(console.error);


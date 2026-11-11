const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9241;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_audio_catalog_" + Date.now());

async function catalogAudio() {
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
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

  const result = await send("Runtime.evaluate", {
    expression: `(async () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      async function findHighEnergySegments(url, minEnergy = 0.5, minSpacing = 0.8) {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0);
        const sr = audio.sampleRate;
        const segments = [];
        const win = Math.floor(sr * 0.02); // 20ms
        let lastT = -minSpacing;
        
        for (let i = 0; i < data.length - win; i += win) {
          let sumSq = 0;
          for (let j = 0; j < win; j++) {
            sumSq += data[i + j] * data[i + j];
          }
          const rms = Math.sqrt(sumSq / win);
          const t = i / sr;
          if (rms > minEnergy && (t - lastT) >= minSpacing) {
            // Find peak around here
            let peakVal = 0, peakIdx = i;
            for (let j = 0; j < win * 3 && (i + j) < data.length; j++) {
              const v = Math.abs(data[i + j]);
              if (v > peakVal) { peakVal = v; peakIdx = i + j; }
            }
            const offset = Math.max(0, (peakIdx / sr) - 0.03); // 30ms before transient
            segments.push({
              offset: parseFloat(offset.toFixed(3)),
              peak: parseFloat(peakVal.toFixed(2)),
              rms: parseFloat(rms.toFixed(2))
            });
            lastT = t;
          }
        }
        return { file: url, count: segments.length, segments: segments.slice(0, 20) };
      }

      return {
        bursts_sky: await findHighEnergySegments('sounds/tieng_phao_hoa_no_tren_bau_troi.mp3', 0.25, 1.2),
        bursts_ground: await findHighEnergySegments('sounds/tieng_phao_hoa_no.mp3', 0.35, 0.9),
        launches: await findHighEnergySegments('sounds/tieng_ban_phao_hoa.mp3', 0.3, 0.6)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Catalog result:", JSON.stringify(result.result.value, null, 2));

  ws.close();
  chromeProcess.kill();
}

catalogAudio().catch(console.error);


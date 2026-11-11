const fs = require("fs");
const path = require("path");

// Inspect the audio data using the browser's decoded buffers
const { spawn } = require("child_process");
const http = require("http");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9240;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_audio_slice_" + Date.now());

async function analyzePeaks() {
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
      
      async function findPeaks(url, threshold = 0.5) {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0);
        const sr = audio.sampleRate;
        const peaks = [];
        const win = Math.floor(sr * 0.05); // 50ms window
        let lastPeakTime = -1;
        for (let i = 0; i < data.length; i += win) {
          let maxVal = 0;
          for (let j = 0; j < win && (i + j) < data.length; j++) {
            const v = Math.abs(data[i + j]);
            if (v > maxVal) maxVal = v;
          }
          const t = i / sr;
          if (maxVal > threshold && (t - lastPeakTime) > 0.4) {
            peaks.push({ time: parseFloat(t.toFixed(2)), maxVal: parseFloat(maxVal.toFixed(2)) });
            lastPeakTime = t;
          }
        }
        return { file: url, totalDur: audio.duration, peakCount: peaks.length, peaks: peaks.slice(0, 15) };
      }

      return [
        await findPeaks('sounds/tieng_phao_hoa_no.mp3', 0.4),
        await findPeaks('sounds/tieng_phao_hoa_no_tren_bau_troi.mp3', 0.4)
      ];
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Analysis result:", JSON.stringify(result.result.value, null, 2));

  ws.close();
  chromeProcess.kill();
}

analyzePeaks().catch(console.error);


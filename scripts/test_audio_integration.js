const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9245;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "chrome_audio_test_" + Date.now());

async function runTest() {
  console.log("🚀 Launching Chrome to test real fireworks audio...");
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

  const consoleLogs = [];
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === "Runtime.consoleAPICalled") {
      const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(" ");
      consoleLogs.push(`[${data.params.type}] ${text}`);
    }
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

  console.log("🌐 Navigating to http://localhost:5173 ...");
  await send("Page.navigate", { url: "http://localhost:5173" });
  await new Promise(r => setTimeout(r, 2500));

  // Initialize and check FireworksAudio
  const evalInit = await send("Runtime.evaluate", {
    expression: `(async () => {
      if (typeof FireworksAudio === "undefined") return { error: "FireworksAudio not found" };
      FireworksAudio.ensure();
      await FireworksAudio.loadAudio();
      
      const bufStatus = {
        skyBoom: !!FireworksAudio.buffers.skyBoom && FireworksAudio.buffers.skyBoom.duration,
        groundBoom: !!FireworksAudio.buffers.groundBoom && FireworksAudio.buffers.groundBoom.duration,
        launch: !!FireworksAudio.buffers.launch && FireworksAudio.buffers.launch.duration,
        whistle: !!FireworksAudio.buffers.whistle && FireworksAudio.buffers.whistle.duration,
        isLoaded: FireworksAudio.isLoaded
      };
      
      return bufStatus;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Audio buffer status:", JSON.stringify(evalInit.result.value, null, 2));

  // Test firing individual sounds and startShowAmbient
  const testFiring = await send("Runtime.evaluate", {
    expression: `(() => {
      try {
        FireworksAudio.startShowAmbient();
        FireworksAudio.launch(0, 0, -40, 1.2);
        FireworksAudio.boom(0, 120, -120, 1.5);
        FireworksAudio.crackle(0, 100, -100, 20);
        return {
          ambientRunning: !!FireworksAudio.ambientNode,
          voices: FireworksAudio.voices.length,
          audioCtxState: FireworksAudio.ctx ? FireworksAudio.ctx.state : null
        };
      } catch(e) {
        return { error: e.message };
      }
    })()`,
    returnByValue: true
  });

  console.log("Sound firing test:", JSON.stringify(testFiring.result.value, null, 2));

  // Start the full show
  console.log("🎆 Testing window.startFireworks() ...");
  const showTest = await send("Runtime.evaluate", {
    expression: `(() => {
      window.startFireworks();
      return {
        showRunning: window.FireworksShow && window.FireworksShow.isRunning,
        ambientNodeActive: !!(window.FireworksAudio && window.FireworksAudio.ambientNode),
        isNight: window.getFireworksState ? window.getFireworksState().isNight : null
      };
    })()`,
    returnByValue: true
  });

  console.log("Show start test:", JSON.stringify(showTest.result.value, null, 2));

  // Wait 4 seconds during active barrage
  await new Promise(r => setTimeout(r, 4000));

  // Check toast/HUD elements to ensure 100% stealth
  const stealthCheck = await send("Runtime.evaluate", {
    expression: `(() => {
      const toasts = document.querySelectorAll('.fw-toast, .toast, .fireworks-toast, .banner-toast, #fw-toast');
      const textMatches = Array.from(document.querySelectorAll('div, span, p')).filter(el => {
        const t = el.innerText || '';
        return t.includes('pháo hoa') || t.includes('Ban ngày') || t.includes('Ban đêm');
      }).map(el => el.outerHTML);

      return {
        toastCount: toasts.length,
        visibleTextMatches: textMatches
      };
    })()`,
    returnByValue: true
  });

  console.log("Stealth check:", JSON.stringify(stealthCheck.result.value, null, 2));

  if (consoleLogs.length) {
    console.log("Recent browser console messages:", consoleLogs.slice(-10));
  }

  console.log("✅ Verification complete.");
  ws.close();
  chromeProcess.kill();
}

runTest().catch(console.error);


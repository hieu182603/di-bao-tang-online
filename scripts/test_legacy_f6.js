const { spawn } = require("child_process");
const http = require("http");

async function runTest() {
  console.log("1. Starting Chrome in headless mode...");
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9292",
    "about:blank"
  ]);

  await new Promise(r => setTimeout(r, 1500));

  console.log("2. Connecting to Chrome DevTools...");
  const tabs = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9292/json", res => {
      let b = "";
      res.on("data", d => b += d);
      res.on("end", () => resolve(JSON.parse(b)));
    }).on("error", reject);
  });

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const cur = id++;
    const h = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === cur) {
        ws.removeEventListener("message", h);
        if (d.error) rej(d.error);
        else res(d.result);
      }
    };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: cur, method, params }));
  });

  ws.addEventListener("message", e => {
    const d = JSON.parse(e.data);
    if (d.method === "Runtime.consoleAPICalled") {
      const msg = d.params.args.map(a => a.value || a.description || "").join(" ");
      if (d.params.type === "error" || msg.includes("Drone") || msg.includes("Legacy") || msg.includes("Fireworks")) {
        console.log(`[Browser ${d.params.type}]`, msg);
      }
    }
    if (d.method === "Runtime.exceptionThrown") {
      console.error("[Browser Exception]", d.params.exceptionDetails.text, d.params.exceptionDetails.exception?.description);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");

  console.log("3. Navigating to http://localhost:5173/?autostart=1...");
  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });

  // Wait for museum to load
  let started = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await send("Runtime.evaluate", {
      expression: `(() => {
        const go = document.getElementById("go");
        if (go && !go.disabled) {
          try { go.click(); } catch(e) {}
        }
        return {
          started: typeof started !== "undefined" ? started : false,
          hasDroneLegacyShow: typeof window.DroneLegacyShow !== "undefined",
          hasDroneShow: typeof window.DroneShow !== "undefined",
          hasFireworksShow: typeof window.FireworksShow !== "undefined"
        };
      })()`,
      returnByValue: true
    });
    const val = res.result?.value;
    if (val && val.started) {
      console.log(`Museum started after ${i + 1}s! Classes present:`, val);
      started = true;
      break;
    }
  }

  if (!started) {
    throw new Error("Museum did not start within 30 seconds");
  }

  console.log("4. Testing F6 keyboard event dispatch...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const evt = new KeyboardEvent("keydown", { code: "F6", key: "F6", bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
    })()`
  });

  // Wait for legacy show to start
  let legacyRunning = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await send("Runtime.evaluate", {
      expression: `(() => {
        const DLS = window.DroneLegacyShow;
        return {
          isRunning: DLS ? DLS.isRunning : false,
          pending: DLS ? DLS.pending : false,
          t: DLS ? DLS.t : -1,
          drones: DLS && DLS.data ? DLS.data.N : 0,
          formations: DLS && DLS.data && DLS.data.timeline ? DLS.data.timeline.formations.length : 0
        };
      })()`,
      returnByValue: true
    });
    const st = res.result?.value;
    console.log(`[Check F6 state ${i + 1}]:`, st);
    if (st && st.isRunning) {
      legacyRunning = true;
      console.log(`PASS: Blender 7-scene Drone Show is running with ${st.drones} drones (${st.formations} formations) at t=${st.t}s!`);
      break;
    }
  }

  if (!legacyRunning) {
    throw new Error("Legacy drone show failed to start from F6");
  }

  console.log("5. Seeking to t = 148s (final flag scene, right before F8 fireworks transition)...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      window.DroneLegacyShow.seek(148);
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  console.log("6. Advancing past 150s to verify F8 fireworks combo transition...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      window.DroneLegacyShow.seek(151);
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  const comboState = await send("Runtime.evaluate", {
    expression: `(() => {
      const DLS = window.DroneLegacyShow;
      const FS = window.FireworksShow;
      return {
        dlsRunning: DLS ? DLS.isRunning : false,
        dlsT: DLS ? DLS.t : -1,
        fwStarted: DLS ? DLS.fwStarted : false,
        fsRunning: FS ? FS.isRunning : false,
        fsElapsed: FS ? FS.elapsed : -1
      };
    })()`,
    returnByValue: true
  });

  console.log("Combo transition state at t=151s:", comboState.result?.value);

  if (!comboState.result?.value?.fsRunning && !comboState.result?.value?.fwStarted) {
    throw new Error("Fireworks show of F8 was not triggered at 150s!");
  }
  console.log("PASS: F8 fireworks seamlessly activated after the legacy drone show!");

  console.log("7. Testing stopping show via toggleLegacyDroneShow()...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      window.stopLegacyDroneShow();
    })()`
  });

  const stopState = await send("Runtime.evaluate", {
    expression: `(() => {
      const DLS = window.DroneLegacyShow;
      const FS = window.FireworksShow;
      return {
        dlsRunning: DLS ? DLS.isRunning : false,
        fsRunning: FS ? FS.isRunning : false
      };
    })()`,
    returnByValue: true
  });
  console.log("State after stop:", stopState.result?.value);

  ws.close();
  chrome.kill();
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

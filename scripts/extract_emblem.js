const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

async function processEmblem() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9299",
    "--user-data-dir=" + path.join(process.env.TEMP || "C:\\Temp", "ch_crop_" + Date.now()),
    "about:blank"
  ]);

  await new Promise(r => setTimeout(r, 1200));
  const res = await new Promise((resolve) => {
    http.get("http://127.0.0.1:9299/json", res => {
      let b = ""; res.on("data", d => b += d); res.on("end", () => resolve(JSON.parse(b)));
    });
  });
  const ws = new WebSocket(res[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  function call(method, params = {}) {
    return new Promise((resolve) => {
      const cur = id++;
      const handler = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === cur) { ws.removeEventListener("message", handler); resolve(d.result); }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  }

  await call("Page.enable");
  await call("Runtime.enable");

  const b64 = fs.readFileSync("scripts/cpv_flag.png").toString("base64");

  const evalRes = await call("Runtime.evaluate", {
    expression: `(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();

      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const idata = ctx.getImageData(0, 0, c.width, c.height);
      const data = idata.data;

      let minX = c.width, maxX = 0, minY = c.height, maxY = 0;

      // Background is red (~218, 37, 29). Yellow emblem is (~255, 255, 0).
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const idx = (y * c.width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          // If greenish > 100, it's the yellow emblem
          if (g > 100) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Crop to emblem bounding box + transparent background
      const ew = maxX - minX + 1;
      const eh = maxY - minY + 1;
      const ec = document.createElement('canvas');
      ec.width = ew;
      ec.height = eh;
      const ectx = ec.getContext('2d');
      const edata = ectx.createImageData(ew, eh);

      for (let y = 0; y < eh; y++) {
        for (let x = 0; x < ew; x++) {
          const sidx = ((minY + y) * c.width + (minX + x)) * 4;
          const didx = (y * ew + x) * 4;
          const r = data[sidx], g = data[sidx + 1], b = data[sidx + 2];
          // Antialiased alpha estimation based on green channel
          // red background g ~ 37, yellow g ~ 255
          const alpha = Math.max(0, Math.min(255, Math.round((g - 37) / (255 - 37) * 255)));
          if (alpha > 12) {
            // Pure golden yellow #ffcd00
            edata.data[didx] = 255;
            edata.data[didx + 1] = 205;
            edata.data[didx + 2] = 0;
            edata.data[didx + 3] = alpha;
          } else {
            edata.data[didx + 3] = 0;
          }
        }
      }
      ectx.putImageData(edata, 0, 0);

      return {
        minX, maxX, minY, maxY, ew, eh,
        pngBase64: ec.toDataURL('image/png')
      };
    })("${b64}")`,
    awaitPromise: true,
    returnByValue: true
  });

  const val = evalRes.result.value;
  console.log("Bounding box:", val.ew, "x", val.eh, "from", val.minX, val.minY);
  const buf = Buffer.from(val.pngBase64.replace(/^data:image\/png;base64,/, ""), "base64");
  fs.writeFileSync("Frontend/images/bua_liem.png", buf);
  console.log("Successfully generated Frontend/images/bua_liem.png! Size:", buf.length);

  ws.close();
  chrome.kill();
}

processEmblem().catch(console.error);


const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

async function run() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9297",
    "--user-data-dir=" + path.join(process.env.TEMP || "C:\\Temp", "ch_norm_" + Date.now()),
    "about:blank"
  ]);
  await new Promise(r => setTimeout(r, 1200));
  const res = await new Promise((resolve) => {
    http.get("http://127.0.0.1:9297/json", res => {
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

  const svgContent = fs.readFileSync("scripts/official_flag.svg", "utf-8");

  const evalRes = await call("Runtime.evaluate", {
    expression: `(function(rawSvg) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, "image/svg+xml");
      const g = doc.getElementById("g19710-9");
      const paths = Array.from(g.querySelectorAll("path")).map(p => p.getAttribute("d"));
      
      // Let's create an offscreen canvas and draw the emblem using SVG Path2D
      // To normalize coordinates, let's render the exact SVG in an image/svg+xml data URL
      // But only the emblem (or the flag)
      return {
        path1: paths[0],
        path2: paths[1],
        transform: g.getAttribute("transform")
      };
    })(${JSON.stringify(svgContent)})`,
    returnByValue: true
  });

  console.log("Parsed:", evalRes.result.value);

  // Now let's test drawing the emblem on a 500x500 canvas at (250, 250) with transparent background
  // and measure its bounding box
  const renderRes = await call("Runtime.evaluate", {
    expression: `(async function(rawSvg) {
      const blob = new Blob([rawSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);

      // Flag size is 900x600.
      // Emblem center is at (450, 300).
      // Let's crop emblem at center
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 600;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Extract pixel bounding box of yellow emblem
      const idata = ctx.getImageData(0, 0, 900, 600);
      let minX = 900, maxX = 0, minY = 600, maxY = 0;
      for (let y = 0; y < 600; y++) {
        for (let x = 0; x < 900; x++) {
          const idx = (y * 900 + x) * 4;
          if (idata.data[idx + 1] > 100) { // yellow
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Draw cleanly into a dedicated square emblem canvas (e.g. 512x512) centered
      const ew = maxX - minX + 1;
      const eh = maxY - minY + 1;
      const maxDim = Math.max(ew, eh);
      const out = document.createElement("canvas");
      out.width = 512;
      out.height = 512;
      const octx = out.getContext("2d");
      const scale = 480 / maxDim;
      const ox = (512 - ew * scale) / 2;
      const oy = (512 - eh * scale) / 2;

      // Draw emblem pixels scaled & antialiased onto transparent canvas
      const cropC = document.createElement("canvas");
      cropC.width = ew;
      cropC.height = eh;
      const cropCtx = cropC.getContext("2d");
      const cropData = cropCtx.createImageData(ew, eh);
      for (let y = 0; y < eh; y++) {
        for (let x = 0; x < ew; x++) {
          const sidx = ((minY + y) * 900 + (minX + x)) * 4;
          const didx = (y * ew + x) * 4;
          const gVal = idata.data[sidx + 1];
          const alpha = Math.max(0, Math.min(255, Math.round((gVal - 37) / (255 - 37) * 255)));
          if (alpha > 10) {
            cropData.data[didx] = 255;
            cropData.data[didx + 1] = 205; // #ffcd00
            cropData.data[didx + 2] = 0;
            cropData.data[didx + 3] = alpha;
          }
        }
      }
      cropCtx.putImageData(cropData, 0, 0);

      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(cropC, ox, oy, ew * scale, eh * scale);

      return {
        bbox: { minX, maxX, minY, maxY, ew, eh },
        dataUrl: out.toDataURL("image/png")
      };
    })(${JSON.stringify(svgContent)})`,
    awaitPromise: true,
    returnByValue: true
  });

  const bRes = renderRes.result.value;
  console.log("Emblem BBox in 900x600:", bRes.bbox);
  const pngBuf = Buffer.from(bRes.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  fs.writeFileSync("Frontend/images/bua_liem_512.png", pngBuf);
  console.log("Saved Frontend/images/bua_liem_512.png (bytes:", pngBuf.length, ")");

  ws.close();
  chrome.kill();
}

run().catch(console.error);


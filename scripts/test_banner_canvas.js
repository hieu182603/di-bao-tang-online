const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

async function testBanner() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9295",
    "--user-data-dir=" + path.join(process.env.TEMP || "C:\\Temp", "ch_banner_" + Date.now()),
    "about:blank"
  ]);
  await new Promise(r => setTimeout(r, 1200));
  const res = await new Promise((resolve) => {
    http.get("http://127.0.0.1:9295/json", res => {
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

  const b64 = fs.readFileSync("Frontend/images/bua_liem.png").toString("base64");

  const renderRes = await call("Runtime.evaluate", {
    expression: `(async (emblemB64) => {
      const buaLiemImg = new Image();
      buaLiemImg.src = "data:image/png;base64," + emblemB64;
      await buaLiemImg.decode();

      const W = 400, H = 880;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");

      // Nền đỏ thắm trang nghiêm
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#ba171d");
      bg.addColorStop(0.5, "#9e0f14");
      bg.addColorStop(1, "#7f0a0e");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Viền vàng kim đôi
      g.strokeStyle = "#e8c558";
      g.lineWidth = 6;
      g.strokeRect(16, 16, W - 32, H - 32);

      g.strokeStyle = "rgba(255, 235, 150, 0.75)";
      g.lineWidth = 2;
      g.strokeRect(26, 26, W - 52, H - 52);

      // Hoa văn góc
      const corn = 22;
      for (const [cx, cy, sx, sy] of [[26, 26, 1, 1], [W - 26, 26, -1, 1], [26, H - 26, 1, -1], [W - 26, H - 26, -1, -1]]) {
        g.beginPath();
        g.arc(cx + sx * 11, cy + sy * 11, 4, 0, Math.PI * 2);
        g.fillStyle = "#ffcd00";
        g.fill();
        g.beginPath();
        g.moveTo(cx, cy + sy * corn);
        g.lineTo(cx, cy);
        g.lineTo(cx + sx * corn, cy);
        g.strokeStyle = "#ffe68c";
        g.lineWidth = 3.5;
        g.stroke();
      }

      // Biểu tượng Búa Liềm
      g.save();
      g.translate(W / 2, 122);
      g.shadowColor = "rgba(0,0,0,0.55)";
      g.shadowBlur = 10;
      g.shadowOffsetY = 4;

      const targetH = 105;
      const targetW = targetH * (buaLiemImg.width / buaLiemImg.height);
      g.drawImage(buaLiemImg, -targetW / 2, -targetH / 2, targetW, targetH);
      g.restore();

      // Dải phân cách hoa văn mạ vàng
      g.strokeStyle = "rgba(255, 215, 0, 0.85)";
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(W / 2 - 90, 204);
      g.lineTo(W / 2 + 90, 204);
      g.stroke();
      g.fillStyle = "#ffcd00";
      g.beginPath();
      g.arc(W / 2, 204, 4.5, 0, Math.PI * 2);
      g.fill();

      // Chữ
      const lines = [
        { text: "ĐẢNG CỘNG SẢN", size: 40, weight: 800, gap: 14 },
        { text: "VIỆT NAM", size: 48, weight: 900, gap: 26 },
        { text: "QUANG VINH", size: 38, weight: 800, gap: 14 },
        { text: "MUÔN NĂM!", size: 42, weight: 900, gap: 0 }
      ];

      let curY = 320;
      g.textAlign = "center";
      g.textBaseline = "middle";

      for (const line of lines) {
        g.font = 'bold ' + line.weight + ' ' + line.size + 'px serif';
        g.shadowColor = "rgba(0,0,0,0.75)";
        g.shadowBlur = 8;
        g.shadowOffsetY = 3;
        g.fillStyle = "#ffcd00";
        g.fillText(line.text, W / 2, curY);

        g.shadowColor = "transparent";
        g.shadowBlur = 0;
        g.strokeStyle = "#fff2a8";
        g.lineWidth = 1;
        g.strokeText(line.text, W / 2, curY);

        curY += line.size + (line.gap || 16);
      }

      return c.toDataURL("image/png");
    })("${b64}")`,
    awaitPromise: true,
    returnByValue: true
  });

  if (renderRes.exceptionDetails) {
    console.error("Browser error:", renderRes.exceptionDetails);
    ws.close(); chrome.kill(); return;
  }
  const bannerDataUrl = renderRes.result.value;
  const buf = Buffer.from(bannerDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  fs.writeFileSync("C:/Users/os/.gemini/antigravity/brain/63d4dab1-9926-4855-8ee9-06c5526f34b4/banner_party_fixed.png", buf);
  console.log("Saved banner_party_fixed.png!");

  ws.close();
  chrome.kill();
}

testBanner().catch(console.error);

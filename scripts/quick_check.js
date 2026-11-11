const { spawn } = require("child_process");
const http = require("http");

async function test() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--remote-debugging-port=9292",
    "about:blank"
  ]);
  await new Promise(r => setTimeout(r, 1000));
  const res = await new Promise((resolve) => {
    http.get("http://127.0.0.1:9292/json", res => {
      let b = ""; res.on("data", d => b += d); res.on("end", () => resolve(JSON.parse(b)));
    });
  });
  const ws = new WebSocket(res[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const cur = id++;
    const h = (e) => { const d = JSON.parse(e.data); if (d.id === cur) { ws.removeEventListener("message", h); res(d.result); } };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: cur, method, params }));
  });
  ws.addEventListener("message", e => {
    const d = JSON.parse(e.data);
    if (d.method === "Runtime.consoleAPICalled") {
      console.log("[Console]", d.params.type, d.params.args.map(a => a.value || a.description).join(" "));
    }
    if (d.method === "Runtime.exceptionThrown") {
      console.log("[Exception]", d.params.exceptionDetails.text, d.params.exceptionDetails.exception.description);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  console.log("Navigating...");
  await send("Page.navigate", { url: "http://localhost:5173/?autostart=1" });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await send("Runtime.evaluate", {
      expression: `(() => {
        const go = document.getElementById("go");
        if (go && !go.disabled) {
          try {
            go.click();
          } catch (e) {
            return { err: e.message };
          }
        }
        return {
          started: typeof started !== "undefined" ? started : false,
          goDisabled: go ? go.disabled : null,
          goText: go ? go.innerText : null
        };
      })()`,
      returnByValue: true
    });
    console.log(`Sec ${i+1}:`, st.result.value);
    if (st.result.value && st.result.value.started) break;
  }
  ws.close(); chrome.kill();
}
test().catch(console.error);

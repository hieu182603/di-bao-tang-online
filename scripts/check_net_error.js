const { spawn } = require("child_process");
const http = require("http");

async function checkConsole() {
  const cp = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--remote-debugging-port=9271",
    "--headless=new",
    "--user-data-dir=C:\\Temp\\chrome_net_err_" + Date.now(),
    "about:blank"
  ]);

  await new Promise(r => setTimeout(r, 1000));
  const list = await new Promise(res => {
    http.get("http://127.0.0.1:9271/json", r => {
      let b = ""; r.on("data", d => b += d); r.on("end", () => res(JSON.parse(b)));
    });
  });

  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
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
    if (data.method === "Runtime.consoleAPICalled") {
      const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(" ");
      console.log(`[CONSOLE ${data.params.type}]`, text);
    }
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: "http://localhost:5173" });
  await new Promise(r => setTimeout(r, 2000));

  const result = await send("Runtime.evaluate", {
    expression: `(async () => {
      try {
        console.log("Calling Net.start with backend:", window.BACKEND_URL);
        await Net.start({ x: 0, z: 0, yaw: 0, n: "TestUser", c: "#ff0000", av: "nv1", m: false });
        return { mode: Net.mode, status: Net.status };
      } catch (err) {
        return { error: err.toString(), stack: err.stack };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Net.start result:", JSON.stringify(result.result.value, null, 2));

  ws.close();
  cp.kill();
}

checkConsole().catch(console.error);


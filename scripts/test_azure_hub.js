const https = require("https");

// Test SignalR connection to Azure Hub
async function testAzureHub() {
  console.log("Testing Azure Hub connectivity...");
  const url = "https://baotang-lsd-12222.azurewebsites.net/museumHub/negotiate?negotiateVersion=1";
  const req = https.request(url, { method: "POST" }, (res) => {
    let body = "";
    res.on("data", d => body += d);
    res.on("end", () => {
      console.log("Negotiate response:", res.statusCode, body);
    });
  });
  req.on("error", console.error);
  req.end();
}

testAzureHub();


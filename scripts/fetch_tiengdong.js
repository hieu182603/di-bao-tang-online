const https = require("https");
const fs = require("fs");

const urls = [
  "https://tiengdong.com/tieng-phao-hoa-no",
  "https://tiengdong.com/tieng-phao-hoa-no-tren-bau-troi"
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8"
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
  });
}

async function run() {
  for (const u of urls) {
    console.log("Fetching:", u);
    try {
      const html = await fetchPage(u);
      console.log(`HTML length for ${u}:`, html.length);
      const audioMatches = html.match(/https?:\/\/[^\s"'<>]+\.(?:mp3|wav|ogg|m4a)/gi) || [];
      const downloadMatches = html.match(/href="([^"]*(?:download|mp3|wav|sound)[^"]*)"/gi) || [];
      const audioTags = html.match(/<audio[\s\S]*?<\/audio>/gi) || [];
      const sourceTags = html.match(/<source[\s\S]*?>/gi) || [];

      console.log("Direct audio URLs:", [...new Set(audioMatches)]);
      console.log("Download links:", [...new Set(downloadMatches)]);
      console.log("Audio tags count:", audioTags.length);
      audioTags.forEach((tag, idx) => console.log(`  Audio tag ${idx}:`, tag));
      sourceTags.forEach((tag, idx) => console.log(`  Source tag ${idx}:`, tag));
    } catch (e) {
      console.error("Error fetching", u, e);
    }
  }
}

run();


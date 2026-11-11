const https = require("https");
const fs = require("fs");
const path = require("path");

const targets = [
  {
    url: "https://tiengdong.com/wp-content/uploads/Tieng-phao-hoa-no-www_tiengdong_com.mp3",
    file: "Frontend/sounds/tieng_phao_hoa_no.mp3"
  },
  {
    url: "https://tiengdong.com/wp-content/uploads/Tieng-phao-hoa-no-tren-bau-troi-www_tiengdong_com.mp3",
    file: "Frontend/sounds/tieng_phao_hoa_no_tren_bau_troi.mp3"
  },
  {
    url: "https://tiengdong.com/wp-content/uploads/Tieng-ban-phao-hoa-www_tiengdong_com.mp3",
    file: "Frontend/sounds/tieng_ban_phao_hoa.mp3"
  },
  {
    url: "https://tiengdong.com/wp-content/uploads/tieng-hu-cua-phao-hoa-ban-len-troi-www_tiengdong_com.mp3",
    file: "Frontend/sounds/tieng_phao_hoa_hu_len_troi.mp3"
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://tiengdong.com/"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status ${res.statusCode} for ${url}`));
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on("finish", () => {
        stream.close();
        const stat = fs.statSync(dest);
        console.log(`✅ Saved ${dest} (${stat.size} bytes)`);
        resolve(stat.size);
      });
      stream.on("error", reject);
    }).on("error", reject);
  });
}

async function run() {
  if (!fs.existsSync("Frontend/sounds")) {
    fs.mkdirSync("Frontend/sounds", { recursive: true });
  }

  for (const t of targets) {
    console.log(`Downloading ${t.url} ...`);
    try {
      await downloadFile(t.url, t.file);
    } catch (e) {
      console.error(`❌ Failed ${t.url}:`, e.message);
    }
  }
}

run();


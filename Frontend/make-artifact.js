// Tạo artifact.html (bản để đăng lên link claude.ai) từ index.html.
// claude.ai tự bọc trang bằng <html><head><body>, nên chỉ giữ phần nội dung.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const head = src.split(/<head>/i)[1].split(/<\/head>/i)[0]
  .replace(/<meta charset[^>]*>\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "");
const body = src.split(/<body>/i)[1].split(/<\/body>/i)[0];
fs.writeFileSync(path.join(__dirname, "artifact.html"), head.trim() + "\n" + body.trim() + "\n");
console.log("artifact.html ok");

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function narrationCatalog() {
  const root = path.resolve(__dirname, "..");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "Frontend/narration.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "Frontend/content.js"), "utf8"), sandbox);
  const Narration = sandbox.window.MuseumNarration;
  const roots = [sandbox.window.MUSEUM];
  const app = fs.readFileSync(path.join(root, "Frontend/app.js"), "utf8");
  // Các hiện vật ngoài trời và chân dung hiện được khai báo trực tiếp trong app.js.
  for (const match of app.matchAll(/const\s+(\w+_EX)\s*=\s*(\{[\s\S]*?\n\});/g)) {
    vm.runInContext(match[0], sandbox);
    roots.push(vm.runInContext(match[1], sandbox));
  }
  const entries = new Map();
  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.title === "string" && (typeof value.text === "string" || typeof value.lesson === "string")) {
      const text = Narration.textFor(value);
      const file = Narration.audioPath(text);
      if (entries.has(file) && entries.get(file).text !== text) throw new Error("Narration filename collision: " + file);
      entries.set(file, { title: value.title, text, file });
    }
    for (const child of Object.values(value)) collect(child);
  }
  roots.forEach(collect);

  // Trang còn nạp nội dung ngoài trời và tủ kính sau khi dựng cảnh.
  // Giữ bản thu mặc định ở trên và bổ sung nội dung thực tế sau khi nạp JSON.
  const outdoor = vm.runInContext("OUT_EX", sandbox);
  const credits = JSON.parse(fs.readFileSync(path.join(root, "Frontend/images/hien_vat/credits.json"), "utf8"));
  for (const item of credits) {
    if (!outdoor[item.key]) continue;
    const exhibit = { ...outdoor[item.key] };
    for (const field of ["date", "title", "text", "lesson", "credit"]) {
      if (typeof item[field] === "string" && item[field].trim()) exhibit[field] = item[field].trim();
    }
    collect(exhibit);
  }
  const cases = JSON.parse(fs.readFileSync(path.join(root, "Frontend/images/tu_kinh/artifacts.json"), "utf8"));
  for (const item of cases) {
    if (typeof item.title === "string" && typeof item.room === "string") {
      collect({ title: item.title, date: item.date || "", text: item.text || "", lesson: item.lesson || "" });
    }
  }
  return [...entries.values()];
}

module.exports = { narrationCatalog };
if (require.main === module) console.log(JSON.stringify(narrationCatalog(), null, 2));

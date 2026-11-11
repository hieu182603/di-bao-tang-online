// Tạo MP3 cục bộ bằng Piper và FFmpeg; không gọi dịch vụ chuyển văn bản thành giọng nói.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { narrationCatalog } = require("./narration_catalog");

function run(executable, args, input, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let error = "";
    child.on("error", reject);
    child.stdout.on("data", (data) => { if (onOutput) onOutput(data.toString()); });
    child.stderr.on("data", (data) => { error += data; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(executable + " failed (" + code + "): " + error)));
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const piper = option("--piper"), model = option("--model"), ffmpeg = option("--ffmpeg") || "ffmpeg";
  if (!piper || !model) throw new Error("Usage: node scripts/generate_narration_audio.js --piper <executable> --model <vi_VN.onnx> [--ffmpeg <executable>]");
  const root = path.resolve(__dirname, "..");
  const temp = path.join(root, "node_modules/.cache/narration-wav");
  const output = path.join(root, "Frontend/sounds/narration");
  fs.mkdirSync(temp, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const catalog = narrationCatalog();
  const missing = catalog.filter((entry) => !fs.existsSync(path.join(root, "Frontend", entry.file)));
  if (!missing.length) { console.log("All " + catalog.length + " Vietnamese recordings are current."); return; }
  const input = missing.map((entry) => JSON.stringify({ text: entry.text, output_file: path.join(temp, path.basename(entry.file, ".mp3") + ".wav") })).join("\n") + "\n";
  let completed = 0, lines = "";
  console.log("Synthesizing " + missing.length + " Vietnamese recordings locally…");
  await run(path.resolve(piper), ["--model", path.resolve(model), "--json-input", "--quiet", "--sentence_silence", "0.2"], input, (data) => {
    lines += data;
    let end;
    while ((end = lines.indexOf("\n")) >= 0) {
      const line = lines.slice(0, end).trim(); lines = lines.slice(end + 1);
      if (line.endsWith(".wav") && ++completed % 10 === 0) console.log("Synthesized " + completed + "/" + missing.length);
    }
  });
  for (let index = 0; index < missing.length; index++) {
    const entry = missing[index];
    const wav = path.join(temp, path.basename(entry.file, ".mp3") + ".wav");
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "48k", path.join(root, "Frontend", entry.file)]);
    if ((index + 1) % 10 === 0) console.log("Encoded " + (index + 1) + "/" + missing.length);
  }
  console.log("Ready: " + catalog.length + " Vietnamese recordings.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

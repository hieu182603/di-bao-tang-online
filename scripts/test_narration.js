const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../Frontend/narration.js"), "utf8");
const english = { name: "English default", lang: "en-US", default: true };
const vietnamese = { name: "Tiếng Việt", lang: "vi-VN" };

function setup({ voices = [english], native = true, playError = null } = {}) {
  const spoken = [], audios = [], states = [], listeners = new Set(), timers = new Map();
  let timerId = 0;
  const synth = {
    getVoices: () => voices,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
    cancel() {}, resume() {},
    speak(utterance) { spoken.push(utterance); },
  };
  class Audio {
    constructor() { this.sources = []; this.paused = false; audios.push(this); }
    set src(value) { this.currentSrc = value; this.sources.push(value); }
    play() { return playError ? Promise.reject(playError) : Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.currentSrc = ""; }
    load() {}
  }
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, textContent: "", attributes: {}, handlers: {}, classes: new Set(),
      classList: { toggle(name, active) { if (active) elements.get(id).classes.add(name); else elements.get(id).classes.delete(name); } },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() {},
    });
    return elements.get(id);
  };
  const sandbox = {
    window: { Audio, speechSynthesis: native ? synth : undefined, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    $, document: { pointerLockElement: null }, keys: {}, SFX: { enabled: true },
    updateLookHint() {}, lockPointer() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const narrator = new sandbox.window.MuseumNarration((state) => states.push(state));
  return {
    narrator, spoken, audios, states, listeners, timers, sandbox, $,
    setVoices(value) { voices = value; for (const listener of [...listeners]) listener(); },
    tick(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= delay && timers.delete(id)) timer.callback();
      }
    },
  };
}

test("selects a Vietnamese voice even when English is the default", () => {
  const env = setup({ voices: [english, vietnamese] });
  env.narrator.start("Xin chào quý khách.");
  assert.equal(env.spoken.length, 1);
  assert.equal(env.spoken[0].voice, vietnamese);
  assert.equal(env.spoken[0].lang, "vi-VN");
  assert.equal(env.audios.length, 0);
});

test("waits for Vietnamese voices to load asynchronously", () => {
  const env = setup({ voices: [] });
  env.narrator.start("Bảo tàng lịch sử.");
  assert.equal(env.spoken.length, 0);
  env.setVoices([english]);
  assert.equal(env.spoken.length, 0);
  env.setVoices([english, vietnamese]);
  assert.equal(env.spoken[0].voice, vietnamese);
  assert.equal(env.listeners.size, 0);
  assert.equal(env.timers.size, 0);
  env.tick(1500);
  assert.equal(env.audios.length, 0);
});

test("accepts Vietnamese locale variants and rejects English", () => {
  for (const lang of ["vi", "vi_vn", "VI-vn"]) {
    const voice = { name: lang, lang };
    const env = setup({ voices: [english, voice] });
    env.narrator.start("Chào mừng.");
    assert.equal(env.spoken[0].voice, voice);
  }
});

test("uses a recording from this website when only English voices are installed", () => {
  const env = setup();
  const text = "Độc lập, tự do & hạnh phúc.";
  env.narrator.start(text);
  env.tick(1500);
  assert.equal(env.spoken.length, 0);
  assert.match(env.audios[0].currentSrc, /^sounds\/narration\/[0-9a-f]{8}\.mp3$/);
  assert.equal(env.audios[0].currentSrc, env.sandbox.window.MuseumNarration.audioPath(text));
  assert.equal(env.listeners.size, 0);
});

test("supports browsers without speech synthesis", () => {
  const env = setup({ native: false });
  env.narrator.start("Thuyết minh tiếng Việt.");
  assert.equal(env.audios.length, 1);
  env.audios[0].onplaying();
  assert.equal(env.states.at(-1).state, "speaking");
  env.audios[0].onended();
  assert.equal(env.narrator.active, false);
  assert.equal(env.states.at(-1).state, "idle");
});

test("stopping while voices load cancels the pending narration", () => {
  const env = setup();
  env.narrator.start("Không được đọc sau khi đã đóng.");
  env.narrator.stop();
  env.setVoices([vietnamese]);
  env.tick(1500);
  assert.equal(env.spoken.length, 0);
  assert.equal(env.audios.length, 0);
  assert.equal(env.listeners.size, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(env.narrator.active, false);
});

test("a long exhibit uses its complete recording and stops when it ends", () => {
  const env = setup({ native: false });
  const text = ("Bảo tàng lịch sử. Nội dung dài, có dấu tiếng Việt và ký hiệu &. ".repeat(20) + "X".repeat(400)).trim();
  env.narrator.start(text);
  const audio = env.audios[0];
  audio.onplaying(); audio.onended();
  assert.equal(env.narrator.active, false);
  assert.equal(env.audios.length, 1);
  assert.equal(audio.sources.length, 1);
  assert.equal(audio.sources[0], env.sandbox.window.MuseumNarration.audioPath(text));
  assert.equal(env.timers.size, 0);
});

test("long native narration keeps the Vietnamese voice through completion", () => {
  const env = setup({ voices: [english, vietnamese] });
  env.narrator.start("Lịch sử Việt Nam. ".repeat(40));
  let index = 0;
  while (env.narrator.active && index < 50) {
    const utterance = env.spoken[index++];
    assert.equal(utterance.voice, vietnamese);
    assert.ok(utterance.text.length <= 180);
    utterance.onstart();
    utterance.onend();
  }
  assert.ok(index > 1);
  assert.equal(env.narrator.active, false);
  assert.equal(env.audios.length, 0);
});

test("native voice errors fall back to a recording from this website", () => {
  const env = setup({ voices: [vietnamese] });
  env.narrator.start("Tiếp tục bằng tiếng Việt.");
  env.spoken[0].onerror({ error: "synthesis-failed" });
  assert.equal(env.audios.length, 1);
  assert.match(env.audios[0].currentSrc, /^sounds\/narration\/[0-9a-f]{8}\.mp3$/);
  assert.equal(env.narrator.active, true);
});

test("callbacks from an old narration cannot affect a new one", () => {
  const env = setup({ voices: [vietnamese] });
  env.narrator.start("Hiện vật thứ nhất.");
  const oldEnd = env.spoken[0].onend, oldError = env.spoken[0].onerror;
  env.narrator.start("Hiện vật thứ hai.");
  oldEnd(); oldError();
  assert.equal(env.spoken.length, 2);
  assert.equal(env.spoken[1].text, "Hiện vật thứ hai.");
  assert.equal(env.narrator.active, true);
  assert.equal(env.audios.length, 0);
});

test("stop pauses audio and ignores late audio errors", () => {
  const env = setup({ native: false });
  env.narrator.start("Hiện vật thứ nhất.");
  const oldAudio = env.audios[0], oldError = oldAudio.onerror;
  env.narrator.start("Hiện vật thứ hai.");
  oldError();
  assert.equal(oldAudio.paused, true);
  assert.equal(oldAudio.currentSrc, "");
  assert.equal(env.narrator.active, true);
  assert.equal(env.states.at(-1).state, "loading");
});

test("recording errors and timeouts explain the problem without English speech", () => {
  for (const timeout of [false, true]) {
    const env = setup({ native: false });
    env.narrator.start("Thử thuyết minh.");
    if (timeout) env.tick(15000); else env.audios[0].onerror();
    assert.equal(env.narrator.active, false);
    assert.equal(env.states.at(-1).state, "error");
    assert.match(env.states.at(-1).message, /tải lại trang/);
    assert.equal(env.spoken.length, 0);
    assert.equal(env.timers.size, 0);
  }
});

test("blocked autoplay offers a retry and resets the playing state", async () => {
  const env = setup({ native: false, playError: { name: "NotAllowedError" } });
  env.narrator.start("Thử thuyết minh.");
  await Promise.resolve();
  assert.equal(env.narrator.active, false);
  assert.equal(env.states.at(-1).state, "error");
  assert.match(env.states.at(-1).message, /bấm Thuyết minh/);
});

test("empty narration does not start playback", () => {
  const env = setup();
  env.narrator.start("  ");
  assert.equal(env.narrator.active, false);
  assert.equal(env.audios.length, 0);
  assert.equal(env.spoken.length, 0);
});

function loadInfoPanel(env) {
  const app = fs.readFileSync(path.join(__dirname, "../Frontend/app.js"), "utf8");
  const start = app.indexOf("let currentEx = null;");
  const end = app.indexOf("/* ================= Fireworks Engine", start);
  vm.runInContext(app.slice(start, end), env.sandbox);
}

test("exhibit panel reads its content in Vietnamese and resets on close", () => {
  const env = setup({ voices: [english, vietnamese] });
  loadInfoPanel(env);
  vm.runInContext('openInfo({ title: "Hiện vật", date: "1930", text: "Nội dung.", lesson: "Bài học." }); toggleSpeech();', env.sandbox);
  assert.equal(env.spoken[0].voice, vietnamese);
  assert.match(env.spoken[0].text, /Thời gian: 1930/);
  assert.match(env.spoken[0].text, /Liên hệ bài học: Bài học/);
  assert.equal(env.$("tts-label").textContent, "Dừng đọc");
  assert.equal(env.$("tts-btn").attributes["aria-pressed"], "true");
  vm.runInContext("closeInfo();", env.sandbox);
  assert.equal(env.$("tts-label").textContent, "Thuyết minh");
  assert.equal(env.$("tts-btn").attributes["aria-pressed"], "false");
  assert.equal(env.$("info").hidden, true);
});

test("opening another exhibit stops the previous recording", () => {
  const env = setup({ native: false });
  loadInfoPanel(env);
  vm.runInContext('openInfo({ title: "Hiện vật 1", text: "Nội dung." }); toggleSpeech();', env.sandbox);
  const audio = env.audios[0];
  vm.runInContext('openInfo({ title: "Hiện vật 2", text: "Nội dung khác." });', env.sandbox);
  assert.equal(audio.paused, true);
  assert.equal(env.$("tts-label").textContent, "Thuyết minh");
  assert.equal(env.$("tts-status").hidden, true);
});

test("recording names are stable across whitespace and change when content changes", () => {
  const env = setup();
  const Narration = env.sandbox.window.MuseumNarration;
  assert.equal(Narration.audioPath("  Nội dung.\n Bài học. "), Narration.audioPath("Nội dung. Bài học."));
  assert.notEqual(Narration.audioPath("Nội dung cũ."), Narration.audioPath("Nội dung mới."));
});

test("every exhibit has a playable recording matching its current content", () => {
  const { narrationCatalog } = require("./narration_catalog");
  const entries = narrationCatalog();
  assert.ok(entries.length >= 160);
  for (const entry of entries) {
    const file = path.join(__dirname, "../Frontend", entry.file);
    assert.ok(fs.existsSync(file), "Missing recording for " + entry.title + ": " + entry.file);
    const header = fs.readFileSync(file).subarray(0, 3);
    assert.ok(header.toString() === "ID3" || (header[0] === 255 && (header[1] & 224) === 224), "Invalid MP3: " + entry.file);
  }
});

function loadRuntimeData(env, functionName, endMarker) {
  const root = path.resolve(__dirname, "../Frontend");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  vm.runInContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), env.sandbox);
  for (const match of app.matchAll(/const\s+(\w+_EX)\s*=\s*(\{[\s\S]*?\n\});/g)) {
    vm.runInContext(match[0], env.sandbox);
  }
  env.sandbox.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(root, url), "utf8")),
  });
  const start = app.indexOf("async function " + functionName + "()");
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "Runtime data loader must be found");
  vm.runInContext(app.slice(start, end), env.sandbox);
}

function assertRecording(exhibit, Narration) {
  const file = Narration.audioPath(Narration.textFor(exhibit));
  assert.ok(fs.existsSync(path.join(__dirname, "../Frontend", file)),
    "Missing recording for runtime exhibit " + exhibit.title + ": " + file);
}

test("outdoor metadata loaded by the page has matching recordings", async () => {
  const env = setup();
  loadRuntimeData(env, "loadExhibitCredits", "// Tour order:");
  env.sandbox.photoSigns = [];
  await vm.runInContext("loadExhibitCredits()", env.sandbox);
  const exhibits = vm.runInContext("Object.values(OUT_EX)", env.sandbox);
  assert.equal(exhibits.length, 12);
  assert.ok(exhibits.some((exhibit) => exhibit.title === "Máy bay MiG-21 số hiệu 5121"));
  for (const exhibit of exhibits) assertRecording(exhibit, env.sandbox.window.MuseumNarration);
});

test("display cases loaded by the page have matching recordings", async () => {
  const env = setup();
  loadRuntimeData(env, "loadCases", "/* ================= lights, sky");
  const exhibits = [];
  env.sandbox.DATA = env.sandbox.window.MUSEUM;
  env.sandbox.ROOM_GEO = env.sandbox.DATA.rooms.map(() => ({ face: 0, c: [0, 0] }));
  env.sandbox.H2 = Math.PI / 2;
  env.sandbox.buildCase = (x, z, rotation, exhibit) => exhibits.push(exhibit);
  env.sandbox.buildPedestal = () => {};
  await vm.runInContext("loadCases()", env.sandbox);
  assert.equal(exhibits.length, 15);
  for (const exhibit of exhibits) assertRecording(exhibit, env.sandbox.window.MuseumNarration);
});

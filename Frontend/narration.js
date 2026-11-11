// Thuyết minh tiếng Việt: ưu tiên giọng trên máy, dùng bản thu cùng website nếu thiếu.
(function () {
  const MAX_CHARS = 180;

  function splitText(text) {
    const chunks = [];
    let rest = String(text || "").replace(/\s+/g, " ").trim();
    while (rest.length > MAX_CHARS) {
      const head = rest.slice(0, MAX_CHARS);
      let end = Math.max(...[". ", "! ", "? ", "; ", ", "].map((mark) => head.lastIndexOf(mark) + 1));
      if (end < MAX_CHARS / 2) end = head.lastIndexOf(" ");
      if (end <= 0) end = MAX_CHARS;
      chunks.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  class MuseumNarration {
    static textFor(exhibit) {
      return [exhibit.title, exhibit.date ? "Thời gian: " + exhibit.date : "", exhibit.text,
        exhibit.lesson ? "Liên hệ bài học: " + exhibit.lesson : ""].filter(Boolean).join(". ");
    }

    static audioPath(text) {
      const normalized = String(text || "").replace(/\s+/g, " ").trim();
      let hash = 2166136261;
      for (let i = 0; i < normalized.length; i++) hash = Math.imul(hash ^ normalized.charCodeAt(i), 16777619);
      return "sounds/narration/" + (hash >>> 0).toString(16).padStart(8, "0") + ".mp3";
    }

    constructor(onStateChange) {
      this.onStateChange = onStateChange;
      this.active = false;
      this.runId = 0;
      this.synth = window.speechSynthesis;
      this.utterance = null;
      this.audio = null;
      this.cancelVoiceWait = null;
      this.audioTimer = null;
      this.text = "";
      // Một số trình duyệt chỉ bắt đầu nạp giọng sau lần gọi getVoices đầu tiên.
      if (this.synth) this.synth.getVoices();
    }

    setState(state, message = "") {
      this.active = state === "loading" || state === "speaking";
      this.onStateChange({ state, message });
    }

    stop() {
      // Vô hiệu hóa các callback cũ trước khi cancel/pause phát sinh sự kiện.
      this.runId++;
      if (this.cancelVoiceWait) this.cancelVoiceWait();
      clearTimeout(this.audioTimer);
      this.audioTimer = null;
      if (this.utterance) {
        this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
        this.utterance = null;
      }
      if (this.synth) this.synth.cancel();
      if (this.audio) {
        this.audio.onplaying = this.audio.onended = this.audio.onerror = null;
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.audio = null;
      }
      this.setState("idle");
    }

    start(text) {
      this.stop();
      const chunks = splitText(text);
      if (!chunks.length) return;
      this.text = text;
      const runId = this.runId;
      this.setState("loading", "Đang chuẩn bị giọng đọc tiếng Việt…");
      this.waitForVoice((voice) => {
        if (runId !== this.runId) return;
        if (voice) this.speakChunk(chunks, 0, voice, runId);
        else this.playRecording(runId);
      });
    }

    waitForVoice(done) {
      const synth = this.synth;
      if (!synth || !window.SpeechSynthesisUtterance) { done(null); return; }
      const find = () => {
        const voices = synth.getVoices().filter((voice) => /^vi(?:[-_]|$)/i.test(voice.lang || ""));
        return voices.find((voice) => /^vi[-_]VN$/i.test(voice.lang)) || voices[0] || null;
      };
      const ready = find();
      if (ready) { done(ready); return; }
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        synth.removeEventListener("voiceschanged", check);
        this.cancelVoiceWait = null;
      };
      const check = () => {
        const voice = find();
        if (voice) { cleanup(); done(voice); }
      };
      this.cancelVoiceWait = cleanup;
      synth.addEventListener("voiceschanged", check);
      timer = setTimeout(() => { cleanup(); done(find()); }, 1500);
      check();
    }

    speakChunk(chunks, index, voice, runId) {
      if (runId !== this.runId) return;
      if (index >= chunks.length) { this.stop(); return; }
      const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
      // Không gọi speak khi chưa có giọng Việt: lang một mình vẫn có thể dùng giọng Anh.
      utterance.voice = voice;
      utterance.lang = "vi-VN";
      utterance.rate = 1;
      this.utterance = utterance; // Giữ tham chiếu đến khi đọc xong.
      utterance.onstart = () => {
        if (runId === this.runId) this.setState("speaking");
      };
      utterance.onend = () => this.speakChunk(chunks, index + 1, voice, runId);
      const fallback = () => {
        if (runId !== this.runId) return;
        utterance.onstart = utterance.onend = utterance.onerror = null;
        this.utterance = null;
        this.synth.cancel();
        this.playRecording(runId);
      };
      utterance.onerror = fallback;
      try {
        this.synth.resume();
        this.synth.speak(utterance);
      } catch (error) { fallback(); }
    }

    playRecording(runId) {
      if (runId !== this.runId) return;
      this.setState("loading", "Đang tải thuyết minh tiếng Việt…");
      const audio = this.audio || new window.Audio();
      this.audio = audio;
      audio.src = MuseumNarration.audioPath(this.text);
      audio.onplaying = () => {
        if (runId !== this.runId) return;
        clearTimeout(this.audioTimer);
        this.setState("speaking");
      };
      audio.onended = () => { if (runId === this.runId) this.stop(); };
      const fail = (error) => {
        if (runId !== this.runId) return;
        this.stop();
        this.setState("error", error && error.name === "NotAllowedError"
          ? "Trình duyệt chưa cho phát âm thanh. Hãy bấm Thuyết minh để thử lại."
          : "Không tải được bản thuyết minh tiếng Việt. Hãy tải lại trang rồi thử lại.");
      };
      audio.onerror = fail;
      clearTimeout(this.audioTimer);
      this.audioTimer = setTimeout(fail, 15000);
      try {
        const playing = audio.play();
        if (playing) playing.catch(fail);
      } catch (error) { fail(error); }
    }
  }

  window.MuseumNarration = MuseumNarration;
})();

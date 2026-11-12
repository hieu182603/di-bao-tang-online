// Kết nối nhiều người.
// Thứ tự ưu tiên: Backend SignalR (.NET 8 - 15Hz Tick Batching) -> Firebase -> phòng chung claude.ai -> một mình.
(function () {
  const listeners = new Set();
  const Net = {
    mode: "solo",        // "solo" | "signalr" | "firebase" | "claude"
    status: "solo",      // "solo" | "connecting" | "online"
    selfId: Math.random().toString(36).slice(2, 10),
    peers: new Map(),    // id -> trạng thái người khác (đã kiểm tra)
    onChange(fn) { listeners.add(fn); },
    update() {},         // được gán khi kết nối xong
  };
  const fire = (type, id) => { for (const fn of listeners) fn(type, id); };
  const num = (v) => typeof v === "number" && isFinite(v);
  const str = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");

  // Dữ liệu từ người khác là không tin cậy: chỉ giữ các trường cần thiết, đúng kiểu.
  function clean(raw) {
    if (!raw || typeof raw !== "object" || !num(raw.x) || !num(raw.z) || !num(raw.yaw)) return null;
    return {
      x: Math.max(-66, Math.min(66, raw.x)),
      z: Math.max(-36, Math.min(64, raw.z)),
      yaw: raw.yaw,
      n: str(raw.n, 24) || "Khách",
      c: typeof raw.c === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.c) ? raw.c : "#d62828",
      av: raw.av === "nv2" ? "nv2" : "nv1",
      m: raw.m === true,
      y: num(raw.y) ? Math.max(0, Math.min(9, raw.y)) : 0,
      say: str(raw.say, 80), sayAt: num(raw.sayAt) ? raw.sayAt : 0,
      emote: str(raw.emote, 12), emoteAt: num(raw.emoteAt) ? raw.emoteAt : 0,
      t: num(raw.t) ? raw.t : 0,
    };
  }
  let lastFwTime = 0;
  let lastDnTime = 0;
  let lastDsTime = 0;
  function setPeer(id, raw) {
    if (!id || id === Net.selfId) return;
    const s = clean(raw);
    if (!s) { removePeer(id); return; }
    const had = Net.peers.has(id);
    Net.peers.set(id, s);
    fire(had ? "update" : "join", id);

    // Đồng bộ pháo hoa giữa tất cả người chơi trong phòng
    if (s.say && s.say.startsWith("__fw__:") && s.sayAt > lastFwTime) {
      lastFwTime = s.sayAt;
      const parts = s.say.split(":");
      const action = parts[1];
      const seed = parseInt(parts[2], 10);
      const startTime = parseInt(parts[3], 10);
      if (typeof Net.onFireworks === "function") {
        Net.onFireworks(action, { seed, startTime, peerId: id });
      }
    }

    // Đồng bộ Drone Show (F9): chỉ gửi hành động + seed + thời điểm bắt đầu, mỗi máy tự mô phỏng drone
    if (s.say && s.say.startsWith("__ds__:") && s.sayAt > lastDsTime) {
      lastDsTime = s.sayAt;
      const parts = s.say.split(":");
      if (typeof Net.onDroneShow === "function") {
        Net.onDroneShow(parts[1], { seed: parseInt(parts[2], 10) || 0, startTime: parseInt(parts[3], 10) || 0, revision: parts[4] || null, combo: parts[5] === "1", peerId: id });
      }
    }

    // Đồng bộ sáng / tối (Ban ngày / Ban đêm - F2) giữa tất cả người chơi trong phòng
    if (s.say && s.say.startsWith("__dn__:") && s.sayAt > lastDnTime) {
      lastDnTime = s.sayAt;
      const parts = s.say.split(":");
      const targetIsNight = parts[1] === "1";
      if (typeof Net.onDayNight === "function") {
        Net.onDayNight(targetIsNight, { peerId: id, time: s.sayAt });
      }
    }
  }
  function patchPeerMove(item) {
    if (!item || !item.id || item.id === Net.selfId) return false;
    const p = Net.peers.get(item.id);
    if (!p) return false;
    if (num(item.x)) p.x = Math.max(-40, Math.min(40, item.x));
    if (num(item.z)) p.z = Math.max(-36, Math.min(64, item.z));
    if (num(item.y)) p.y = Math.max(0, Math.min(9, item.y));
    if (num(item.yaw)) p.yaw = item.yaw;
    if (typeof item.m === "boolean") p.m = item.m;
    if (item.av) p.av = item.av === "nv2" ? "nv2" : "nv1";
    p.t = Date.now();
    return true;
  }
  function removePeer(id) { if (Net.peers.delete(id)) fire("leave", id); }
  function setStatus(s) { Net.status = s; fire("status"); }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Không tải được " + src));
      document.head.appendChild(s);
    });
  }

  async function startSignalR(baseUrl, initial) {
    if (!window.signalR) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js");
    }
    const cleanUrl = String(baseUrl).replace(/\/+$/, "");
    const roomCode = window.MUSEUM_ROOM || "bao-tang-vnr";
    let mine = { ...initial };

    const conn = new window.signalR.HubConnectionBuilder()
      .withUrl(cleanUrl + "/museumHub")
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
      .build();

    conn.on("RoomSnapshot", (myId, list) => {
      if (myId) Net.selfId = myId;
      const seen = new Set();
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p && p.id && p.id !== Net.selfId) {
            seen.add(p.id);
            setPeer(p.id, p);
          }
        }
      }
      for (const id of [...Net.peers.keys()]) if (!seen.has(id)) removePeer(id);
    });

    conn.on("PeerJoined", (p) => { if (p && p.id) setPeer(p.id, p); });
    conn.on("PeerUpdated", (p) => { if (p && p.id) setPeer(p.id, p); });
    conn.on("PeerLeft", (id) => { if (id) removePeer(id); });
    conn.on("FireworksTriggered", (data) => {
      if (data && typeof Net.onFireworks === "function") {
        Net.onFireworks(data.action, data);
      }
    });
    conn.on("DayNightTriggered", (data) => {
      if (data && typeof Net.onDayNight === "function") {
        Net.onDayNight(!!data.isNight, data);
      }
    });

    // Nhận gói tin gộp 15Hz (WorldTick) cho toàn bộ những người vừa di chuyển
    conn.on("WorldTick", (batch) => {
      if (!Array.isArray(batch)) return;
      for (let i = 0; i < batch.length; i++) {
        patchPeerMove(batch[i]);
      }
      fire("tick", null);
    });

    conn.onreconnecting(() => setStatus("connecting"));
    conn.onreconnected(() => {
      setStatus("online");
      conn.invoke("JoinRoom", roomCode, Net.selfId, mine).catch(() => {});
    });
    conn.onclose(() => setStatus("connecting"));

    Net.signalRConn = conn;
    await conn.start();
    Net.mode = "signalr";
    setStatus("online");
    await conn.invoke("JoinRoom", roomCode, Net.selfId, mine);

    Net.update = (patch) => {
      mine = { ...mine, ...patch };
      if (conn.state === window.signalR.HubConnectionState.Connected) {
        conn.invoke("UpdateState", patch).catch(() => {});
      }
    };

    // Nhịp tim mỗi 25s để giữ kết nối trên server khi đứng yên lâu
    setInterval(() => {
      if (conn.state === window.signalR.HubConnectionState.Connected) {
        conn.invoke("UpdateState", {}).catch(() => {});
      }
    }, 25000);
  }

  async function startFirebase(cfg, initial) {
    const v = "10.12.2";
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-database-compat.js`);
    const app = firebase.initializeApp(cfg);
    const db = firebase.database(app);
    const TS = firebase.database.ServerValue.TIMESTAMP;
    const ref = db.ref((window.MUSEUM_ROOM || "bao-tang") + "/players");
    const me = ref.child(Net.selfId);
    let mine = { ...initial };
    let offset = 0;
    db.ref(".info/serverTimeOffset").on("value", (s) => { offset = s.val() || 0; });
    db.ref(".info/connected").on("value", (snap) => {
      if (snap.val() === true) {
        me.onDisconnect().remove();
        me.set({ ...mine, t: TS });
        setStatus("online");
      } else setStatus("connecting");
    });
    ref.on("child_added", (s) => setPeer(s.key, s.val()));
    ref.on("child_changed", (s) => setPeer(s.key, s.val()));
    ref.on("child_removed", (s) => removePeer(s.key));

    const fwRef = db.ref((window.MUSEUM_ROOM || "bao-tang") + "/fireworks");
    Net.firebaseFwRef = fwRef;
    fwRef.on("value", (snap) => {
      const d = snap.val();
      if (d && d.t > lastFwTime) {
        lastFwTime = d.t;
        if (typeof Net.onFireworks === "function") {
          Net.onFireworks(d.action, d);
        }
      }
    });

    const dsRef = db.ref((window.MUSEUM_ROOM || "bao-tang") + "/droneshow");
    Net.firebaseDsRef = dsRef;
    dsRef.on("value", (snap) => {
      const d = snap.val();
      if (d && d.t > lastDsTime) {
        lastDsTime = d.t;
        if (typeof Net.onDroneShow === "function") Net.onDroneShow(d.action, d);
      }
    });

    const dnRef = db.ref((window.MUSEUM_ROOM || "bao-tang") + "/daynight");
    Net.firebaseDnRef = dnRef;
    dnRef.on("value", (snap) => {
      const d = snap.val();
      if (d && d.t > lastDnTime) {
        lastDnTime = d.t;
        if (typeof Net.onDayNight === "function") {
          Net.onDayNight(!!d.isNight, d);
        }
      }
    });

    Net.update = (patch) => { mine = { ...mine, ...patch }; me.update({ ...patch, t: TS }).catch(() => {}); };
    setInterval(() => Net.update({}), 15000); // nhịp tim để biết ai còn online
    setInterval(() => { // bỏ "bóng ma" của người tắt máy đột ngột
      const now = Date.now() + offset;
      for (const [id, s] of Net.peers) if (s.t && now - s.t > 60000) removePeer(id);
    }, 10000);
    Net.mode = "firebase";
  }

  async function startClaude(initial) {
    const [room, user] = await Promise.all([window.claude.use("room"), window.claude.use("user")]);
    if (!room) return false;
    const names = {};
    room.onPeers((ch) => {
      const seen = new Set(); const ask = [];
      for (const p of ch.peers) {
        if (p.sameTab || p.kind !== "viewer") continue;
        seen.add(p.peer);
        const pr = { ...p.presence };
        if (!pr.n && p.by && names[p.by]) pr.n = names[p.by];
        if (p.by && !names[p.by]) ask.push(p.by);
        setPeer(p.peer, pr);
      }
      for (const id of [...Net.peers.keys()]) if (!seen.has(id)) removePeer(id);
      if (user && ask.length) user.profiles(ask).then((ps) => { for (const id of ask) if (ps[id] && ps[id].name) names[id] = ps[id].name; });
    }, () => { for (const id of [...Net.peers.keys()]) removePeer(id); Net.mode = "solo"; setStatus("solo"); });
    room.onConnection((c) => setStatus(c ? "online" : "connecting"));
    Net.update = (patch) => { room.presence(patch).catch(() => {}); };
    Net.update({ ...initial });
    Net.mode = "claude";
    return true;
  }

  Net.broadcastFireworks = function (action, opts = {}) {
    const seed = opts.seed || ((Math.random() * 2 ** 31) >>> 0);
    const startTime = opts.startTime || Date.now();
    const payload = `__fw__:${action}:${seed}:${startTime}`;

    // 1. Kênh SignalR trực tiếp
    if (Net.signalRConn && Net.signalRConn.state === "Connected") {
      Net.signalRConn.invoke("TriggerFireworks", { action, seed, startTime }).catch(() => {});
    }

    // 2. Kênh cập nhật trạng thái người chơi (tương thích mọi backend)
    if (typeof Net.update === "function") {
      Net.update({ say: payload, sayAt: Date.now() });
    }

    // 3. Kênh Firebase
    if (Net.firebaseFwRef) {
      Net.firebaseFwRef.set({ action, seed, startTime, t: Date.now() }).catch(() => {});
    }
  };

  // Drone Show: KHÔNG gửi toạ độ drone — chỉ gửi {action, seed, startTime}; tối đa vài gói tin mỗi show.
  Net.broadcastDroneShow = function (action, opts = {}) {
    const seed = opts.seed >>> 0;
    const startTime = opts.startTime || Date.now();
    const now = Date.now();
    lastDsTime = Math.max(lastDsTime, now);   // không tự nhận lại gói của chính mình
    if (typeof Net.update === "function") Net.update({ say: `__ds__:${action}:${seed}:${startTime}:${opts.revision || ""}:${opts.combo ? 1 : 0}`, sayAt: now });
    if (Net.firebaseDsRef) Net.firebaseDsRef.set({ action, seed, startTime, revision: opts.revision || null, combo: !!opts.combo, t: now }).catch(() => {});
  };

  Net.broadcastDayNight = function (targetIsNight) {
    const payload = `__dn__:${targetIsNight ? 1 : 0}:${Date.now()}`;

    // 1. Kênh SignalR trực tiếp
    if (Net.signalRConn && Net.signalRConn.state === "Connected") {
      Net.signalRConn.invoke("TriggerDayNight", { isNight: targetIsNight, time: Date.now() }).catch(() => {});
    }

    // 2. Kênh cập nhật trạng thái người chơi (tương thích mọi backend)
    if (typeof Net.update === "function") {
      Net.update({ say: payload, sayAt: Date.now() });
    }

    // 3. Kênh Firebase
    if (Net.firebaseDnRef) {
      Net.firebaseDnRef.set({ isNight: targetIsNight, t: Date.now() }).catch(() => {});
    }
  };

  Net.start = async function (initial) {
    const urls = [];
    if (window.BACKEND_URL) urls.push(window.BACKEND_URL);
    const azureUrl = "https://baotang-lsd-12222.azurewebsites.net";
    if (!urls.includes(azureUrl)) urls.push(azureUrl);

    for (const u of urls) {
      try {
        setStatus("connecting");
        await startSignalR(u, initial);
        return;
      } catch (e) {
        console.warn("[Bảo tàng] Không kết nối được Backend SignalR tại " + u + ":", e.message || e);
      }
    }
    try {
      const cfg = window.FIREBASE_CONFIG;
      if (cfg && cfg.databaseURL) { setStatus("connecting"); await startFirebase(cfg, initial); return; }
      if (window.claude && typeof window.claude.use === "function") {
        setStatus("connecting");
        if (await startClaude(initial)) return;
      }
    } catch (e) { console.warn("[Bảo tàng] Không kết nối được chế độ nhiều người:", e); }
    Net.mode = "solo"; setStatus("solo");
  };

  window.Net = Net;
})();

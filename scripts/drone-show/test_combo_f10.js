// F10 combo QA: Drone Show -> F8 fireworks at 150 s, music continuous to the end.
//   node scripts/drone-show/test_combo_f10.js   (dev server :5191; real multiplayer hosts are blocked)
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  const checks = [], errors = [];
  const check = (name, ok, detail) => { checks.push(!!ok); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail === undefined ? '' : detail)); };
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED|negotiation|connection|net::|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', (r) => /azurewebsites|firebaseio|localhost:5089/.test(r.url()) ? r.abort() : r.continue());
    await page.goto((process.env.APP_URL || 'http://localhost:5191') + '/?autostart=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.started===true', { timeout: 180000 });
    await page.evaluate(() => { document.activeElement.blur(); Object.assign(player, { x: 0, z: 37, yaw: 0, pitch: 0.68 }); });
    const S = () => page.evaluate(() => ({ ds: DroneShow.getState(), fw: FireworksShow.getState(), audio: +DroneShow.music.currentTime.toFixed(2),
      musicPaused: DroneShow.music.paused, vol: +DroneShow.music.volume.toFixed(3), night: getFireworksState().isNight }));

    await page.keyboard.press('F10');
    await page.waitForFunction('DroneShow.isRunning', { timeout: 120000 });
    let s = await S();
    check('F10 starts drone show in combo mode', s.ds.combo && s.ds.running && !s.fw.running, s.ds);
    check('combo music runs past 150 s (until F8 ends)', s.ds.musicEnd > 200 && s.ds.musicEnd < 235, s.ds.musicEnd);

    await page.keyboard.press('F8'); await sleep(200);
    check('F8 cannot interfere during combo', (await S()).ds.running && !(await S()).fw.running);

    await page.evaluate(() => DroneShow.seek(148)); await sleep(1000);
    check('no F8 before 150 s', !(await S()).fw.running);
    await page.waitForFunction('FireworksShow.isRunning', { timeout: 15000 }); await sleep(600);
    s = await S();
    // F8 clock must equal drone clock minus the 150 s FIREWORKS_END handoff (headless frame rate varies).
    check('handoff: F8 fireworks start at 150 s', s.ds.fireworks && Math.abs(s.fw.elapsed - (s.ds.frameT - 150)) < 0.2, { frameT: s.ds.frameT, fw: s.fw.elapsed });
    check('music keeps playing after 150 s', !s.musicPaused && s.vol > 0.5 && Math.abs(s.audio - s.ds.t) < 0.6, { audio: s.audio, t: s.ds.t, vol: s.vol });
    check('same seed drives F8 choreography', s.fw.seed === s.ds.seed, { fw: s.fw.seed, ds: s.ds.seed });

    await page.evaluate(() => DroneShow.seek(185)); await sleep(800);
    s = await S();
    check('seek into F8 phase catches fireworks up', s.fw.running && Math.abs(s.fw.elapsed - (s.ds.t - 150)) < 0.5, { t: s.ds.t, fw: s.fw.elapsed });
    check('night held during fireworks', s.night);

    await page.evaluate(() => DroneShow.seek(140)); await sleep(500);
    s = await S();
    check('seek back before 150 s stops F8 timeline', !s.fw.running && !s.ds.fireworks && s.ds.running, s.fw);

    await page.evaluate(() => DroneShow.seek(211)); await sleep(1500);
    s = await S();
    check('music fades near the end', !s.musicPaused && s.vol < 0.55, s.vol);
    await sleep(2500);
    s = await S();
    check('music stops after F8 finale', s.musicPaused && s.ds.running, { t: s.ds.t, paused: s.musicPaused });
    await page.waitForFunction('!DroneShow.isRunning', { timeout: 15000 });
    s = await S();
    check('combo ends naturally and restores sky', !s.ds.running && !s.night && !s.fw.running, s);

    // F10 double-press stop during F8 phase clears fireworks too.
    await page.keyboard.press('F10'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(() => DroneShow.seek(160)); await sleep(400);
    await page.keyboard.press('F10'); await sleep(150); await page.keyboard.press('F10'); await sleep(400);
    s = await S();
    check('double F10 stops drones, fireworks and music', !s.ds.running && !s.fw.running && s.musicPaused, s);

    // Plain F9 is unchanged: no F8 timeline after 150 s.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(() => DroneShow.seek(149)); await sleep(2000);
    s = await S();
    check('F9 alone does not hand over to F8', !s.ds.combo && !s.fw.running && s.musicPaused, s);
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // F8 pressed during F9: queued until the flag's own fireworks end (150 s); the flag keeps its timeline.
    const lit = () => page.evaluate(() => { const D = DroneShow; let n = 0; for (let i = 0; i < D.data.N; i++) if (Math.max(D.colArr[i*4], D.colArr[i*4+1], D.colArr[i*4+2]) * D.colArr[i*4+3] >= .004) n++; return n; });
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(() => DroneShow.seek(110)); await sleep(300);
    await page.keyboard.press('F8'); await sleep(300);
    s = await S();
    check('F8 before the flag scene is still ignored', !s.ds.combo && !s.fw.running, s.ds);
    await page.evaluate(() => DroneShow.seek(130)); await sleep(300);
    const sent = await page.evaluate(() => { const saved = Net.update, out = []; Net.update = (p) => out.push(p.say); try { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8', key: 'F8' })); } finally { Net.update = saved; } return out; });
    s = await S();
    check('F8 in the flag scene queues F8 (no fireworks yet, flag still running)', s.ds.combo && s.ds.fwAt === 0 && !s.fw.running && s.ds.running && s.ds.scene === 7, s.ds);
    check('F8 in the flag scene is broadcast as combo for all players', sent.length >= 1 && /^__ds__:start:\d+:\d+:b3-[0-9a-f]+:1$/.test(sent[sent.length - 1]), sent);
    await page.evaluate(() => DroneShow.seek(149.5)); await sleep(200);
    const flagLit = await lit(); s = await S();
    check('flag still lit at 149.5 s, no F8 yet', flagLit > 4000 && !s.fw.running && s.ds.scene === 7, { flagLit, fw: s.fw.running });
    await page.waitForFunction('FireworksShow.isRunning', { timeout: 15000 }); await sleep(500);
    s = await S();
    check('F8 starts when the flag fireworks end (150 s)', Math.abs(s.fw.elapsed - (s.ds.frameT - 150)) < 0.2 && !s.musicPaused, { frameT: s.ds.frameT, fw: s.fw.elapsed, music: !s.musicPaused });
    check('flag timeline untouched (ends at 150 s)', await page.evaluate(() => DroneShowConfig.duration === 150 && DroneShow.data.timeline.formations.at(-1).end === 150));
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // F8 pressed after 150 s (flag fading, music already over): F8 starts at once and the song resumes.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(() => DroneShow.seek(155)); await sleep(500);
    check('F9 music has ended before F8', (await S()).musicPaused);
    await page.keyboard.press('F8'); await sleep(700);
    s = await S();
    check('F8 after 150 s starts immediately with music', s.fw.running && s.fw.elapsed < 1.2 && s.ds.fwAt > 150 && !s.musicPaused && s.ds.musicEnd > 215, { fwAt: s.ds.fwAt, fw: s.fw.elapsed, music: !s.musicPaused, end: s.ds.musicEnd });
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // A peer's F8 (same show seed) upgrades this client's F9 too.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(() => DroneShow.seek(128)); await sleep(300);
    await page.evaluate(() => Net.onDroneShow('start', { seed: DroneShow.seed, startTime: DroneShow.startTime, revision: DroneShowConfig.assetTag, combo: true, fwAt: 0 }));
    s = await S();
    check('peer F8 during flag scene switches this client to combo', s.ds.combo && s.ds.fwAt === 0 && !s.fw.running, s.ds);
    await page.evaluate(() => window.stopDroneShow(false));
    check('no JS errors', !errors.length, errors.slice(0, 5));
  } finally { await browser.close(); }
  console.log(`\n${checks.filter(Boolean).length}/${checks.length} PASS`);
  process.exitCode = checks.every(Boolean) ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });

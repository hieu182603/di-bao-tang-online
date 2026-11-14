// F10 combo QA: Drone Show -> F8 fireworks at 193 s; music belongs to the drones and stops at 193 s.
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
    const url = new URL(process.env.APP_URL || 'http://localhost:5191');
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('QA must target a local museum server');
    url.searchParams.set('autostart','1'); url.searchParams.set('droneStride','1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.started===true', { timeout: 180000 });
    await page.evaluate(() => { document.activeElement.blur(); Net.update = () => {}; Object.assign(player, { x: 0, z: 37, yaw: 0, pitch: 0.68 }); });
    const S = () => page.evaluate(() => ({ ds: DroneShow.getState(), fw: FireworksShow.getState(), audio: +DroneShow.music.currentTime.toFixed(2),
      musicPaused: DroneShow.music.paused, vol: +DroneShow.music.volume.toFixed(3), night: getFireworksState().isNight }));

    await page.keyboard.press('F10');
    await page.waitForFunction('DroneShow.isRunning', { timeout: 120000 });
    const timeline = await page.evaluate(() => JSON.parse(JSON.stringify(DroneShow.data.timeline)));
    const holds = timeline.formations, flag = holds.at(-1), end = timeline.fireworks.find(c => c.name === 'FIREWORKS_END').time;
    const flagMid = (flag.start + flag.end) / 2, flagScene = holds.length;
    check('v6 timeline, 20000 capacity and ten scenes', end === 193 && timeline.duration === end && flag.end === end && flagScene === 10 && await page.evaluate(() => DroneShow.data.N === 20000 && !DroneShowConfig.landing && /^b6-[0-9a-f]{12}$/.test(DroneShowConfig.assetTag)));
    let s = await S();
    check('F10 starts drone show in combo mode', s.ds.combo && s.ds.running && !s.fw.running, s.ds);
    check('combo music ends with the drones (193 s)', s.ds.musicEnd === end, s.ds.musicEnd);

    await page.keyboard.press('F8'); await sleep(200);
    check('F8 cannot interfere during combo', (await S()).ds.running && !(await S()).fw.running);

    await page.evaluate(t => DroneShow.seek(t), end-2); await sleep(1000);
    check('no F8 before 193 s', !(await S()).fw.running);
    await page.waitForFunction('FireworksShow.isRunning', { timeout: 15000 }); await sleep(600);
    s = await S();
    // F8 clock must equal drone clock minus the 193 s FIREWORKS_END handoff (headless frame rate varies).
    check('handoff: F8 fireworks start at 193 s', s.ds.fireworks && Math.abs(s.fw.elapsed - (s.ds.frameT - end)) < 0.2, { frameT: s.ds.frameT, fw: s.fw.elapsed });
    check('music stopped after 193 s while F8 fireworks run', s.musicPaused && s.fw.running, { audio: s.audio, t: s.ds.t, paused: s.musicPaused });
    check('same seed drives F8 choreography', s.fw.seed === s.ds.seed, { fw: s.fw.seed, ds: s.ds.seed });

    await page.evaluate(t => DroneShow.seek(t), end+35); await sleep(800);
    s = await S();
    check('seek into F8 phase catches fireworks up', s.fw.running && Math.abs(s.fw.elapsed - (s.ds.t - end)) < 0.5, { t: s.ds.t, fw: s.fw.elapsed });
    check('night held during fireworks', s.night);

    await page.evaluate(t => DroneShow.seek(t), flagMid); await sleep(500);
    s = await S();
    check('seek back before 193 s stops F8 timeline', !s.fw.running && !s.ds.fireworks && s.ds.running, s.fw);

    // Music fades over the last seconds of the drone show and stops at 193 s; F8 continues without music.
    await page.evaluate(t => DroneShow.seek(t), end-2.5); await sleep(1000);
    s = await S();
    check('music fades before the drones end', !s.musicPaused && s.vol < 0.55, s.vol);
    await page.waitForFunction(t => DroneShow.getState().t >= t && FireworksShow.isRunning, { timeout: 15000 }, end);
    s = await S();
    check('music stops when the drones end, fireworks continue', s.musicPaused && s.ds.running && s.fw.running, { t: s.ds.t, paused: s.musicPaused });
    await page.evaluate(() => DroneShow.seek(DroneShow.showEnd()-.5)); await sleep(500);
    await page.waitForFunction('!DroneShow.isRunning', { timeout: 15000 });
    s = await S();
    check('combo ends naturally and restores sky', !s.ds.running && !s.night && !s.fw.running, s);

    // F10 double-press stop during F8 phase clears fireworks too.
    await page.keyboard.press('F10'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(t => DroneShow.seek(t), end+10); await sleep(400);
    await page.keyboard.press('F10'); await sleep(150); await page.keyboard.press('F10'); await sleep(400);
    s = await S();
    check('double F10 stops drones, fireworks and music', !s.ds.running && !s.fw.running && s.musicPaused, s);

    // Plain F9 is unchanged: no F8 timeline after 193 s.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(t => DroneShow.seek(t), end-1); await sleep(2000);
    s = await S();
    check('F9 alone does not hand over to F8', !s.ds.combo && !s.fw.running && s.musicPaused, s);
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // F8 pressed during F9: queued until the flag's own fireworks end (193 s); the flag keeps its timeline.
    const lit = () => page.evaluate(() => { const D = DroneShow; let n = 0; for (let i = 0; i < D.data.N; i++) if (Math.max(D.colArr[i*4], D.colArr[i*4+1], D.colArr[i*4+2]) * D.colArr[i*4+3] >= .004) n++; return n; });
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(t => DroneShow.seek(t), flag.start-2); await sleep(300);
    await page.keyboard.press('F8'); await sleep(300);
    s = await S();
    check('F8 before the flag scene is still ignored', !s.ds.combo && !s.fw.running, s.ds);
    await page.evaluate(t => DroneShow.seek(t), flagMid); await sleep(300);
    const sent = await page.evaluate(() => { const saved = Net.update, out = []; Net.update = (p) => out.push(p.say); try { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8', key: 'F8' })); } finally { Net.update = saved; } return out; });
    s = await S();
    check('F8 in the flag scene queues F8 (no fireworks yet, flag still running)', s.ds.combo && s.ds.fwAt === 0 && !s.fw.running && s.ds.running && s.ds.scene === flagScene, s.ds);
    check('F8 in the flag scene is broadcast as combo for all players', sent.length >= 1 && /^__ds__:start:\d+:\d+:b6-[0-9a-f]{12}:1$/.test(sent[sent.length - 1]), sent);
    await page.evaluate(t => DroneShow.seek(t), end-.5); await sleep(200);
    const flagLit = await lit(); s = await S();
    check('flag still lit just before handoff, no F8 yet', flagLit === flag.active_count && !s.fw.running && s.ds.scene === flagScene, { flagLit, fw: s.fw.running });
    await page.waitForFunction('FireworksShow.isRunning', { timeout: 15000 }); await sleep(500);
    s = await S();
    check('F8 starts when the flag fireworks end (193 s), without music', Math.abs(s.fw.elapsed - (s.ds.frameT - end)) < 0.2 && s.musicPaused, { frameT: s.ds.frameT, fw: s.fw.elapsed, music: !s.musicPaused });
    check('flag timeline untouched (ends at 193 s)', await page.evaluate(t => DroneShowConfig.duration === t && DroneShow.data.timeline.formations.at(-1).end === t, end));
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // F8 pressed after 193 s (flag fading, music already over): F8 starts at once, still without music.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(t => DroneShow.seek(t), end+2); await sleep(500);
    check('F9 music has ended before F8', (await S()).musicPaused);
    await page.keyboard.press('F8'); await sleep(700);
    s = await S();
    check('F8 after 193 s starts immediately, without music', s.fw.running && s.fw.elapsed < 1.2 && s.ds.fwAt > end && s.musicPaused && s.ds.musicEnd === end, { fwAt: s.ds.fwAt, fw: s.fw.elapsed, music: !s.musicPaused, end: s.ds.musicEnd });
    await page.evaluate(() => window.stopDroneShow(false)); await sleep(300);

    // A peer's F8 (same show seed) upgrades this client's F9 too.
    await page.keyboard.press('F9'); await page.waitForFunction('DroneShow.isRunning', { timeout: 60000 });
    await page.evaluate(t => DroneShow.seek(t), flag.start+1); await sleep(300);
    await page.evaluate(() => Net.onDroneShow('start', { seed: DroneShow.seed, startTime: DroneShow.startTime, revision: DroneShowConfig.assetTag, combo: true, fwAt: 0 }));
    s = await S();
    check('peer F8 during flag scene switches this client to combo', s.ds.combo && s.ds.fwAt === 0 && !s.fw.running, s.ds);
    await page.evaluate(() => window.stopDroneShow(false));
    check('no JS errors', !errors.length, errors.slice(0, 5));
  } finally { await browser.close(); }
  console.log(`\n${checks.filter(Boolean).length}/${checks.length} PASS`);
  process.exitCode = checks.every(Boolean) ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });

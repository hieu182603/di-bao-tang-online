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

    await page.evaluate(() => DroneShow.seek(148)); await sleep(2600);
    s = await S();
    check('handoff: F8 fireworks start at 150 s', s.fw.running && s.ds.fireworks && s.fw.elapsed > 0 && s.fw.elapsed < 1.5, { t: s.ds.t, fw: s.fw.elapsed });
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
    await page.evaluate(() => window.stopDroneShow(false));
    check('no JS errors', !errors.length, errors.slice(0, 5));
  } finally { await browser.close(); }
  console.log(`\n${checks.filter(Boolean).length}/${checks.length} PASS`);
  process.exitCode = checks.every(Boolean) ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });

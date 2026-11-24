const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

(async () => {
  const server = spawn(process.execPath, ['Frontend/dev-server.js'], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { ...process.env, PORT: '5194' }, stdio: 'ignore'
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const poll = () => fetch('http://127.0.0.1:5194').then(resolve).catch(() =>
        Date.now() < deadline ? setTimeout(poll, 100) : reject(Error('Server unavailable')));
      poll();
    });
    browser = await puppeteer.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', r => /azurewebsites|firebaseio|localhost:5089/.test(r.url()) ? r.abort() : r.continue());
    await page.goto('http://127.0.0.1:5194/?autostart=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.started === true', { timeout: 180000 });
    await page.evaluate(() => { document.activeElement.blur(); Net.update = () => {}; });
    await page.keyboard.press('F6');
    await page.waitForFunction('DroneLegacyShow.isRunning', { timeout: 180000 });
    const result = await page.evaluate(() => {
      const s = DroneLegacyShow; s.pause();
      const samples = [];
      for (const t of [6, 12, 16, 33, 52, 72, 92, 111, 116, 118, 120, 122, 124, 137, 150]) {
        s.seek(t);
        const p = s.geo.attributes.position.array, c = s.geo.attributes.aCol.array;
        let minY = Infinity, lit = 0, finite = true;
        for (let i = 0; i < s.data.N; i++) {
          minY = Math.min(minY, p[i * 3 + 1] + DroneLegacyConfig.stage.pivot);
          if (c[i * 4 + 3] > 0.004) lit++;
          for (let j = 0; j < 3; j++) finite = finite && Number.isFinite(p[i * 3 + j]);
        }
        samples.push({ t, minY, lit, finite });
      }
      s.seek(151);
      const combo = s.fwStarted && FireworksShow.isRunning;
      s.stop();
      return { total: s.data.N, scenes: s.data.holds.length, samples, combo, stopped: !s.isRunning && !FireworksShow.isRunning };
    });
    assert.equal(result.total, 22000); assert.equal(result.scenes, 7);
    for (const s of result.samples) {
      assert(s.finite, 'Nonfinite coordinates at ' + s.t);
      assert.equal(s.lit, 22000, 'Fleet not fully visible at ' + s.t);
      assert(s.minY > 10, 'Drone still parked on ground at ' + s.t);
    }
    assert(result.combo, 'F8 did not start at 150s');
    assert(result.stopped, 'Stop did not stop both shows');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result, null, 2));
    console.log('PASS: F6 keyboard start, full-fleet launch, seven scenes, flag morph, F8 handoff, stop, no page exceptions.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_sky_test_' + Date.now());

async function testSky() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--remote-debugging-port=' + PORT,
    '--headless=new',
    '--window-size=1280,720',
    '--user-data-dir=' + TEMP_PROFILE,
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + PORT + '/json', res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (res && res[0] && res[0].webSocketDebuggerUrl) {
        wsUrl = res[0].webSocketDebuggerUrl;
        break;
      }
    } catch(e) {}
  }
  if (!wsUrl) { console.error('No WS'); process.exit(1); }
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((res, rej) => {
      const msgId = id++;
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.id && pending.has(data.id)) {
      const { res, rej } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) rej(data.error); else res(data.result);
    }
  };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:5173/?autostart=1' });

  console.log('Waiting for game to load...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send('Runtime.evaluate', {
      expression: '!document.getElementById("go").disabled'
    });
    if (evalRes.result.value) { console.log('Game loaded at ' + i + 's'); break; }
  }

  // Aim camera at moon position in the sky (-65, 115, -125)
  console.log('Aiming camera at moon position...');
  await send('Runtime.evaluate', {
    expression: 'player.yaw = 2.65; player.pitch = 0.62;'
  });
  await new Promise(r => setTimeout(r, 600));

  // Screenshot in daytime
  console.log('Capturing daytime sky (should be pristine blue with 0 square)...');
  const shotDay1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_sky_day.png', Buffer.from(shotDay1.data, 'base64'));

  // Switch to night
  console.log('Switching to night (F2)...');
  await send('Runtime.evaluate', { expression: 'window.toggleDayNight(true);' });
  await new Promise(r => setTimeout(r, 1500));
  const shotNight = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_sky_night.png', Buffer.from(shotNight.data, 'base64'));

  // Switch back to day
  console.log('Switching back to day (F2)...');
  await send('Runtime.evaluate', { expression: 'window.toggleDayNight(false);' });
  await new Promise(r => setTimeout(r, 1500));
  const shotDay2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_sky_day_after.png', Buffer.from(shotDay2.data, 'base64'));

  const status = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ moonVisible: moonSprite ? moonSprite.visible : null, moonOpacity: moonSprite ? moonSprite.material.opacity : null })'
  });
  console.log('Moon sprite status in daytime:', status.result.value);

  chromeProcess.kill();
  console.log('✅ Done!');
  process.exit(0);
}
testSky();


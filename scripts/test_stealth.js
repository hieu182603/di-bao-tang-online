const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9225;
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_stealth_test_' + Date.now());

async function testStealth() {
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

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const evalRes = await send('Runtime.evaluate', {
      expression: '!document.getElementById("go").disabled'
    });
    if (evalRes.result.value) break;
  }

  // Count logs before
  const getLogsCount = async () => {
    const res = await send('Runtime.evaluate', {
      expression: 'document.querySelectorAll("#logs li, .log-item, #logs > *").length'
    });
    return res.result.value || 0;
  };

  const initialLogs = await getLogsCount();
  console.log('Initial log count:', initialLogs);

  // Press F2 (Day -> Night)
  console.log('Toggling Day -> Night (F2)...');
  await send('Runtime.evaluate', { expression: 'window.toggleDayNight();' });
  await new Promise(r => setTimeout(r, 600));

  // Press F2 (Night -> Day)
  console.log('Toggling Night -> Day (F2)...');
  await send('Runtime.evaluate', { expression: 'window.toggleDayNight();' });
  await new Promise(r => setTimeout(r, 600));

  // Press F1 / F8 (Fireworks)
  console.log('Toggling Fireworks (F1 / F8)...');
  await send('Runtime.evaluate', { expression: 'window.toggleFireworks();' });
  await new Promise(r => setTimeout(r, 600));

  const afterLogs = await getLogsCount();
  console.log('Log count after triggering hidden features:', afterLogs);

  // Inspect any new log texts
  const logTexts = await send('Runtime.evaluate', {
    expression: 'Array.from(document.querySelectorAll("#logs li, .log-item, #logs > *")).map(e => e.textContent.trim())'
  });
  console.log('All visible log items:', logTexts.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_stealth_check.png', Buffer.from(shot.data, 'base64'));

  chromeProcess.kill();
  if (afterLogs === initialLogs) {
    console.log('✅ ZERO notifications added! Hidden features are 100% stealth.');
  } else {
    console.warn('⚠️ Log count changed: from', initialLogs, 'to', afterLogs);
  }
  process.exit(0);
}
testStealth();


const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (!p.includes('node_modules') && !p.includes('.git') && !p.includes('.system_generated')) {
        searchDir(p);
      }
    } else if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css')) {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        if (l.includes('Đã chuyển sang') || l.includes('Bấm F1') || l.includes('fw-timer-bar') || l.includes('fw-badge') || l.includes('fw-countdown') || l.includes('🎉') || l.includes('màn pháo hoa')) {
          console.log(`${p}:${idx + 1}: ${l.trim()}`);
        }
      });
    }
  }
}

searchDir('.');


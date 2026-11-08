// npm run dev: play Brinebound while you work on it.
// Builds the game, serves it to this computer and to your Wi-Fi (so your iPhone can open it), and rebuilds and
// reloads the page whenever you save a file in src/. A reload in the middle of a voyage opens the voyage again,
// so you carry on where you were. Build errors and game errors show on the page itself, and ?debug at the end
// of the address adds an on-screen console.
//   options: --port 8080 (first port to try), --no-open (don't open the browser on this computer)
import { exec } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { bundle, version, ROOT, DEBUG_LOADER } from './bundle.mjs';

const args = process.argv.slice(2);
const firstPort = Number(args[args.indexOf('--port') + 1]) || Number(process.env.PORT) || 8080;
const SRC = path.join(ROOT, 'src');

// ---------------------------------------------------------------- the page the dev server adds to the game
const CLIENT = `<script>(() => {
  // a new build is ready: reload, and if a voyage was under way, open it again afterwards
  const es = new EventSource('/__dev/events');
  es.addEventListener('reload', () => {
    try { const g = window.__brinebound; if (g && (g.state === 'play' || g.state === 'sheet')) sessionStorage.setItem('bbResume', '1'); } catch (e) {}
    location.reload();
  });
  es.addEventListener('builderror', (e) => note('Build failed. The game on screen is the last build that worked. Fix the error below and save again.', e.data));
  es.addEventListener('buildok', () => note(null));
  if (sessionStorage.getItem('bbResume')) {
    sessionStorage.removeItem('bbResume');
    const t0 = Date.now();
    const wait = () => {
      const g = window.__brinebound, b = document.getElementById('bContinue');
      if (g && g.state === 'title' && b && !b.classList.contains('hidden') && !g.busy) g.continueLatest();
      else if (Date.now() - t0 < 30000) setTimeout(wait, 250);
    };
    setTimeout(wait, 250);
  }
  // errors on screen: a phone has no developer tools
  let box = null, last = '', count = 0;
  function note(title, detail) {
    if (!title) { if (box) box.remove(); box = null; last = ''; return; }
    const text = title + (detail ? '\\n\\n' + detail : '');
    if (text === last) { count++; } else { last = text; count = 1; }
    if (!box) {
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;max-height:45vh;overflow:auto;background:rgba(40,8,8,.94);color:#ffd9d0;font:12px/1.45 ui-monospace,Consolas,monospace;padding:10px 12px;border:1px solid #ff8a70;border-radius:8px;white-space:pre-wrap;pointer-events:auto';
      box.addEventListener('click', () => { box.remove(); box = null; last = ''; });
      document.body.appendChild(box);
    }
    box.textContent = text + (count > 1 ? '\\n(' + count + ' times)' : '') + '\\n\\nTap to hide.';
  }
  const where = (s) => String(s || '').replace(/blob:[^\\s)]*|https?:\\/\\/[^\\s)]*\\//g, '');
  addEventListener('error', (e) => { if (e.message) note('Error: ' + e.message, e.error && e.error.stack ? where(e.error.stack) : ''); });
  addEventListener('unhandledrejection', (e) => note('Error: ' + (e.reason && e.reason.message || e.reason), e.reason && e.reason.stack ? where(e.reason.stack) : ''));
  const ce = console.error.bind(console);
  console.error = (...a) => { ce(...a); const x = a.find((v) => v && v.stack); if (x) note('Error: ' + x.message, where(x.stack)); };
})();</script>`;

// ---------------------------------------------------------------- building
let html = null, error = null, building = false, again = null;
const clients = new Set();
const send = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${String(data).replace(/\n/g, '\ndata: ')}\n\n`); };
const stamp = () => new Date().toTimeString().slice(0, 8);

async function rebuild(why) {
  if (building) { again = why; return; }
  building = true;
  const t0 = Date.now();
  try {
    html = await bundle({ sourcemap: true });
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist', 'brinebound.html'), html);
    const was = error; error = null;
    console.log(`${stamp()}  built ${version()} in ${Date.now() - t0} ms${why ? '  (' + why + ')' : ''}`);
    if (was) send('buildok', '');
    if (why) send('reload', '');
  } catch (e) {
    error = String((e && e.message) || e).replace(/^Build failed with \d+ errors?:\n/, '');
    console.log(`${stamp()}  BUILD FAILED  (${why || 'start'})\n${error}\n`);
    send('builderror', error);
  } finally {
    building = false;
    if (again) { const w = again; again = null; rebuild(w); }
  }
}

// ---------------------------------------------------------------- watching src/
let timer = null;
const changed = new Set();
try {
  fs.watch(SRC, { recursive: true }, (ev, file) => {
    if (!file || /(^|[\\/])\.|~$|\.swp$/.test(file)) return;
    changed.add(file.replace(/\\/g, '/'));
    clearTimeout(timer);
    timer = setTimeout(() => { const list = [...changed].join(', '); changed.clear(); rebuild(list); }, 150);
  });
} catch (e) {
  console.log('Could not watch src/ for changes (' + e.message + '). Restart npm run dev after editing.');
}

// ---------------------------------------------------------------- serving
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__dev/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    if (error) res.write(`event: builderror\ndata: ${error.replace(/\n/g, '\ndata: ')}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/brinebound.html') {
    if (!html) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Brinebound did not build. See the terminal for the error, fix it and save.'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html.replace('</head>', () => DEBUG_LOADER + '\n' + CLIENT + '\n</head>'));
    return;
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|vbox|veth|br-|utun|tailscale|zerotier|bluetooth/i.test(name);
      const score = (virtual ? 0 : 4) + (/wi-?fi|wlan|wireless|en0/i.test(name) ? 2 : 0) + (/^192\.168\./.test(a.address) ? 1 : 0);
      out.push({ name, address: a.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

async function start(port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.off('error', reject); resolve(); });
  }).catch((e) => {
    if (e.code === 'EADDRINUSE' && port < firstPort + 20) return start(port + 1);
    throw e;
  });
  return server.address().port;
}

await rebuild(null);
const port = await start(firstPort);
const here = `http://localhost:${port}`;
const lan = lanAddresses();
const phone = lan.length ? `http://${lan[0].address}:${port}` : null;
console.log(`
  Brinebound ${version()} is running.

    On this computer:  ${here}
    On your iPhone:    ${phone || '(no Wi-Fi or network address found)'}${phone ? '   (same Wi-Fi; or scan the code below with the Camera app)' : ''}${lan.length > 1 ? '\n    Other addresses:   ' + lan.slice(1).map((a) => `http://${a.address}:${port} (${a.name})`).join(', ') : ''}
`);
if (phone) {
  try {
    const qr = (await import('qrcode-terminal')).default;
    qr.generate(phone, { small: true }, (q) => console.log(q.replace(/^/gm, '    ')));
  } catch (e) { /* no QR code package: the address above works the same */ }
}
console.log(`  Save any file in src/ and the game rebuilds and reloads by itself.
  Add ?debug to the address for an on-screen console. Press Ctrl+C to stop.
`);
if (!args.includes('--no-open') && !process.env.CI) {
  const cmd = process.platform === 'win32' ? `start "" "${here}"` : process.platform === 'darwin' ? `open "${here}"` : `xdg-open "${here}"`;
  exec(cmd, () => {});
}

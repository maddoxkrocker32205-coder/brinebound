// npm run publish: puts the game in docs/ for GitHub Pages (or any web host), with what an iPhone needs to keep it
// on the home screen like an app: an icon, a name, full screen. Then commit and push in GitHub Desktop.
import fs from 'fs';
import path from 'path';
import { bundle, version, ROOT, DEBUG_LOADER } from './bundle.mjs';

const DOCS = path.join(ROOT, 'docs'), WEB = path.join(ROOT, 'web');
const HEAD = [
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Brinebound">',
  '<meta name="theme-color" content="#0b1d26">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<link rel="icon" type="image/png" href="icon-192.png">',
  '<link rel="manifest" href="manifest.webmanifest">',
  DEBUG_LOADER,
].join('\n');
const MANIFEST = {
  name: 'Brinebound', short_name: 'Brinebound', description: 'A first-person pirate sandbox: mine, build, sail and fight.',
  start_url: './', scope: './', display: 'fullscreen', orientation: 'landscape',
  background_color: '#0b1d26', theme_color: '#0b1d26',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
};

const html = await bundle();
fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, 'index.html'), html.replace('</head>', () => HEAD + '\n</head>'));
for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(WEB, f), path.join(DOCS, f));
fs.writeFileSync(path.join(DOCS, 'manifest.webmanifest'), JSON.stringify(MANIFEST, null, 2) + '\n');
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');   // GitHub Pages: serve the files as they are
console.log(`
  Brinebound ${version()} is ready in docs/ (index.html, icons, manifest).
  Next: in GitHub Desktop, write a summary (e.g. "Publish ${version()}"), click Commit to main, then Push origin.
  A minute later it's live at https://YOUR-NAME.github.io/brinebound/
`);

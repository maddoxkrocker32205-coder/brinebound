// node build.mjs            -> dist/brinebound.html (three.js from the CDN in the import map)
// node build.mjs --offline  -> dist/brinebound-offline.html (three.js built in: runs with no internet, e.g. inside a Unity app)
// add --min to either to minify. npm run build makes both.
import fs from 'fs';
import path from 'path';
import { bundle, ROOT } from './tools/bundle.mjs';

const offline = process.argv.includes('--offline');
const out = await bundle({ offline, minify: process.argv.includes('--min') });
const file = path.join(ROOT, 'dist', offline ? 'brinebound-offline.html' : 'brinebound.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out);
console.log('wrote', path.relative(ROOT, file).replace(/\\/g, '/'), (out.length / 1024).toFixed(1) + ' KB');

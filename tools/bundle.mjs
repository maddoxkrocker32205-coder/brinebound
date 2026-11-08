// The game's build, shared by build.mjs (npm run build), tools/dev.mjs (npm run dev) and tools/publish.mjs
// (npm run publish): bundle src/ with esbuild and put it in src/template.html, giving one HTML file.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// offline: three.js is bundled in rather than loaded from the CDN in the import map
// sourcemap: browser developer tools show errors at their place in src/ (for npm run dev)
export async function bundle({ offline = false, minify = false, sourcemap = false } = {}) {
  const r = await build({
    entryPoints: [path.join(ROOT, 'src', 'main.js')], bundle: true, format: 'esm', external: offline ? [] : ['three', 'three/addons/*'],
    loader: { '.glb': 'dataurl' },
    write: false, minify, target: 'es2020', legalComments: 'none', charset: 'utf8', logLevel: 'silent',
    sourcemap: sourcemap ? 'inline' : false, sourceRoot: sourcemap ? '/' : undefined,
  });
  const js = r.outputFiles[0].text;
  if (js.includes('</script')) throw new Error('The bundle contains "</script", which would end the page\'s script early.');
  let tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
  if (offline) tpl = tpl.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
  return tpl.replace('/*__GAME__*/', () => js);
}

export function version() {
  const m = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8').match(/export const VERSION = '([^']+)'/);
  return m ? m[1] : '?';
}

// ?debug in the address loads an on-screen console (an iPhone has no developer tools of its own)
export const DEBUG_LOADER = '<script>if (/[?&]debug\\b/.test(location.search)) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/eruda"; s.onload = function () { eruda.init(); }; document.head.appendChild(s); }</script>';

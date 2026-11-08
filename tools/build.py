#!/usr/bin/env python3
"""Build Brinebound into one playable HTML file with nothing but Python 3 (no npm, no internet).

    python3 tools/build.py                 -> dist/brinebound.html
    python3 tools/build.py --out game.html

The usual build is `npm install` then `node build.mjs`, which bundles src/ with esbuild. This script is
the fallback for places without Node packages (an AI sandbox, a locked-down computer). It does not
bundle: it keeps every module in src/ exactly as written, stores each one in a
<script type="text/plain"> tag, and a small loader turns them into blob: URLs leaves-first, so
`import { X } from './world.js'` works as it does on a web server. The page still loads three.js
from the CDN in the import map, so it needs an internet connection when it runs, like the
esbuild build.
"""
import argparse, base64, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'src')
IMPORT_RE = re.compile(r"""\b(?:from|import)\s*(['"])\./([\w.-]+)\.js\1""")


def modules():
    mods = {}
    for name in sorted(os.listdir(SRC)):
        if name.endswith('.js'):
            with open(os.path.join(SRC, name), encoding='utf-8') as f:
                code = f.read()
            if name == 'character.js':
                asset = os.path.join(SRC, 'assets', 'human-base-rigged.glb')
                with open(asset, 'rb') as f:
                    data = base64.b64encode(f.read()).decode('ascii')
                code = code.replace(
                    "import humanModelUrl from './assets/human-base-rigged.glb';",
                    "const humanModelUrl = 'data:model/gltf-binary;base64," + data + "';",
                )
            mods[name[:-3]] = code
    return mods


def order(mods, entry='main'):
    """Modules reachable from main.js, each after everything it imports (Brinebound has no import cycles)."""
    out, state = [], {}

    def visit(name, path):
        if state.get(name) == 2:
            return
        if state.get(name) == 1:
            raise SystemExit('Import cycle: ' + ' -> '.join(path + [name]) + '. tools/build.py needs an acyclic import graph; use node build.mjs instead.')
        if name not in mods:
            raise SystemExit(f'{path[-1]}.js imports ./{name}.js, which is not in src/.')
        state[name] = 1
        for m in IMPORT_RE.finditer(mods[name]):
            visit(m.group(2), path + [name])
        state[name] = 2
        out.append(name)

    visit(entry, [])
    return out


LOADER = r"""// Built by tools/build.py: the modules sit unbundled in the script tags above and load from blob: URLs, leaves first.
const ORDER = %s;
const urls = {};
for (const name of ORDER) {
  const tag = document.querySelector('script[data-module="' + name + '"]');
  const code = tag.textContent.replace(/\b(from|import)(\s*)(['"])\.\/([\w.-]+)\.js\3/g, (m, kw, sp, q, dep) => kw + sp + q + urls[dep] + q);
  urls[name] = URL.createObjectURL(new Blob([code + '\n//# sourceURL=brinebound/' + name + '.js\n'], { type: 'text/javascript' }));
}
import(urls.main).catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;left:8px;bottom:8px;color:#f88;background:#000c;padding:8px;z-index:99">Brinebound failed to start: ' + String(e && e.message || e).replace(/</g, '&lt;') + '</pre>'); });"""


def build(out_path):
    with open(os.path.join(SRC, 'template.html'), encoding='utf-8') as f:
        tpl = f.read()
    if tpl.count('/*__GAME__*/') != 1:
        raise SystemExit('src/template.html must contain /*__GAME__*/ exactly once (inside the module script).')
    mods = modules()
    seq = order(mods)
    tags = []
    for name in seq:
        code = mods[name]
        if re.search(r'</script', code, re.I):
            raise SystemExit(f'src/{name}.js contains "</script", which would end its script tag early. Split the string, e.g. "</scr" + "ipt".')
        tags.append(f'<script type="text/plain" data-module="{name}">\n{code}\n</script>\n')
    at = tpl.rfind('<script type="module">', 0, tpl.index('/*__GAME__*/'))
    if at < 0:
        raise SystemExit('Could not find the <script type="module"> that holds /*__GAME__*/ in src/template.html.')
    html = tpl[:at] + ''.join(tags) + tpl[at:]
    html = html.replace('/*__GAME__*/', LOADER % json.dumps(seq), 1)
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    unused = sorted(set(mods) - set(seq))
    print(f'wrote {os.path.relpath(out_path, ROOT)} {len(html.encode("utf-8")) / 1024:.1f} KB, {len(seq)} modules' + (f' (not imported by anything: {", ".join(unused)})' if unused else ''))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'brinebound.html'))
    a = ap.parse_args()
    build(os.path.abspath(a.out))

import asyncio, json, os, sys, subprocess, time
from playwright.async_api import async_playwright

# Paths: the project root is BRINEBOUND_ROOT, else the folder above tests/ (as in the exported project zip).
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('BRINEBOUND_ROOT') or ('/home/claude/brinebound' if os.path.isdir('/home/claude/brinebound/src') else os.path.dirname(HERE))
_three = f'{ROOT}/node_modules/three/build/three.module.min.js'
THREE = open(_three, 'rb').read() if os.path.exists(_three) else None  # served locally when installed, else the CDN is used
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
SHOTS = os.path.join(HERE, 'shots')
os.makedirs(SHOTS, exist_ok=True)

async def setup(p, mobile=False, w=1280, h=720):
    b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    if mobile:
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
    else:
        ctx = await b.new_context(viewport={'width': w, 'height': h})
    page = await ctx.new_page()
    logs = []
    page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    page.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    async def three(route):
        await route.fulfill(status=200, body=THREE, headers={'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*'})
    if THREE: await page.route('https://cdn.jsdelivr.net/**', three)
    await page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', headers={'Content-Type': 'text/css'}))
    await page.route('https://fonts.gstatic.com/**', lambda r: r.abort())
    return b, page, logs

async def load(page):
    await page.goto('http://127.0.0.1:8765/brinebound.html')
    await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=60000)

async def shot(page, name):
    path = f'{SHOTS}/{name}.png'
    await page.screenshot(path=path)
    return path

def serve():
    return subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', f'{ROOT}/dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

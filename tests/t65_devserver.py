import asyncio, sys, os, shutil, subprocess, time, re, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
# npm run dev: serves the game, rebuilds on save, reloads the page and reopens the voyage, shows build errors on
# the page, and serves the same page to a phone on the network. Runs in a scratch copy of the project.
G = 'window.__brinebound'
TMP = '/tmp/bb_devtest'
PORT = 8791
async def main():
    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP)
    for d in ['src', 'tools', 'web']: shutil.copytree(f'{ROOT}/{d}', f'{TMP}/{d}')
    for f in ['build.mjs', 'package.json']: shutil.copy(f'{ROOT}/{f}', f'{TMP}/{f}')
    os.symlink(f'{ROOT}/node_modules', f'{TMP}/node_modules')
    dev = subprocess.Popen(['node', 'tools/dev.mjs', '--no-open', '--port', str(PORT)], cwd=TMP, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = []
    def pump():
        import threading
        def run():
            for line in dev.stdout: out.append(line.rstrip('\n'))
        threading.Thread(target=run, daemon=True).start()
    pump()
    try:
        for _ in range(100):
            if any('Save any file' in l for l in out): break
            await asyncio.sleep(0.1)
        text = '\n'.join(out)
        lan = re.search(r'On your iPhone:\s+(http://[\d.]+:\d+)', text)
        print('banner ok:', 'On this computer:  http://localhost:%d' % PORT in text, '| phone url:', lan.group(1) if lan else None, '| qr lines:', sum(1 for l in out if '▄' in l or '█' in l))
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server'])
            async def page_for(mobile):
                ctx = await (b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True) if mobile else b.new_context(viewport={'width': 960, 'height': 540}))
                pg = await ctx.new_page()
                logs = []
                pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
                pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
                async def cdn(route):
                    u = route.request.url
                    if 'three' in u: await route.fulfill(status=200, body=THREE, headers={'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*'})
                    elif 'eruda' in u: await route.fulfill(status=200, body='window.eruda = { init() { window.__erudaOn = true; } };', headers={'Content-Type': 'text/javascript'})
                    else: await route.abort()
                await pg.route('https://cdn.jsdelivr.net/**', cdn)
                await pg.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', headers={'Content-Type': 'text/css'}))
                await pg.route('https://fonts.gstatic.com/**', lambda r: r.abort())
                await pg.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
                return pg, logs
            pg, logs = await page_for(False)
            await pg.goto(f'http://127.0.0.1:{PORT}/')
            await pg.wait_for_function(f'{G} && {G}.state === "title"', timeout=60000)
            await pg.click('#bStart'); await pg.wait_for_timeout(300)
            await pg.click('#sheet button:has-text("Set sail")')
            await pg.wait_for_function(f'{G}.state === "play"', timeout=30000)
            await pg.wait_for_timeout(1500)
            name = await pg.evaluate(f'() => {G}.look.name')
            await pg.evaluate(f'() => {{ {G}.gold = 57; window.__marker = 1; }}')
            # 1) save a change: the page reloads by itself and goes back into the voyage
            t0 = time.time()
            p = f'{TMP}/src/template.html'; s = open(p).read()
            open(p, 'w').write(s.replace('<b>NEW IN', '<b>DEV EDIT · NEW IN', 1))
            await pg.wait_for_function('!window.__marker', timeout=20000)
            await pg.wait_for_function(f'{G} && {G}.state === "play"', timeout=60000)
            st = await pg.evaluate(f'() => ({{ state: {G}.state, name: {G}.look.name, gold: {G}.gold, news: document.querySelector(".news").textContent.slice(0, 20) }})')
            print(f'1 edit -> reload -> back in the voyage in {time.time() - t0:.1f}s:', st, 'same captain:', st['name'] == name)
            # 2) a syntax error: the game keeps running, and an error box says what broke
            p2 = f'{TMP}/src/shop.js'; s2 = open(p2).read()
            open(p2, 'w').write(s2 + '\nexport const broken = ;\n')
            await pg.wait_for_function("[...document.querySelectorAll('div')].some((d) => d.textContent.startsWith('Build failed'))", timeout=20000)
            box = await pg.evaluate("[...document.querySelectorAll('div')].find((d) => d.textContent.startsWith('Build failed')).textContent.slice(0, 230)")
            print('2 build error box:', box.replace('\n', ' | '))
            print('  still playing:', await pg.evaluate(f'() => {G}.state'))
            open(p2, 'w').write(s2)
            await pg.wait_for_function(f'{G} && {G}.state === "play" && ![...document.querySelectorAll("div")].some((d) => d.textContent.startsWith("Build failed"))', timeout=60000)
            print('  fixed -> rebuilt, reloaded, playing:', await pg.evaluate(f'() => {G}.state'))
            # 3) a game error shows on the page too
            await pg.evaluate("() => { setTimeout(() => { throw new Error('test error from the page'); }, 0); }")
            await pg.wait_for_timeout(600)
            print('3 game error box:', await pg.evaluate("() => !![...document.querySelectorAll('div')].find((d) => d.textContent.includes('test error from the page'))"))
            desktop_errors = [l for l in logs if ('error' in l.lower()) and 'test error' not in l and 'broken' not in l][:4]
            await pg.context.close()   # one game at a time on this machine's software renderer
            # 4) the phone: same page over the network address, touch controls, ?debug console
            if lan:
                mp, mlogs = await page_for(True)
                await mp.goto(lan.group(1) + '/?debug', wait_until='commit')
                await mp.wait_for_function(f'{G} && {G}.state === "title"', timeout=120000)
                await mp.wait_for_timeout(800)
                print('4 phone over the network:', await mp.evaluate(f'() => ({{ state: {G}.state, touch: {G}.isTouch, debugConsole: !!window.__erudaOn, version: document.getElementById("titleEyebrow").textContent }})'))
                await mp.screenshot(path=f'{SHOTS}/t65_phone.png')
                print('  phone errors:', [l for l in mlogs if 'error' in l.lower() and 'favicon' not in l][:3])
            print('desktop errors:', desktop_errors)
            print('server log:', [l for l in out if 'built' in l or 'FAILED' in l][:6])
            await b.close()
    finally:
        dev.terminate()
        shutil.rmtree(TMP, ignore_errors=True)
asyncio.run(main())
